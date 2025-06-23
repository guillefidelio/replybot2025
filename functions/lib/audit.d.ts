import * as functions from 'firebase-functions';
export declare enum LogLevel {
    CRITICAL = "CRITICAL",// Security-sensitive, payments, subscriptions, admin actions
    INFO = "INFO",// Important state-changing user actions
    DEBUG = "DEBUG"
}
export interface AuditLogEntry {
    userId: string;
    action: string;
    level: LogLevel;
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
 * Phase 1: Refactored Main Audit Logging Function
 * - Single source of truth (no dual writes)
 * - Level-based filtering
 * - Batch writing support
 */
export declare function auditLog(entry: AuditLogEntry): Promise<void>;
/**
 * Security event logging (unchanged but optimized)
 */
export declare function logSecurityEvent(event: SecurityEvent): Promise<void>;
/**
 * Phase 1.2: Refactored Credit Operations Logging with Levels
 */
export declare function logCreditOperation(userId: string, operation: 'consume' | 'add' | 'reset' | 'adjust', amount: number, balanceBefore: number, balanceAfter: number, metadata?: any): Promise<void>;
/**
 * Phase 1.2: Refactored Authentication Logging - Remove Noise
 */
export declare function logAuthEvent(userId: string, event: 'login' | 'logout' | 'token_refresh' | 'password_change', success: boolean, ip?: string, userAgent?: string): Promise<void>;
/**
 * Admin actions logging - Always CRITICAL level
 */
export declare function logAdminAction(adminUserId: string, action: string, targetUserId?: string, details?: any, ip?: string): Promise<void>;
/**
 * Phase 1.2: New AI Generation Logging with Appropriate Levels
 */
export declare function logAIGeneration(userId: string, action: 'requested' | 'completed' | 'failed', jobId: string, details?: any): Promise<void>;
/**
 * Phase 1.1: Updated User Audit Logs Query - Now queries single source
 */
export declare const getUserAuditLogs: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Get security logs (admin only) - unchanged
 */
export declare const getSecurityLogs: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Phase 2.2: Tiered Data Retention Policy
 */
export declare const cleanupAuditLogs: functions.CloudFunction<unknown>;
/**
 * Export audit logs for compliance (admin only)
 */
export declare const exportAuditLogs: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Phase 3.1: Dedicated Logging Sink for Long-term Storage
 */
export declare const auditLogSink: functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>>;
//# sourceMappingURL=audit.d.ts.map