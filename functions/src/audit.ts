import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

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
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const logEntry = {
      ...entry,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      id: generateLogId(),
      version: '1.0'
    };

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

  } catch (error) {
    console.error('Error writing audit log:', error);
    // Don't throw error to avoid breaking main functionality
  }
}

/**
 * Security event logging
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    const securityLog = {
      ...event,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      id: generateLogId(),
      alertSent: false
    };

    await db.collection('securityLogs').add(securityLog);

    // Send alerts for high/critical severity events
    if (event.severity === 'high' || event.severity === 'critical') {
      await sendSecurityAlert(event);
    }

  } catch (error) {
    console.error('Error logging security event:', error);
  }
}

/**
 * Log credit operations specifically
 */
export async function logCreditOperation(
  userId: string,
  operation: 'consume' | 'add' | 'reset' | 'adjust',
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  metadata: any = {}
): Promise<void> {
  const entry: AuditLogEntry = {
    userId,
    action: `credit_${operation}`,
    details: {
      operation,
      amount,
      balanceBefore,
      balanceAfter,
      ...metadata
    },
    timestamp: new Date()
  };

  await auditLog(entry);
}

/**
 * Log authentication events
 */
export async function logAuthEvent(
  userId: string,
  event: 'login' | 'logout' | 'token_refresh' | 'password_change',
  success: boolean,
  ip?: string,
  userAgent?: string
): Promise<void> {
  const entry: AuditLogEntry = {
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
export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetUserId?: string,
  details: any = {},
  ip?: string
): Promise<void> {
  const entry: AuditLogEntry = {
    userId: adminUserId,
    action: `admin_${action}`,
    details: {
      action,
      targetUserId,
      ...details
    },
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
      details: {
        adminAction: action,
        targetUserId,
        ...details
      },
      severity: 'high',
      timestamp: new Date()
    });
  }
}

/**
 * Get audit logs for a user with pagination
 */
export const getUserAuditLogs = functions.https.onCall(async (data, context) => {
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
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      logs,
      hasMore: snapshot.docs.length === limit,
      lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null
    };

  } catch (error) {
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
export const getSecurityLogs = functions.https.onCall(async (data, context) => {
  try {
    // Validate admin authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    
    // Check admin role
    const userDoc = await db.collection('users').doc(userId).get();
    const userRole = userDoc.data()?.role;
    
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
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      logs,
      hasMore: snapshot.docs.length === limit,
      lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null
    };

  } catch (error) {
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
function generateLogId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `${timestamp}_${random}`;
}

/**
 * Check for critical actions that need immediate attention
 */
async function checkCriticalActions(entry: AuditLogEntry): Promise<void> {
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
async function sendSecurityAlert(event: SecurityEvent): Promise<void> {
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

  } catch (error) {
    console.error('Error sending security alert:', error);
  }
}

/**
 * Cleanup old audit logs (scheduled function)
 */
export const cleanupAuditLogs = functions.pubsub.schedule('0 2 * * *').onRun(async (context) => {
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
  } catch (error) {
    console.error('Error cleaning up audit logs:', error);
    throw error;
  }
});

/**
 * Export audit logs for compliance (admin only)
 */
export const exportAuditLogs = functions.https.onCall(async (data, context) => {
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

  } catch (error) {
    console.error('Error exporting audit logs:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to export audit logs');
  }
}); 