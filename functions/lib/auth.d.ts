import * as functions from 'firebase-functions';
/**
 * Validate authentication from function context
 */
export declare function validateAuth(context: functions.https.CallableContext): Promise<string | null>;
/**
 * Check if user has specific role
 */
export declare function hasRole(userId: string, requiredRole: string): Promise<boolean>;
/**
 * Validate admin access
 */
export declare function validateAdminAuth(context: functions.https.CallableContext): Promise<string | null>;
/**
 * Validate support access (admin or support role)
 */
export declare function validateSupportAuth(context: functions.https.CallableContext): Promise<string | null>;
/**
 * Create custom claims for user roles
 */
export declare function setUserRole(userId: string, role: string): Promise<void>;
/**
 * Refresh user token to include updated claims
 */
export declare const refreshUserToken: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Validate service account access (for internal functions)
 */
export declare function isServiceAccount(context: functions.https.CallableContext): boolean;
/**
 * Rate limit validation based on user tier
 */
export declare function getUserRateLimit(userId: string): Promise<{
    requests: number;
    windowMs: number;
}>;
/**
 * Validate request origin and CORS
 */
export declare function validateOrigin(req: functions.Request): boolean;
/**
 * Security headers middleware
 */
export declare function setSecurityHeaders(res: functions.Response): void;
//# sourceMappingURL=auth.d.ts.map