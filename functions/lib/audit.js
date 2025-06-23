"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogSink = exports.exportAuditLogs = exports.cleanupAuditLogs = exports.getSecurityLogs = exports.getUserAuditLogs = exports.LogLevel = void 0;
exports.auditLog = auditLog;
exports.logSecurityEvent = logSecurityEvent;
exports.logCreditOperation = logCreditOperation;
exports.logAuthEvent = logAuthEvent;
exports.logAdminAction = logAdminAction;
exports.logAIGeneration = logAIGeneration;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const db = admin.firestore();
// Phase 1.2: Log Levels for Strategic Filtering
var LogLevel;
(function (LogLevel) {
    LogLevel["CRITICAL"] = "CRITICAL";
    LogLevel["INFO"] = "INFO";
    LogLevel["DEBUG"] = "DEBUG"; // Development-only (not written in production)
})(LogLevel || (exports.LogLevel = LogLevel = {}));
// Phase 2.1: Batch Writing System
class AuditLogBatcher {
    constructor() {
        this.pendingLogs = [];
        this.batchTimer = null;
        this.BATCH_SIZE = 10;
        this.BATCH_TIMEOUT_MS = 5000; // 5 seconds
    }
    static getInstance() {
        if (!AuditLogBatcher.instance) {
            AuditLogBatcher.instance = new AuditLogBatcher();
        }
        return AuditLogBatcher.instance;
    }
    addLog(entry) {
        this.pendingLogs.push(entry);
        // Trigger batch write if we hit the batch size or set a timer
        if (this.pendingLogs.length >= this.BATCH_SIZE) {
            this.flushBatch();
        }
        else if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_TIMEOUT_MS);
        }
    }
    async flushBatch() {
        if (this.pendingLogs.length === 0)
            return;
        const logsToWrite = [...this.pendingLogs];
        this.pendingLogs = [];
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        try {
            const batch = db.batch();
            logsToWrite.forEach(entry => {
                const logEntry = Object.assign(Object.assign({}, entry), { timestamp: admin.firestore.FieldValue.serverTimestamp(), id: generateLogId(), version: '2.0' // Updated version for new architecture
                 });
                // Phase 1.1: SINGLE SOURCE OF TRUTH - Only write to top-level auditLogs
                const docRef = db.collection('auditLogs').doc();
                batch.set(docRef, logEntry);
            });
            await batch.commit();
            console.log(`[AuditBatch] Successfully wrote ${logsToWrite.length} audit logs`);
        }
        catch (error) {
            console.error('[AuditBatch] Error writing batch:', error);
            // Re-add failed logs to retry (optional)
            this.pendingLogs.unshift(...logsToWrite);
        }
    }
    // Force flush for critical logs or end of function execution
    async forceFlusth() {
        await this.flushBatch();
    }
}
/**
 * Phase 1: Refactored Main Audit Logging Function
 * - Single source of truth (no dual writes)
 * - Level-based filtering
 * - Batch writing support
 */
async function auditLog(entry) {
    try {
        // Phase 1.2: Filter out DEBUG logs in production
        if (entry.level === LogLevel.DEBUG && process.env.NODE_ENV === 'production') {
            return;
        }
        // Phase 2.1: Use batch writing for performance
        const batcher = AuditLogBatcher.getInstance();
        batcher.addLog(entry);
        // For CRITICAL logs, force immediate write
        if (entry.level === LogLevel.CRITICAL) {
            await batcher.forceFlusth();
        }
        // Check for critical actions that need immediate attention
        await checkCriticalActions(entry);
    }
    catch (error) {
        console.error('Error writing audit log:', error);
        // Don't throw error to avoid breaking main functionality
    }
}
/**
 * Security event logging (unchanged but optimized)
 */
async function logSecurityEvent(event) {
    try {
        const securityLog = Object.assign(Object.assign({}, event), { timestamp: admin.firestore.FieldValue.serverTimestamp(), id: generateLogId(), alertSent: false });
        await db.collection('securityLogs').add(securityLog);
        // Send alerts for high/critical severity events
        if (event.severity === 'high' || event.severity === 'critical') {
            await sendSecurityAlert(event);
        }
    }
    catch (error) {
        console.error('Error logging security event:', error);
    }
}
/**
 * Phase 1.2: Refactored Credit Operations Logging with Levels
 */
