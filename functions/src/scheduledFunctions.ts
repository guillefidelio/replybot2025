import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { auditLog, LogLevel, logSecurityEvent } from './audit';

const db = admin.firestore();

/**
 * Task 5.3: Monthly credit reset scheduled function
 * Runs on the 1st of every month at 00:00 UTC
 */
export const monthlyReset = functions.pubsub.schedule('0 0 1 * *').timeZone('UTC').onRun(async (context) => {
  try {
    console.log('Starting monthly credit reset...');
    
    let processedUsers = 0;
    let errorCount = 0;
    const batchSize = 500;
    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;

    while (true) {
      // Get users in batches to avoid memory issues
      let query = db.collection('users')
        .where('subscription.isActive', '==', true)
        .limit(batchSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        break; // No more users to process
      }

      const batch = db.batch();
      const resetDate = new Date();
      
      for (const userDoc of snapshot.docs) {
        try {
          const userData = userDoc.data();
          const subscription = userData.subscription || {};
          
          // Calculate new credit allocation based on plan
          const newCredits = getMonthlyCreditsForPlan(subscription.plan || 'free');
          
          // Reset credits and update reset date
          batch.update(userDoc.ref, {
            'subscription.currentCredits': newCredits,
            'subscription.resetDate': resetDate,
            'subscription.lastReset': admin.firestore.FieldValue.serverTimestamp(),
            'subscription.creditsUsedThisMonth': 0
          });

          // Create reset transaction record
          const transactionRef = userDoc.ref.collection('creditTransactions').doc();
          batch.set(transactionRef, {
            id: transactionRef.id,
            userId: userDoc.id,
            type: 'monthly_reset',
            amount: newCredits,
            balanceAfter: newCredits,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
              plan: subscription.plan,
              resetType: 'scheduled_monthly',
              previousCredits: subscription.currentCredits || 0
            },
            status: 'completed'
          });

          processedUsers++;
        } catch (userError) {
          console.error(`Error processing user ${userDoc.id}:`, userError);
          errorCount++;
        }
      }

      // Commit the batch
      await batch.commit();
      
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      
      console.log(`Processed batch: ${snapshot.docs.length} users, Total: ${processedUsers}`);
      
      // Add delay to avoid overwhelming Firestore
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Log the reset operation
    await auditLog({
      userId: 'system',
      action: 'monthly_credit_reset',
      level: LogLevel.CRITICAL,
      details: {
        processedUsers,
        errorCount,
        resetDate: new Date(),
        executionTime: Date.now()
      },
      timestamp: new Date()
    });

    console.log(`Monthly reset completed. Processed: ${processedUsers}, Errors: ${errorCount}`);
    
    return {
      success: true,
      processedUsers,
      errorCount,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in monthly reset:', error);
    
    // Log the error
          await logSecurityEvent({
        type: 'suspicious_activity',
        details: {
          error: 'Monthly reset failed',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        },
        severity: 'high',
        timestamp: new Date()
      });

    throw error;
  }
});

/**
 * Weekly cleanup function - runs every Sunday at 02:00 UTC
 */
export const weeklyCleanup = functions.pubsub.schedule('0 2 * * 0').timeZone('UTC').onRun(async (context) => {
  try {
    console.log('Starting weekly cleanup...');
    
    const results = {
      expiredSessions: 0,
      oldTransactions: 0,
      inactiveUsers: 0
    };

    // Clean up expired sessions
    const expiredSessionsSnapshot = await db.collection('userSessions')
      .where('expiresAt', '<', new Date())
      .limit(1000)
      .get();

    if (!expiredSessionsSnapshot.empty) {
      const batch = db.batch();
      expiredSessionsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      results.expiredSessions = expiredSessionsSnapshot.docs.length;
    }

    // Archive old credit transactions (older than 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const oldTransactionsSnapshot = await db.collectionGroup('creditTransactions')
      .where('timestamp', '<', sixMonthsAgo)
      .limit(1000)
      .get();

    if (!oldTransactionsSnapshot.empty) {
      const batch = db.batch();
      for (const doc of oldTransactionsSnapshot.docs) {
        // Move to archive collection
        const archiveRef = db.collection('archivedTransactions').doc(doc.id);
        batch.set(archiveRef, { ...doc.data(), archivedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.delete(doc.ref);
      }
      await batch.commit();
      results.oldTransactions = oldTransactionsSnapshot.docs.length;
    }

    // Mark inactive users (no activity for 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const inactiveUsersSnapshot = await db.collection('users')
      .where('lastActivity', '<', ninetyDaysAgo)
      .where('subscription.isActive', '==', true)
      .limit(100)
      .get();

    if (!inactiveUsersSnapshot.empty) {
      const batch = db.batch();
      inactiveUsersSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          'subscription.isActive': false,
          'subscription.inactiveReason': 'no_activity_90_days',
          'subscription.deactivatedAt': admin.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      results.inactiveUsers = inactiveUsersSnapshot.docs.length;
    }

    console.log('Weekly cleanup completed:', results);
    return results;

  } catch (error) {
    console.error('Error in weekly cleanup:', error);
    throw error;
  }
});

/**
 * Daily security scan - runs every day at 03:00 UTC
 */
export const dailySecurityScan = functions.pubsub.schedule('0 3 * * *').timeZone('UTC').onRun(async (context) => {
  try {
    console.log('Starting daily security scan...');
    
    const results = {
      suspiciousUsers: 0,
      blockedUsers: 0,
      securityAlerts: 0
    };

    // Scan for suspicious activity patterns
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Find users with excessive credit consumption
    const suspiciousUsersSnapshot = await db.collectionGroup('creditTransactions')
      .where('timestamp', '>=', yesterday)
      .where('type', '==', 'consumption')
      .get();

    const userConsumption = new Map<string, number>();
    
    suspiciousUsersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const userId = data.userId;
      const amount = Math.abs(data.amount || 0);
      userConsumption.set(userId, (userConsumption.get(userId) || 0) + amount);
    });

    // Check for users exceeding reasonable daily limits
    for (const [userId, consumption] of userConsumption.entries()) {
      if (consumption > 1000) { // More than 1000 credits in a day
        results.suspiciousUsers++;
        
        // Log suspicious activity
        await logSecurityEvent({
          type: 'suspicious_activity',
          userId,
          details: {
            dailyConsumption: consumption,
            date: yesterday.toISOString(),
            reason: 'Excessive daily credit consumption'
          },
          severity: 'medium',
          timestamp: new Date()
        });

        // Auto-block if consumption is extremely high
        if (consumption > 5000) {
          await db.collection('users').doc(userId).update({
            'security.blocked': true,
            'security.blockReason': 'Automatic block: Excessive credit consumption',
            'security.blockedAt': admin.firestore.FieldValue.serverTimestamp(),
            'security.blockedUntil': new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
          });
          results.blockedUsers++;
        }
      }
    }

    // Scan for failed login attempts
    const failedLoginsSnapshot = await db.collection('securityLogs')
      .where('type', '==', 'failed_login')
      .where('timestamp', '>=', yesterday)
      .get();

    const ipFailures = new Map<string, number>();
    
    failedLoginsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const ip = data.ip;
      if (ip) {
        ipFailures.set(ip, (ipFailures.get(ip) || 0) + 1);
      }
    });

    // Block IPs with excessive failed login attempts
    for (const [ip, failures] of ipFailures.entries()) {
      if (failures > 50) { // More than 50 failed attempts from same IP
        await db.collection('blockedIPs').doc(ip).set({
          ip,
          reason: 'Excessive failed login attempts',
          failures,
          blockedAt: admin.firestore.FieldValue.serverTimestamp(),
          blockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });
        
        results.securityAlerts++;
        
        await logSecurityEvent({
          type: 'suspicious_activity',
          details: {
            ip,
            failures,
            action: 'ip_blocked',
            reason: 'Excessive failed login attempts'
          },
          severity: 'high',
          timestamp: new Date()
        });
      }
    }

    console.log('Daily security scan completed:', results);
    return results;

  } catch (error) {
    console.error('Error in daily security scan:', error);
    throw error;
  }
});

