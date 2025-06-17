import * as functions from 'firebase-functions';
/**
 * Initialize rate limiter for specific operation (placeholder)
 */
/**
 * Rate limit middleware for HTTP functions
 */
export declare function rateLimitMiddleware(req: functions.Request, res: functions.Response, operation: string, userId?: string): Promise<boolean>;
/**
 * Get rate limits for specific user based on subscription
 */
/**
 * Advanced abuse detection and prevention
 */
export declare class AbuseDetector {
    private static instance;
    private suspiciousActivityThreshold;
    static getInstance(): AbuseDetector;
    /**
     * Check for suspicious activity patterns
     */
    checkSuspiciousActivity(userId: string, operation: string): Promise<{
        isSuspicious: boolean;
        riskScore: number;
        reason?: string;
    }>;
    /**
     * Get recent transactions for pattern analysis
     */
    private getRecentTransactions;
    /**
     * Get hourly usage statistics
     */
    private getHourlyUsage;
    /**
     * Detect bot-like behavior patterns
     */
    private detectBotBehavior;
    /**
     * Check IP reputation (simplified implementation)
     */
    private checkIPReputation;
}
/**
 * Log rate limit violations for monitoring
 */
/**
 * Block user temporarily for abuse
 */
export declare function temporaryBlock(userId: string, reason: string, durationMinutes?: number): Promise<void>;
/**
 * Check if user is currently blocked
 */
export declare function isUserBlocked(userId: string): Promise<boolean>;
/**
 * Rate limit for credit consumption specifically
 */
export declare const creditConsumptionRateLimit: functions.HttpsFunction & functions.Runnable<any>;
//# sourceMappingURL=rateLimiter.d.ts.map