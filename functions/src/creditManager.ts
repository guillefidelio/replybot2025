import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { auditLog } from './audit';
import { validateAuth } from './auth';
// import { rateLimitMiddleware } from './rateLimiter';

const db = admin.firestore();



// interface ConsumeResult {
//   success: boolean;
//   remainingCredits: number;
//   transactionId?: string;
//   error?: string;
// }

/**
 * Task 5.1: Consume credits with atomic Firestore transactions
 */
export const consumeCredit = functions.https.onCall(async (data, context) => {
  try {
    // Validate authentication
    const userId = await validateAuth(context);
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { amount = 1, operation = 'ai_response', metadata = {} } = data;

    // Validate input
    if (typeof amount !== 'number' || amount <= 0 || amount > 100) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid credit amount');
    }

    // Use atomic transaction to consume credits
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;
      const currentCredits = userData.subscription?.currentCredits || 0;
      const isActive = userData.subscription?.isActive || false;

      // Check if user has enough credits
      if (currentCredits < amount) {
        return {
          success: false,
          remainingCredits: currentCredits,
          error: 'Insufficient credits'
        };
      }

      // Check if subscription is active
      if (!isActive) {
        return {
          success: false,
          remainingCredits: currentCredits,
          error: 'Subscription inactive'
        };
      }

      // Consume credits
      const newCredits = currentCredits - amount;
      transaction.update(userRef, {
        'subscription.currentCredits': newCredits,
        'subscription.lastUsed': admin.firestore.FieldValue.serverTimestamp()
      });

      // Create transaction record
      const transactionId = db.collection('users').doc(userId).collection('creditTransactions').doc().id;
      const transactionRef = db.collection('users').doc(userId).collection('creditTransactions').doc(transactionId);
      
      transaction.set(transactionRef, {
        id: transactionId,
        userId,
        type: 'consumption',
        amount: -amount,
        operation,
        metadata,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        balanceAfter: newCredits,
        status: 'completed'
      });

      return {
        success: true,
        remainingCredits: newCredits,
        transactionId
      };
    });

    // Log the operation
    await auditLog({
      userId,
      action: 'credit_consumed',
      details: {
        amount,
        operation,
        success: result.success,
        remainingCredits: result.remainingCredits
      },
      timestamp: new Date()
    });

    return result;

  } catch (error) {
    console.error('Error consuming credits:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to consume credits');
  }
});

/**
 * Task 5.2: Get credit status with caching optimization (Callable Function)
 */
export const getCreditStatus = functions.https.onCall(async (data, context) => {
  try {
    // Validate authentication
    const userId = await validateAuth(context);
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Get user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data()!;
    const subscription = userData.subscription || {};
    const credits = userData.credits || {};

    const creditStatus = {
      hasCredits: (credits.available || 0) > 0,
      available: credits.available || 0,
      used: credits.used || 0,
      total: credits.total || 10,
      required: 1,
      canProceed: (credits.available || 0) > 0,
      message: (credits.available || 0) > 0 ? 'Credits available' : 'No credits remaining',
      plan: subscription.plan || 'free',
      resetDate: credits.resetDate?.toDate() || new Date()
    };

    // Log access
    await auditLog({
      userId,
      action: 'credit_status_checked',
      details: creditStatus,
      timestamp: new Date()
    });

    return creditStatus;

  } catch (error) {
    console.error('Error getting credit status:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to get credit status');
  }
});

/**
 * HTTP version of getCreditStatus for extension compatibility
 */
