import * as functions from 'firebase-functions';
export interface AuditLogEntry {
    userId: string;
    action: string;
    details: any;
    timestamp: Date;
    ip?: string;
    userAgent?: string;
    sessionId?: string;
    metadata?: any;
}
export interface SecurityEvent {
    type: 'login' | 'logout' | 'failed_login' | 'password_change' | 'account_locked' | 'suspicious_activity';
    userId?: string;
    ip?: string;
    userAgent?: string;
    details: any;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: Date;
}
/**
 * Main audit logging function
 */
export declare function auditLog(entry: AuditLogEntry): Promise<void>;
/**
 * Security event logging
 */
export declare function logSecurityEvent(event: SecurityEvent): Promise<void>;
/**
 * Log credit operations specifically
 */
export declare function logCreditOperation(userId: string, operation: 'consume' | 'add' | 'reset' | 'adjust', amount: number, balanceBefore: number, balanceAfter: number, metadata?: any): Promise<void>;
/**
 * Log authentication events
 */
export declare function logAuthEvent(userId: string, event: 'login' | 'logout' | 'token_refresh' | 'password_change', success: boolean, ip?: string, userAgent?: string): Promise<void>;
/**
 * Log admin actions
 */
export declare function logAdminAction(adminUserId: string, action: string, targetUserId?: string, details?: any, ip?: string): Promise<void>;
/**
 * Get audit logs for a user with pagination
 */
export declare const getUserAuditLogs: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Get security logs (admin only)
 */
export declare const getSecurityLogs: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Cleanup old audit logs (scheduled function)
 */
export declare const cleanupAuditLogs: functions.CloudFunction<unknown>;
/**
 * Export audit logs for compliance (admin only)
 */
export declare const exportAuditLogs: functions.HttpsFunction & functions.Runnable<any>;
//# sourceMappingURL=audit.d.ts.map