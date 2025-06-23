import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { validateAuth } from './auth';

const db = admin.firestore();

interface UserSessionData {
  credits: {
    available: number;
    total: number;
    used: number;
  };
  subscription: {
    plan: string;
    status: string;
    isActive: boolean;
    currentPeriodEnd?: Date;
  };
  prompts: Array<{
    id: string;
    title: string;
    content: string;
    rating: number;
    hasText: boolean;
  }>;
}

/**
 * Single handshake function to fetch all user session data
 * This implements the "Handshake Principle" for optimized startup
 */
export const getUserSessionData = functions.https.onCall(async (data, context) => {
  try {
    // Validate authentication
    const userId = await validateAuth(context);
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Use Promise.all for concurrent fetching to maximize speed
    const [userDoc, promptsSnapshot] = await Promise.all([
      // Fetch user document (credits, subscription)
      db.collection('users').doc(userId).get(),
      // Fetch all user prompts
      db.collection('users').doc(userId).collection('prompts')
        .orderBy('updatedAt', 'desc')
        .get()
    ]);

    // Check if user document exists
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User document not found');
    }

    const userData = userDoc.data()!;
    const subscription = userData.subscription || {};
    const credits = userData.credits || {};

    // Parse prompts data
    const prompts = promptsSnapshot.docs.map(doc => {
      const promptData = doc.data();
      return {
        id: promptData.id || doc.id,
        title: generatePromptTitle(promptData.rating, promptData.hasText),
        content: promptData.content || '',
        rating: promptData.rating || 1,
        hasText: promptData.hasText || false
      };
    });

    // Construct the consolidated response payload
    const sessionData: UserSessionData = {
      credits: {
        available: credits.available || 0,
        total: credits.total || credits.available || 10, // Fallback to available or default 10
        used: (credits.total || credits.available || 10) - (credits.available || 0)
      },
      subscription: {
        plan: subscription.plan || 'free',
        status: subscription.status || 'inactive',
        isActive: subscription.isActive || false,
        currentPeriodEnd: subscription.currentPeriodEnd?.toDate()
      },
      prompts
    };

    console.log(`[Handshake] Session data fetched for user ${userId}:`, {
      credits: sessionData.credits,
      plan: sessionData.subscription.plan,
      promptCount: prompts.length
    });

    return sessionData;

  } catch (error) {
    console.error('Error in getUserSessionData:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to fetch user session data');
  }
});

/**
 * Generate a user-friendly title for a prompt based on rating and text status
 */
function generatePromptTitle(rating: number, hasText: boolean): string {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const textType = hasText ? 'Detailed' : 'Quick';
  return `${stars} ${textType} Response`;
} 