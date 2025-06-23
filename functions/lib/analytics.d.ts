import * as functions from 'firebase-functions';
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
export declare const logAnalytics: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Get user analytics
 */
export declare const getUserAnalytics: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Part 4: Strategic Analytics Engine
 * Daily Analytics Aggregator Function
 * Runs once every 24 hours to aggregate key business metrics
 */
export declare const dailyAnalyticsAggregator: functions.CloudFunction<unknown>;
//# sourceMappingURL=analytics.d.ts.map