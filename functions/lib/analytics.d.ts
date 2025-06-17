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
export declare function logAnalytics(event: AnalyticsEvent): Promise<void>;
/**
 * Get user analytics
 */
export declare const getUserAnalytics: functions.HttpsFunction & functions.Runnable<any>;
//# sourceMappingURL=analytics.d.ts.map