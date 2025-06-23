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
 */
export const requestAIGeneration = functions.https.onCall(async (data, context) => {
  const startTime = Date.now();
  
  try {
    // Ensure user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, userEmail, systemPrompt, userPrompt, reviewData, aiRequest } = data;

    if (!userId || !userEmail || !systemPrompt || !userPrompt || !aiRequest) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // ATOMIC TRANSACTION: Credit consumption + Job creation
    const result = await db.runTransaction(async (transaction) => {
      // READ: Get user document
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = userDoc.data()!;
      const credits = userData.credits || {};
      const currentCredits = credits.available || 0;

      // CHECK: Validate credits
      if (currentCredits <= 0) {
        return {
          success: false,
          error: 'INSUFFICIENT_CREDITS'
        };
      }

      // CONSUME CREDIT: Update user document
      const newCredits = currentCredits - 1;
      const newUsed = (credits.used || 0) + 1;
      
      transaction.update(userRef, {
        'credits.available': newCredits,
        'credits.used': newUsed,
        'credits.lastUsage': admin.firestore.FieldValue.serverTimestamp()
      });

      // CREATE JOB: Add to generation jobs collection
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

      // CREATE TRANSACTION RECORD
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
          responseType: 'async_ai_generated'
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
      console.log(`[Credit Check Failed] User ${userId}: ${result.error}`);
      if (result.error === 'INSUFFICIENT_CREDITS') {
        throw new functions.https.HttpsError('resource-exhausted', 'Insufficient credits');
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
        executionTime
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