export const getCreditStatusHttp = functions.https.onRequest(async (req, res) => {
  try {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { userId, userEmail, operation } = req.body;

    if (!userId || !userEmail) {
      res.status(400).json({ error: 'Missing userId or userEmail' });
      return;
    }

    // Get user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userData = userDoc.data()!;
    const subscription = userData.subscription || {};
    const credits = userData.credits || {};

    const creditStatus = {
      hasCredits: (credits.available || 0) > 0,
      available: credits.available || 0,
      used: credits.used || 0,
      total: credits.total || 10,
      required: 1,
      canProceed: (credits.available || 0) > 0,
      message: (credits.available || 0) > 0 ? 'Credits available' : 'No credits remaining',
      plan: subscription.plan || 'free',
      resetDate: credits.resetDate?.toDate() || new Date()
    };

    // Log access
    await auditLog({
      userId,
      action: 'credit_status_checked',
      details: { operation, creditStatus },
      timestamp: new Date()
    });

    res.status(200).json(creditStatus);

  } catch (error) {
    console.error('Error getting credit status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * HTTP version of consumeCredit with AI generation for extension compatibility
 */
export const consumeCreditHttp = functions.https.onRequest(async (req, res) => {
  try {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { userId, userEmail, operation, reviewData, aiRequest } = req.body;

    if (!userId || !userEmail || !aiRequest) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Use atomic transaction to consume credits and prepare response
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = userDoc.data()!;
      const credits = userData.credits || {};
      const currentCredits = credits.available || 0;

      // Check if user has enough credits
      if (currentCredits < 1) {
        return {
          success: false,
          error: 'Insufficient credits',
          creditInfo: {
            available: currentCredits,
            required: 1,
            hasCredits: false
          }
        };
      }

      // Consume 1 credit
      const newCredits = currentCredits - 1;
      const newUsed = (credits.used || 0) + 1;
      
      transaction.update(userRef, {
        'credits.available': newCredits,
        'credits.used': newUsed,
        'credits.lastUsage': admin.firestore.FieldValue.serverTimestamp()
      });

      // Create transaction record
      const transactionId = db.collection('users').doc(userId).collection('creditTransactions').doc().id;
      const transactionRef = db.collection('users').doc(userId).collection('creditTransactions').doc(transactionId);
      
      transaction.set(transactionRef, {
        id: transactionId,
        userId,
        type: 'usage',
        amount: -1,
        operation: operation || 'individual_response',
        metadata: {
          reviewId: reviewData?.id,
          responseType: 'ai_generated'
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        balanceAfter: newCredits,
        description: `AI response generated for review ${reviewData?.id || 'unknown'}`
      });

      return {
        success: true,
        remainingCredits: newCredits,
        transactionId,
        creditInfo: {
          available: newCredits,
          used: newUsed,
          total: credits.total || 10,
          hasCredits: newCredits > 0
        }
      };
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    // Now make the OpenAI API call
    try {
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${functions.config().openai.api_key}`
        },
        body: JSON.stringify(aiRequest)
      });

      if (!openaiResponse.ok) {
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      const openaiData = await openaiResponse.json();
      const responseText = openaiData.choices?.[0]?.message?.content;

      if (!responseText) {
        throw new Error('No response text from OpenAI');
      }

      // Log successful operation
      await auditLog({
        userId,
        action: 'ai_response_generated',
        details: {
          operation,
          reviewId: reviewData?.id,
          success: true,
          creditsConsumed: 1,
          remainingCredits: result.remainingCredits
        },
        timestamp: new Date()
      });

      res.status(200).json({
        success: true,
        data: {
          responseText,
          creditInfo: result.creditInfo,
          transactionId: result.transactionId
        }
      });

    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      
      // Since we already consumed the credit, we should log this as a failed generation
      await auditLog({
        userId,
        action: 'ai_response_failed',
        details: {
          operation,
          reviewId: reviewData?.id,
          error: openaiError instanceof Error ? openaiError.message : 'Unknown error',
          creditsConsumed: 1,
          remainingCredits: result.remainingCredits
        },
        timestamp: new Date()
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate AI response',
        creditInfo: result.creditInfo
      });
    }

  } catch (error) {
    console.error('Error in consumeCreditHttp:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * Task 5.4: Manual credit adjustment for support (admin only)
 */
export const adjustCredits = functions.https.onCall(async (data, context) => {
  try {
    // Validate authentication and admin role
    const adminUserId = await validateAuth(context);
    if (!adminUserId) {
      throw new functions.https.HttpsError('unauthenticated', 'Admin must be authenticated');
    }

    // Check if user has admin role
    const adminRef = db.collection('users').doc(adminUserId);
    const adminDoc = await adminRef.get();
    const adminRole = adminDoc.data()?.role;

    if (adminRole !== 'admin' && adminRole !== 'support') {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
    }

    const { userId, amount, reason, type = 'manual_adjustment' } = data;

    // Validate input
    if (!userId || typeof amount !== 'number' || !reason) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // Use atomic transaction to adjust credits
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Target user not found');
      }

      const userData = userDoc.data()!;
      const currentCredits = userData.subscription?.currentCredits || 0;
      const newCredits = Math.max(0, currentCredits + amount);

      // Update user credits
      transaction.update(userRef, {
        'subscription.currentCredits': newCredits,
        'subscription.lastModified': admin.firestore.FieldValue.serverTimestamp()
      });

      // Create transaction record
      const transactionId = db.collection('users').doc(userId).collection('creditTransactions').doc().id;
      const transactionRef = db.collection('users').doc(userId).collection('creditTransactions').doc(transactionId);
      
      transaction.set(transactionRef, {
        id: transactionId,
        userId,
        type,
        amount,
        reason,
        adminUserId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        balanceAfter: newCredits,
        status: 'completed'
      });

      return {
        success: true,
        previousCredits: currentCredits,
        newCredits,
        transactionId
      };
    });

    // Log the admin action
    await auditLog({
      userId: adminUserId,
      action: 'credit_adjusted',
      details: {
        targetUserId: userId,
        amount,
        reason,
        type,
        result
      },
      timestamp: new Date()
    });

    return result;

  } catch (error) {
    console.error('Error adjusting credits:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to adjust credits');
  }
});

/**
 * Batch credit operations for efficiency
 */
export const batchCreditOperations = functions.https.onCall(async (data, context) => {
  try {
    const userId = await validateAuth(context);
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { operations } = data;

    if (!Array.isArray(operations) || operations.length === 0 || operations.length > 10) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid operations array');
    }

    const results = [];

    // Process operations in batches
    const batch = db.batch();
    const userRef = db.collection('users').doc(userId);

    for (const operation of operations) {
      const { type, amount, metadata } = operation;
      
      // Create transaction record
      const transactionRef = userRef.collection('creditTransactions').doc();
      batch.set(transactionRef, {
        id: transactionRef.id,
        userId,
        type,
        amount,
        metadata,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: 'completed'
      });

      results.push({
        operationId: transactionRef.id,
        type,
        amount,
        status: 'queued'
      });
    }

    await batch.commit();

    return {
      success: true,
      operations: results,
      processedCount: operations.length
    };

  } catch (error) {
    console.error('Error in batch credit operations:', error);
    throw new functions.https.HttpsError('internal', 'Failed to process batch operations');
  }
}); 