/**
 * Subscription expiry check - runs daily at 01:00 UTC
 */
export const checkSubscriptionExpiry = functions.pubsub.schedule('0 1 * * *').timeZone('UTC').onRun(async (context) => {
  try {
    console.log('Checking subscription expiry...');
    
    const today = new Date();
    let processedCount = 0;
    let expiredCount = 0;

    // Find subscriptions that expire today or have already expired
    const expiringSnapshot = await db.collection('users')
      .where('subscription.isActive', '==', true)
      .where('subscription.expiresAt', '<=', today)
      .limit(1000)
      .get();

    if (!expiringSnapshot.empty) {
      const batch = db.batch();
      
      for (const userDoc of expiringSnapshot.docs) {
        const userData = userDoc.data();
        const subscription = userData.subscription || {};
        
        // Deactivate subscription
        batch.update(userDoc.ref, {
          'subscription.isActive': false,
          'subscription.currentCredits': 0, // Reset credits to 0
          'subscription.plan': 'free',
          'subscription.expiredAt': admin.firestore.FieldValue.serverTimestamp(),
          'subscription.expiredReason': 'subscription_expired'
        });

        // Create expiry transaction record
        const transactionRef = userDoc.ref.collection('creditTransactions').doc();
        batch.set(transactionRef, {
          id: transactionRef.id,
          userId: userDoc.id,
          type: 'subscription_expired',
          amount: -subscription.currentCredits || 0,
          balanceAfter: 0,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          metadata: {
            previousPlan: subscription.plan,
            expiryDate: subscription.expiresAt,
            reason: 'subscription_expired'
          },
          status: 'completed'
        });

        expiredCount++;
      }

      await batch.commit();
      processedCount = expiringSnapshot.docs.length;
    }

    console.log(`Subscription expiry check completed. Processed: ${processedCount}, Expired: ${expiredCount}`);
    
    return {
      processedCount,
      expiredCount,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error checking subscription expiry:', error);
    throw error;
  }
});

/**
 * Get monthly credits for a subscription plan
 */
function getMonthlyCreditsForPlan(plan: string): number {
  const planCredits: { [key: string]: number } = {
    'free': 10,
    'basic': 100,
    'premium': 500,
    'enterprise': 2000
  };

  return planCredits[plan] || planCredits['free'];
}

/**
 * Manual trigger for monthly reset (admin only)
 */
export const triggerMonthlyReset = functions.https.onCall(async (data, context) => {
  try {
    // Validate admin authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    
    // Check admin role
    const userDoc = await db.collection('users').doc(userId).get();
    const userRole = userDoc.data()?.role;
    
    if (userRole !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    const { targetUserId, reason } = data;

    if (!targetUserId || !reason) {
      throw new functions.https.HttpsError('invalid-argument', 'Target user ID and reason required');
    }

    // Reset specific user
    const targetUserRef = db.collection('users').doc(targetUserId);
    const targetUserDoc = await targetUserRef.get();

    if (!targetUserDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Target user not found');
    }

    const targetUserData = targetUserDoc.data()!;
    const subscription = targetUserData.subscription || {};
    const newCredits = getMonthlyCreditsForPlan(subscription.plan || 'free');

    await db.runTransaction(async (transaction) => {
      // Reset user credits
      transaction.update(targetUserRef, {
        'subscription.currentCredits': newCredits,
        'subscription.resetDate': new Date(),
        'subscription.lastReset': admin.firestore.FieldValue.serverTimestamp(),
        'subscription.creditsUsedThisMonth': 0
      });

      // Create reset transaction record
      const transactionRef = targetUserRef.collection('creditTransactions').doc();
      transaction.set(transactionRef, {
        id: transactionRef.id,
        userId: targetUserId,
        type: 'manual_reset',
        amount: newCredits,
        balanceAfter: newCredits,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          plan: subscription.plan,
          resetType: 'manual_admin',
          reason,
          adminUserId: userId,
          previousCredits: subscription.currentCredits || 0
        },
        status: 'completed'
      });
    });

    // Log the admin action
    await auditLog({
      userId,
      action: 'admin_manual_reset',
      level: LogLevel.CRITICAL,
      details: {
        targetUserId,
        reason,
        newCredits,
        previousCredits: subscription.currentCredits || 0
      },
      timestamp: new Date()
    });

    return {
      success: true,
      targetUserId,
      newCredits,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in manual reset:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to reset user credits');
  }
}); 