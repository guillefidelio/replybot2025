import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { validateAuth } from './auth';

const db = admin.firestore();

export interface AnalyticsEvent {
  userId: string;
  event: string;
  properties: any;
  timestamp: Date;
  sessionId?: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Log analytics event
 */
export const logAnalytics = functions.https.onCall(async (data, context) => {
  try {
    const userId = await validateAuth(context);
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { event, properties } = data;
    const eventData: AnalyticsEvent = {
      userId,
      event,
      properties,
      timestamp: new Date(),
      sessionId: data.sessionId,
      userAgent: data.userAgent,
      ip: data.ip
    };

    // Store analytics event directly
    await db.collection('users').doc(userId).collection('analytics').add(eventData);

    return { success: true };
  } catch (error) {
    console.error('Error logging analytics:', error);
    throw new functions.https.HttpsError('internal', 'Failed to log analytics');
  }
});

/**
 * Get user analytics
 */
export const getUserAnalytics = functions.https.onCall(async (data, context) => {
  try {
    const userId = await validateAuth(context);
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { startDate, endDate, limit = 100 } = data;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const analyticsSnapshot = await db.collection('users')
      .doc(userId)
      .collection('analytics')
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const events = analyticsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return { events };

  } catch (error) {
    console.error('Error getting user analytics:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get user analytics');
  }
});



/**
 * Part 4: Strategic Analytics Engine
 * Daily Analytics Aggregator Function
 * Runs once every 24 hours to aggregate key business metrics
 */
export const dailyAnalyticsAggregator = functions.pubsub
  .schedule('0 2 * * *') // Run at 2 AM UTC every day
  .timeZone('UTC')
  .onRun(async (context) => {
    const startTime = Date.now();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Set time boundaries for yesterday's data (full day)
    const startOfYesterday = new Date(yesterday);
    startOfYesterday.setHours(0, 0, 0, 0);
    
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    try {
      console.log(`[DailyAnalytics] Starting aggregation for ${yesterday.toISOString().split('T')[0]}`);

      // Aggregate metrics using Promise.all for concurrent processing
      const [
        creditMetrics,
        userMetrics,
        generationMetrics,
        subscriptionMetrics
      ] = await Promise.all([
        aggregateCreditMetrics(startOfYesterday, endOfYesterday),
        aggregateUserMetrics(startOfYesterday, endOfYesterday),
        aggregateGenerationMetrics(startOfYesterday, endOfYesterday),
        aggregateSubscriptionMetrics(startOfYesterday, endOfYesterday)
      ]);

      // Create comprehensive daily report
      const dailyReport = {
        date: yesterday.toISOString().split('T')[0],
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        
        // Credit Analytics
        credits: creditMetrics,
        
        // User Analytics
        users: userMetrics,
        
        // AI Generation Analytics
        aiGeneration: generationMetrics,
        
        // Subscription Analytics
        subscriptions: subscriptionMetrics,
        
        // System Metrics
        system: {
          processingTime: Date.now() - startTime,
          status: 'completed'
        }
      };

      // Write to dailyReports collection
      const reportRef = db.collection('dailyReports').doc(dailyReport.date);
      await reportRef.set(dailyReport);

      console.log(`[DailyAnalytics] Report completed in ${Date.now() - startTime}ms`, dailyReport);
      
      return { success: true, reportId: dailyReport.date };

    } catch (error) {
      console.error('[DailyAnalytics] Error generating daily report:', error);
      
      // Write error report
      const errorReport = {
        date: yesterday.toISOString().split('T')[0],
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime,
        status: 'failed'
      };
      
      await db.collection('dailyReports').doc(errorReport.date).set(errorReport);
      
      throw error;
    }
  });

/**
 * Aggregate credit-related metrics for the given time period
 */
async function aggregateCreditMetrics(startTime: Date, endTime: Date) {
  const creditTransactionsRef = db.collectionGroup('creditTransactions');
  const snapshot = await creditTransactionsRef
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<=', endTime)
    .get();

  let totalCreditsConsumed = 0;
  let totalCreditsAdded = 0;
  let aiGenerationCredits = 0;
  let userTransactionCount = 0;
  const operationCounts: Record<string, number> = {};

  snapshot.forEach(doc => {
    const transaction = doc.data();
    const amount = transaction.amount || 0;
    const operation = transaction.operation || 'unknown';
    
    if (amount < 0) {
      totalCreditsConsumed += Math.abs(amount);
      if (operation.includes('ai_generation') || operation.includes('async_ai_generation')) {
        aiGenerationCredits += Math.abs(amount);
      }
    } else {
      totalCreditsAdded += amount;
    }
    
    userTransactionCount++;
    operationCounts[operation] = (operationCounts[operation] || 0) + 1;
  });

  return {
    totalCreditsConsumed,
    totalCreditsAdded,
    aiGenerationCredits,
    userTransactionCount,
    operationBreakdown: operationCounts,
    netCreditFlow: totalCreditsAdded - totalCreditsConsumed
  };
}

/**
 * Aggregate user-related metrics for the given time period
 */
async function aggregateUserMetrics(startTime: Date, endTime: Date) {
  // Get all users
  const usersSnapshot = await db.collection('users').get();
  
  let totalUsers = 0;
  let activeUsers = 0; // Users who consumed credits
  let newUsers = 0;
  let paidUsers = 0;
  
  const creditUsagePromises = usersSnapshot.docs.map(async (userDoc) => {
    totalUsers++;
    const userData = userDoc.data();
    
    // Check if user was created in the time period
    if (userData.createdAt && userData.createdAt.toDate() >= startTime && userData.createdAt.toDate() <= endTime) {
      newUsers++;
    }
    
    // Check subscription status
    if (userData.subscription?.status === 'active' && userData.subscription?.plan !== 'free') {
      paidUsers++;
    }
    
    // Check for credit usage in the time period
    const creditTransactionsSnapshot = await db
      .collection('users')
      .doc(userDoc.id)
      .collection('creditTransactions')
      .where('timestamp', '>=', startTime)
      .where('timestamp', '<=', endTime)
      .where('amount', '<', 0) // Only consumption transactions
      .limit(1)
      .get();
    
    if (!creditTransactionsSnapshot.empty) {
      activeUsers++;
    }
  });
  
  await Promise.all(creditUsagePromises);

  return {
    totalUsers,
    activeUsers,
    newUsers,
    paidUsers,
    activeUserRate: totalUsers > 0 ? (activeUsers / totalUsers) : 0,
    paidUserRate: totalUsers > 0 ? (paidUsers / totalUsers) : 0
  };
}

/**
 * Aggregate AI generation metrics for the given time period
 */
async function aggregateGenerationMetrics(startTime: Date, endTime: Date) {
  const generationJobsRef = db.collectionGroup('generationJobs');
  const snapshot = await generationJobsRef
    .where('createdAt', '>=', startTime)
    .where('createdAt', '<=', endTime)
    .get();

  let totalJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let totalProcessingTime = 0;
  let completedProcessingTime = 0;

  snapshot.forEach(doc => {
    const job = doc.data();
    totalJobs++;
    
    if (job.status === 'completed') {
      completedJobs++;
      if (job.processingStartedAt && job.completedAt) {
        const processingTime = job.completedAt.toMillis() - job.processingStartedAt.toMillis();
        completedProcessingTime += processingTime;
      }
    } else if (job.status === 'failed') {
      failedJobs++;
    }
    
    if (job.processingStartedAt && job.completedAt) {
      totalProcessingTime += job.completedAt.toMillis() - job.processingStartedAt.toMillis();
    }
  });

  return {
    totalJobs,
    completedJobs,
    failedJobs,
    successRate: totalJobs > 0 ? (completedJobs / totalJobs) : 0,
    averageProcessingTime: completedJobs > 0 ? (completedProcessingTime / completedJobs) : 0,
    totalProcessingTime
  };
}

/**
 * Aggregate subscription-related metrics for the given time period
 */
async function aggregateSubscriptionMetrics(startTime: Date, endTime: Date) {
  const usersSnapshot = await db.collection('users').get();
  
  const subscriptionCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  let totalSubscriptions = 0;
  
  usersSnapshot.forEach(doc => {
    const userData = doc.data();
    const subscription = userData.subscription;
    
    if (subscription) {
      totalSubscriptions++;
      
      // Count by plan
      const plan = subscription.plan || 'unknown';
      subscriptionCounts[plan] = (subscriptionCounts[plan] || 0) + 1;
      
      // Count by status
      const status = subscription.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
  });

  return {
    totalSubscriptions,
    planBreakdown: subscriptionCounts,
    statusBreakdown: statusCounts
  };
}
