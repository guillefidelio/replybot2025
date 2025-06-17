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
exports.exportAuditLogs = exports.cleanupAuditLogs = exports.getSecurityLogs = exports.getUserAuditLogs = void 0;
exports.auditLog = auditLog;
exports.logSecurityEvent = logSecurityEvent;
exports.logCreditOperation = logCreditOperation;
exports.logAuthEvent = logAuthEvent;
exports.logAdminAction = logAdminAction;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const db = admin.firestore();
/**
 * Main audit logging function
 */
async function auditLog(entry) {
    try {
        const logEntry = Object.assign(Object.assign({}, entry), { timestamp: admin.firestore.FieldValue.serverTimestamp(), id: generateLogId(), version: '1.0' });
        // Store in audit logs collection
        await db.collection('auditLogs').add(logEntry);
        // Also store in user-specific subcollection for easy querying
        if (entry.userId) {
            await db.collection('users')
                .doc(entry.userId)
                .collection('auditLogs')
                .add(logEntry);
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
 * Security event logging
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
 * Log credit operations specifically
 */
async function logCreditOperation(userId, operation, amount, balanceBefore, balanceAfter, metadata = {}) {
    const entry = {
        userId,
        action: `credit_${operation}`,
        details: Object.assign({ operation,
            amount,
            balanceBefore,
            balanceAfter }, metadata),
        timestamp: new Date()
    };
    await auditLog(entry);
}
/**
 * Log authentication events
 */
async function logAuthEvent(userId, event, success, ip, userAgent) {
    const entry = {
        userId,
        action: `auth_${event}`,
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
 * Log admin actions
 */
async function logAdminAction(adminUserId, action, targetUserId, details = {}, ip) {
    const entry = {
        userId: adminUserId,
        action: `admin_${action}`,
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
 * Get audit logs for a user with pagination
 */
exports.getUserAuditLogs = functions.https.onCall(async (data, context) => {
    try {
        // Validate authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const userId = context.auth.uid;
        const { limit = 50, startAfter, action } = data;
        // Validate limit
        if (limit > 100) {
            throw new functions.https.HttpsError('invalid-argument', 'Limit cannot exceed 100');
        }
        let query = db.collection('users')
            .doc(userId)
            .collection('auditLogs')
            .orderBy('timestamp', 'desc')
            .limit(limit);
        // Filter by action if specified
        if (action) {
            query = query.where('action', '==', action);
        }
        // Pagination
        if (startAfter) {
            const startDoc = await db.collection('users')
                .doc(userId)
                .collection('auditLogs')
                .doc(startAfter)
                .get();
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
 * Get security logs (admin only)
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
    const criticalActions = [
        'credit_adjust',
        'admin_delete_user',
        'admin_change_role',
        'admin_block_user'
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
 * Cleanup old audit logs (scheduled function)
 */
exports.cleanupAuditLogs = functions.pubsub.schedule('0 2 * * *').onRun(async (context) => {
    try {
        // Delete audit logs older than 1 year
        const cutoffDate = new Date();
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
        const batch = db.batch();
        let deleteCount = 0;
        // Get old logs in batches
        const oldLogsSnapshot = await db.collection('auditLogs')
            .where('timestamp', '<', cutoffDate)
            .limit(500)
            .get();
        oldLogsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            deleteCount++;
        });
        if (deleteCount > 0) {
            await batch.commit();
            console.log(`Deleted ${deleteCount} old audit logs`);
        }
        return { deletedCount: deleteCount };
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
        const { startDate, endDate, userId: targetUserId, format = 'json' } = data;
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
        const snapshot = await query.get();
        const logs = snapshot.docs.map(doc => doc.data());
        // Log the export action
        await logAdminAction(userId, 'export_audit_logs', targetUserId, {
            startDate,
            endDate,
            recordCount: logs.length,
            format
        });
        return {
            logs,
            metadata: {
                exportedBy: userId,
                exportDate: new Date().toISOString(),
                recordCount: logs.length,
                dateRange: { startDate, endDate }
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
//# sourceMappingURL=audit.js.map