async function logCreditOperation(userId, operation, amount, balanceBefore, balanceAfter, metadata = {}) {
    // Determine log level based on operation
    let level;
    if (operation === 'adjust') {
        level = LogLevel.CRITICAL; // Admin credit adjustments are critical
    }
    else {
        level = LogLevel.INFO; // Normal consumption/addition is informational
    }
    const entry = {
        userId,
        action: `credit_${operation}`,
        level,
        details: Object.assign({ operation,
            amount,
            balanceBefore,
            balanceAfter }, metadata),
        timestamp: new Date()
    };
    await auditLog(entry);
}
/**
 * Phase 1.2: Refactored Authentication Logging - Remove Noise
 */
async function logAuthEvent(userId, event, success, ip, userAgent) {
    // Phase 1.2: REMOVE NOISE - Don't log routine token refreshes
    if (event === 'token_refresh') {
        return;
    }
    // Determine log level
    let level;
    if (event === 'password_change' || (event === 'login' && !success)) {
        level = LogLevel.CRITICAL; // Security-sensitive events
    }
    else {
        level = LogLevel.INFO; // Normal login/logout
    }
    const entry = {
        userId,
        action: `auth_${event}`,
        level,
        details: {
            event,
            success,
            ip,
            userAgent
        },
        timestamp: new Date(),
        ip,
        userAgent
    };
    await auditLog(entry);
    // Log security event for failed logins
    if (event === 'login' && !success) {
        await logSecurityEvent({
            type: 'failed_login',
            userId,
            ip,
            userAgent,
            details: { reason: 'Invalid credentials' },
            severity: 'medium',
            timestamp: new Date()
        });
    }
}
/**
 * Admin actions logging - Always CRITICAL level
 */
async function logAdminAction(adminUserId, action, targetUserId, details = {}, ip) {
    const entry = {
        userId: adminUserId,
        action: `admin_${action}`,
        level: LogLevel.CRITICAL, // All admin actions are critical
        details: Object.assign({ action,
            targetUserId }, details),
        timestamp: new Date(),
        ip
    };
    await auditLog(entry);
    // Log as security event for sensitive admin actions
    const sensitiveActions = ['delete_user', 'adjust_credits', 'change_role', 'block_user'];
    if (sensitiveActions.includes(action)) {
        await logSecurityEvent({
            type: 'suspicious_activity',
            userId: adminUserId,
            ip,
            details: Object.assign({ adminAction: action, targetUserId }, details),
            severity: 'high',
            timestamp: new Date()
        });
    }
}
/**
 * Phase 1.2: New AI Generation Logging with Appropriate Levels
 */
async function logAIGeneration(userId, action, jobId, details = {}) {
    // Only log completion and failures, not every request
    if (action === 'requested') {
        return; // Remove noise - job creation is tracked elsewhere
    }
    const level = action === 'failed' ? LogLevel.CRITICAL : LogLevel.INFO;
    const entry = {
        userId,
        action: `ai_generation_${action}`,
        level,
        details: Object.assign({ jobId,
            action }, details),
        timestamp: new Date()
    };
    await auditLog(entry);
}
/**
 * Phase 1.1: Updated User Audit Logs Query - Now queries single source
 */
exports.getUserAuditLogs = functions.https.onCall(async (data, context) => {
    try {
        // Validate authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const userId = context.auth.uid;
        const { limit = 50, startAfter, action, level } = data;
        // Validate limit
        if (limit > 100) {
            throw new functions.https.HttpsError('invalid-argument', 'Limit cannot exceed 100');
        }
        // Phase 1.1: Query from single source of truth
        let query = db.collection('auditLogs')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .limit(limit);
        // Filter by action if specified
        if (action) {
            query = query.where('action', '==', action);
        }
        // Filter by level if specified
        if (level) {
            query = query.where('level', '==', level);
        }
        // Pagination
        if (startAfter) {
            const startDoc = await db.collection('auditLogs').doc(startAfter).get();
            query = query.startAfter(startDoc);
        }
        const snapshot = await query.get();
        const logs = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        return {
            logs,
            hasMore: snapshot.docs.length === limit,
            lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null
        };
    }
    catch (error) {
        console.error('Error getting audit logs:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to get audit logs');
    }
});
/**
 * Get security logs (admin only) - unchanged
 */
