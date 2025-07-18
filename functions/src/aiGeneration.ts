import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { logAIGeneration } from './audit';

const db = admin.firestore();

// Job status types
type JobStatus = 'pending' | 'completed' | 'failed';

// Generation job interface
interface GenerationJob {
  id: string;
  userId: string;
  status: JobStatus;
  systemPrompt: string;
  userPrompt: string;
  reviewData: {
    id: string;
    reviewer: string;
    rating: number;
    text: string;
  };
  aiRequest: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
    temperature: number;
  };
  aiResponse?: string;
  error?: string;
  createdAt: admin.firestore.FieldValue;
  completedAt?: admin.firestore.FieldValue;
  processingStartedAt?: admin.firestore.FieldValue;
}

/**
 * Part 1.2: Lightning-Fast Callable Function - requestAIGeneration
 * Atomically consumes credit and creates job, returns immediately (< 500ms)
 * 
 * NEW: Implements business-level free trial lock with admin override
 */
export const requestAIGeneration = functions.https.onCall(async (data, context) => {
  const startTime = Date.now();
  
  try {
    // Ensure user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, userEmail, systemPrompt, userPrompt, reviewData, aiRequest, businessId } = data;

    if (!userId || !userEmail || !systemPrompt || !userPrompt || !aiRequest) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // DEBUG: Log business ID information
    console.log(`[DEBUG] Request from user ${userId}`);
    console.log(`[DEBUG] Business ID received:`, businessId);
    console.log(`[DEBUG] Business ID type:`, typeof businessId);
    console.log(`[DEBUG] Business ID length:`, businessId ? businessId.length : 'null');

    // ATOMIC TRANSACTION: Admin check + Business lock check + Credit consumption + Job creation
    const result = await db.runTransaction(async (transaction) => {
      // STEP 1: Get user document and check for admin role
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = userDoc.data()!;
      const userRole = userData.role;

      // STEP 2: Admin Bypass Logic
      if (userRole === 'admin') {
        console.log(`[Admin Access] User ${userId} is admin - bypassing all checks`);
        
        // CREATE JOB: Add to generation jobs collection (no credit consumption for admins)
        const jobRef = db.collection('users').doc(userId).collection('generationJobs').doc();
        const jobId = jobRef.id;
        
        const jobData: GenerationJob = {
          id: jobId,
          userId,
          status: 'pending',
          systemPrompt,
          userPrompt,
          reviewData,
          aiRequest,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        transaction.set(jobRef, jobData);

        // CREATE TRANSACTION RECORD (for audit purposes, but no credit deduction)
        const transactionRef = db.collection('users').doc(userId).collection('creditTransactions').doc();
        transaction.set(transactionRef, {
          id: transactionRef.id,
          userId,
          type: 'admin_usage',
          amount: 0, // No credit consumed for admins
          operation: 'async_ai_generation_admin',
          metadata: {
            jobId,
            reviewId: reviewData?.id,
            responseType: 'async_ai_generated_admin',
            businessId: businessId || 'unknown'
          },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          balanceAfter: 9999, // Special value to indicate unlimited
          description: `Admin AI generation job ${jobId} created`
        });

        return {
          success: true,
          jobId,
          newCreditBalance: 9999 // Special value to indicate unlimited for UI
        };
      }

      // STEP 3: For non-admin users, check business trial lock
      if (businessId) {
        console.log(`[DEBUG] Checking business trial for ID: ${businessId}`);
        
        // Use a single document per business for atomic trial tracking
        const businessLockRef = db.collection('businessLocks').doc(businessId);
        const businessLockDoc = await transaction.get(businessLockRef);
        
        if (businessLockDoc.exists) {
          const lockData = businessLockDoc.data()!;
          console.log(`[Business Lock BLOCKED] Business ${businessId} trial already used by user ${lockData.firstUsedBy} (${lockData.userEmail})`);
          console.log(`[Business Lock BLOCKED] Current user ${userId} (${userEmail}) attempting to use trial again`);
          console.log(`[Business Lock BLOCKED] Lock document path: businessLocks/${businessId}`);
          console.log(`[Business Lock BLOCKED] First used on: ${lockData.firstUsedAt?.toDate()}`);
          return {
            success: false,
            error: 'TRIAL_ALREADY_USED'
          };
        }

        console.log(`[DEBUG] Business ${businessId} trial available`);
      } else {
        console.log(`[DEBUG] No business ID provided - skipping business lock check`);
      }

      // STEP 4: Standard user credit validation
      const credits = userData.credits || {};
      const currentCredits = credits.available || 0;

      // CHECK: Validate credits
      if (currentCredits <= 0) {
        return {
          success: false,
          error: 'INSUFFICIENT_CREDITS'
        };
      }

      // STEP 5: CONSUME CREDIT: Update user document
      const newCredits = currentCredits - 1;
      const newUsed = (credits.used || 0) + 1;
      
      transaction.update(userRef, {
        'credits.available': newCredits,
        'credits.used': newUsed,
        'credits.lastUsage': admin.firestore.FieldValue.serverTimestamp()
      });

      // STEP 6: CREATE BUSINESS LOCK (if businessId provided)
      if (businessId) {
        const businessLockRef = db.collection('businessLocks').doc(businessId);
        // Create the lock atomically (will only succeed if document doesn't exist)
        transaction.set(businessLockRef, {
          businessId,
          firstUsedBy: userId,
          firstUsedAt: admin.firestore.FieldValue.serverTimestamp(),
          userEmail,
          reviewId: reviewData?.id,
          extractionMethod: 'data-lid' // Track how business ID was extracted
        });
        console.log(`[Business Lock Created] Business ${businessId} marked as trial used by user ${userId}`);
        console.log(`[Business Lock Created] Lock document path: businessLocks/${businessId}`);
      }

      // STEP 7: CREATE JOB: Add to generation jobs collection
      const jobRef = db.collection('users').doc(userId).collection('generationJobs').doc();
      const jobId = jobRef.id;
      
      const jobData: GenerationJob = {
        id: jobId,
        userId,
        status: 'pending',
        systemPrompt,
        userPrompt,
        reviewData,
        aiRequest,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(jobRef, jobData);

      // STEP 8: CREATE TRANSACTION RECORD
      const transactionRef = db.collection('users').doc(userId).collection('creditTransactions').doc();
      transaction.set(transactionRef, {
        id: transactionRef.id,
        userId,
        type: 'usage',
        amount: -1,
        operation: 'async_ai_generation',
        metadata: {
          jobId,
          reviewId: reviewData?.id,
          responseType: 'async_ai_generated',
          businessId: businessId || 'unknown'
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        balanceAfter: newCredits,
        description: `Async AI generation job ${jobId} created`
      });

      return {
        success: true,
        jobId,
        newCreditBalance: newCredits
      };
    });

    const executionTime = Date.now() - startTime;
    console.log(`[requestAIGeneration] Execution time: ${executionTime}ms`);

    // Handle transaction results
    if (!result.success) {
      console.log(`[Request Failed] User ${userId}: ${result.error}`);
      if (result.error === 'INSUFFICIENT_CREDITS') {
        throw new functions.https.HttpsError('resource-exhausted', 'Insufficient credits');
      }
      if (result.error === 'TRIAL_ALREADY_USED') {
        throw new functions.https.HttpsError('permission-denied', 'Free trial for this business has already been used. Please upgrade to continue.');
      }
      throw new functions.https.HttpsError('internal', result.error || 'Transaction failed');
    }

    // REMOVE NOISE: Use specialized AI logging function instead
    // This removes noise by not logging every request
    // await logAIGeneration(userId, 'requested', result.jobId, { ... });

    // Return immediate response (target < 500ms)
    return result;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('Error in requestAIGeneration:', error);
    
    // Log failed operation
    await logAIGeneration(
      data.userId || 'unknown',
      'failed',
      'request_failed',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        businessId: data.businessId || 'unknown'
      }
    );

    // Re-throw Firebase errors, wrap others
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
});

/**
 * Part 1.3: Background Cloud Function - processAIGeneration
 * Triggered by onCreate event on generationJobs collection
 */
export const processAIGeneration = functions.firestore
  .document('users/{userId}/generationJobs/{jobId}')
  .onCreate(async (snapshot, context) => {
    const startTime = Date.now();
    const { userId, jobId } = context.params;
    
    try {
      const jobData = snapshot.data() as GenerationJob;
      console.log(`[processAIGeneration] Processing job ${jobId} for user ${userId}`);

      // Update job status to indicate processing has started
      await snapshot.ref.update({
        processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Call OpenAI API
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${functions.config().openai.api_key}`
        },
        body: JSON.stringify(jobData.aiRequest)
      });

      if (!openaiResponse.ok) {
        throw new Error(`OpenAI API error: ${openaiResponse.status} ${openaiResponse.statusText}`);
      }

      const openaiData = await openaiResponse.json();
      const aiResponse = openaiData.choices?.[0]?.message?.content;

      if (!aiResponse) {
        throw new Error('No response text from OpenAI');
      }

      // Update job with successful result
      await snapshot.ref.update({
        status: 'completed',
        aiResponse,
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const executionTime = Date.now() - startTime;
      console.log(`[processAIGeneration] Job ${jobId} completed in ${executionTime}ms`);

      // Log successful operation
      await logAIGeneration(userId, 'completed', jobId, {
        reviewId: jobData.reviewData?.id,
        success: true,
        processingTime: executionTime
      });

    } catch (error) {
      console.error(`[processAIGeneration] Error processing job ${jobId}:`, error);
      
      // Update job with error status
      await snapshot.ref.update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown processing error',
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Log failed operation
      await logAIGeneration(userId, 'failed', jobId, {
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });
    }
  }); 