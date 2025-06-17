import * as functions from 'firebase-functions';
/**
 * Task 5.3: Monthly credit reset scheduled function
 * Runs on the 1st of every month at 00:00 UTC
 */
export declare const monthlyReset: functions.CloudFunction<unknown>;
/**
 * Weekly cleanup function - runs every Sunday at 02:00 UTC
 */
export declare const weeklyCleanup: functions.CloudFunction<unknown>;
/**
 * Daily security scan - runs every day at 03:00 UTC
 */
export declare const dailySecurityScan: functions.CloudFunction<unknown>;
/**
 * Subscription expiry check - runs daily at 01:00 UTC
 */
export declare const checkSubscriptionExpiry: functions.CloudFunction<unknown>;
/**
 * Manual trigger for monthly reset (admin only)
 */
export declare const triggerMonthlyReset: functions.HttpsFunction & functions.Runnable<any>;
//# sourceMappingURL=scheduledFunctions.d.ts.map