exports.getSecurityLogs = functions.https.onCall(async (data, context) => {
    var _a;
    try {
        // Validate admin authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const userId = context.auth.uid;
        // Check admin role
        const userDoc = await db.collection('users').doc(userId).get();
        const userRole = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.role;
        if (userRole !== 'admin' && userRole !== 'support') {
            throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
        }
        const { limit = 50, severity, type, startAfter } = data;
        let query = db.collection('securityLogs')
            .orderBy('timestamp', 'desc')
            .limit(limit);
        // Filter by severity
        if (severity) {
            query = query.where('severity', '==', severity);
        }
        // Filter by type
        if (type) {
            query = query.where('type', '==', type);
        }
        // Pagination
        if (startAfter) {
            const startDoc = await db.collection('securityLogs').doc(startAfter).get();
            query = query.startAfter(startDoc);
        }
        const snapshot = await query.get();
        const logs = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        return {
            logs,
            hasMore: snapshot.docs.length === limit,
            lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null
        };
    }
    catch (error) {
        console.error('Error getting security logs:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to get security logs');
    }
});
/**
 * Generate unique log ID
 */
function generateLogId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}_${random}`;
}
/**
 * Check for critical actions that need immediate attention
 */
async function checkCriticalActions(entry) {
    if (entry.level !== LogLevel.CRITICAL) {
        return; // Only check critical level logs
    }
    const criticalActions = [
        'credit_adjust',
        'admin_delete_user',
        'admin_change_role',
        'admin_block_user',
        'ai_generation_failed'
    ];
    if (criticalActions.includes(entry.action)) {
        await logSecurityEvent({
            type: 'suspicious_activity',
            userId: entry.userId,
            details: {
                criticalAction: entry.action,
                details: entry.details
            },
            severity: 'critical',
            timestamp: new Date()
        });
    }
}
/**
 * Send security alerts (placeholder - implement with your notification system)
 */
async function sendSecurityAlert(event) {
    try {
        // This is a placeholder - implement with your actual notification system
        console.warn('SECURITY ALERT:', {
            type: event.type,
            severity: event.severity,
            userId: event.userId,
            details: event.details,
            timestamp: event.timestamp
        });
        // You could implement:
        // - Email notifications
        // - Slack/Discord webhooks
        // - SMS alerts
        // - Push notifications to admin app
        // Example: Send to admin notification queue
        await db.collection('adminNotifications').add({
            type: 'security_alert',
            event,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            priority: event.severity === 'critical' ? 'urgent' : 'normal'
        });
    }
    catch (error) {
        console.error('Error sending security alert:', error);
    }
}
/**
 * Phase 2.2: Tiered Data Retention Policy
 */
exports.cleanupAuditLogs = functions.pubsub.schedule('0 2 * * *').onRun(async (context) => {
    try {
        const now = new Date();
        // Different retention periods based on log level
        const infoRetentionDate = new Date(now);
        infoRetentionDate.setDate(infoRetentionDate.getDate() - 90); // 90 days for INFO
        const criticalRetentionDate = new Date(now);
        criticalRetentionDate.setFullYear(criticalRetentionDate.getFullYear() - 1); // 365 days for CRITICAL
        let totalDeleted = 0;
        // Delete old INFO level logs (90 days)
        const infoLogsSnapshot = await db.collection('auditLogs')
            .where('level', '==', LogLevel.INFO)
            .where('timestamp', '<', infoRetentionDate)
            .limit(500)
            .get();
        if (!infoLogsSnapshot.empty) {
            const infoBatch = db.batch();
            infoLogsSnapshot.docs.forEach(doc => {
                infoBatch.delete(doc.ref);
            });
            await infoBatch.commit();
            totalDeleted += infoLogsSnapshot.docs.length;
            console.log(`Deleted ${infoLogsSnapshot.docs.length} old INFO audit logs`);
        }
        // Delete old CRITICAL level logs (365 days)
        const criticalLogsSnapshot = await db.collection('auditLogs')
            .where('level', '==', LogLevel.CRITICAL)
            .where('timestamp', '<', criticalRetentionDate)
            .limit(500)
            .get();
        if (!criticalLogsSnapshot.empty) {
            const criticalBatch = db.batch();
            criticalLogsSnapshot.docs.forEach(doc => {
                criticalBatch.delete(doc.ref);
            });
            await criticalBatch.commit();
            totalDeleted += criticalLogsSnapshot.docs.length;
            console.log(`Deleted ${criticalLogsSnapshot.docs.length} old CRITICAL audit logs`);
        }
        // Also clean up legacy logs without level field (assume INFO level)
        const legacyLogsSnapshot = await db.collection('auditLogs')
            .where('timestamp', '<', infoRetentionDate)
            .limit(500)
            .get();
        if (!legacyLogsSnapshot.empty) {
            const legacyBatch = db.batch();
            legacyLogsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (!data.level) { // Only delete if no level field (legacy logs)
                    legacyBatch.delete(doc.ref);
                }
            });
            await legacyBatch.commit();
            console.log(`Cleaned up legacy audit logs`);
        }
        return { deletedCount: totalDeleted };
    }
    catch (error) {
        console.error('Error cleaning up audit logs:', error);
        throw error;
    }
});
/**
 * Export audit logs for compliance (admin only)
 */
exports.exportAuditLogs = functions.https.onCall(async (data, context) => {
    var _a;
    try {
        // Validate admin authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const userId = context.auth.uid;
        // Check admin role
        const userDoc = await db.collection('users').doc(userId).get();
        const userRole = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.role;
        if (userRole !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Admin access required');
        }
        const { startDate, endDate, userId: targetUserId, level, format = 'json' } = data;
        // Validate date range
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (end.getTime() - start.getTime() > 90 * 24 * 60 * 60 * 1000) {
            throw new functions.https.HttpsError('invalid-argument', 'Date range cannot exceed 90 days');
        }
        let query = db.collection('auditLogs')
            .where('timestamp', '>=', start)
            .where('timestamp', '<=', end)
            .orderBy('timestamp', 'desc');
        if (targetUserId) {
            query = query.where('userId', '==', targetUserId);
        }
        if (level) {
            query = query.where('level', '==', level);
        }
        const snapshot = await query.get();
        const logs = snapshot.docs.map(doc => doc.data());
        // Log the export action
        await logAdminAction(userId, 'export_audit_logs', targetUserId, {
            startDate,
            endDate,
            level,
            recordCount: logs.length,
            format
        });
        return {
            logs,
            metadata: {
                exportedBy: userId,
                exportDate: new Date().toISOString(),
                recordCount: logs.length,
                dateRange: { startDate, endDate },
                level
            }
        };
    }
    catch (error) {
        console.error('Error exporting audit logs:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to export audit logs');
    }
});
/**
 * Phase 3.1: Dedicated Logging Sink for Long-term Storage
 */
exports.auditLogSink = functions.firestore
    .document('auditLogs/{logId}')
    .onWrite(async (change, context) => {
    try {
        // Only process new documents (not updates or deletes)
        if (!change.after.exists) {
            return;
        }
        const logData = change.after.data();
        // Stream to Google Cloud Logging for long-term storage
        // This is a placeholder - implement based on your preferred sink
        console.log('[AuditSink] Streaming log to external storage:', {
            logId: context.params.logId,
            userId: logData === null || logData === void 0 ? void 0 : logData.userId,
            action: logData === null || logData === void 0 ? void 0 : logData.action,
            level: logData === null || logData === void 0 ? void 0 : logData.level,
            timestamp: logData === null || logData === void 0 ? void 0 : logData.timestamp
        });
        // Example: Stream to BigQuery
        // await streamToBigQuery(logData);
        // Example: Stream to Cloud Logging
        // await streamToCloudLogging(logData);
    }
    catch (error) {
        console.error('[AuditSink] Error streaming audit log:', error);
        // Don't throw - this is a best-effort operation
    }
});
//# sourceMappingURL=audit.js.map