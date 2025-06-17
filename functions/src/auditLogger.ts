// functions/src/auditLogger.ts

import admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Ensure Firebase Admin SDK is initialized (it should be by the time this is imported from another function)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const AUDIT_LOG_COLLECTION = 'auditLogs';

export interface AuditLogEntry {
  timestamp: admin.firestore.FieldValue; // Server timestamp
  actor: {
    uid?: string; // UID of the user performing the action (if applicable)
    email?: string; // Email of the user
    ipAddress?: string; // IP address of the requester (use with caution, consider privacy)
    role?: string | object; // Role of the actor, e.g., 'user', 'admin', or from userProfile.roles
  };
  action: string; // Description of the action, e.g., 'USER_LOGIN', 'CREDIT_PURCHASE', 'ADMIN_ROLE_CHANGE'
  target?: {
    resource: string; // e.g., 'user', 'subscription', 'creditTransaction'
    id?: string; // ID of the targeted resource, e.g., a specific userId or transactionId
  };
  outcome: 'SUCCESS' | 'FAILURE' | 'PENDING';
  details?: Record<string, any>; // Any additional relevant details for the event
  context?: { // Optional context, like function name or trace ID
    functionName?: string;
    traceId?: string;
  };
}

/**
 * Logs an audit event to the Firestore 'auditLogs' collection.
 *
 * @param {Omit<AuditLogEntry, 'timestamp'>} logData - The data for the audit log entry.
 *                                                    Timestamp will be added automatically.
 */
export const logAuditEvent = async (logData: Omit<AuditLogEntry, 'timestamp'>): Promise<void> => {
  try {
    const entry: AuditLogEntry = {
      ...logData,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };
    await admin.firestore().collection(AUDIT_LOG_COLLECTION).add(entry);
    functions.logger.info('Audit event logged:', { action: logData.action, actorUid: logData.actor.uid });
  } catch (error) {
    functions.logger.error('Failed to log audit event:', { error, logDataAction: logData.action });
    // Depending on policy, you might want to re-throw or handle this more aggressively
    // if audit logging is absolutely critical and failures are unacceptable.
  }
};

// --- Example of how to prepare actor information ---
/**
 * Prepares actor information for an audit log.
 * @param {admin.auth.DecodedIdToken | null | undefined} decodedToken - Firebase decoded ID token.
 * @param {string | undefined} ipAddress - Requester's IP address.
 * @param {object | undefined} userRoles - Roles from user's Firestore profile.
 * @returns Actor object for AuditLogEntry.
 */
export const prepareActor = (
    decodedToken: admin.auth.DecodedIdToken | null | undefined,
    ipAddress?: string,
    userRoles?: object
) => {
    const actor: AuditLogEntry['actor'] = {
        ipAddress: ipAddress // Ensure this is handled carefully regarding PII/privacy
    };
    if (decodedToken) {
        actor.uid = decodedToken.uid;
        actor.email = decodedToken.email;
    }
    if (userRoles) {
        actor.role = userRoles;
    } else if (decodedToken && decodedToken.admin) { // Example if using custom claims for 'admin'
        actor.role = 'admin_claim';
    } else if (decodedToken) {
        actor.role = 'user';
    } else {
        actor.role = 'system_or_anonymous';
    }
    return actor;
};


// --- Security Rules for auditLogs collection (for firestore.rules) ---
/*
match /auditLogs/{logId} {
  // Only backend functions (or a super-admin role) should be able to create audit logs.
  allow read: if request.auth.uid != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles.admin == true; // Example: Admins can read
  allow create: if false; // Should be false for clients, true for function's service account implicitly
  allow update: if false;
  allow delete: if false;
}
*/

// --- Example of Integration (Conceptual - to be applied in relevant functions): ---
/*
// Imagine this is in a file like functions/src/creditManager.ts

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { authenticatedFunction } from './auth'; // Assuming this exists from a previous step
import { logAuditEvent, prepareActor } from './auditLogger'; // Import the logger

if (admin.apps.length === 0) { admin.initializeApp(); } // Ensure admin is initialized

export const purchaseCreditsFunction = authenticatedFunction(
  async (request, response, decodedUserToken) => {
    const { amount, paymentMethodId } = request.body;
    const userId = decodedUserToken.uid;

    // In a real scenario, you might get the IP from the request if needed, e.g., using request.ip
    // However, ensure compliance with privacy regulations (e.g., GDPR) if logging IPs.
    // For this example, we'll keep it simple.
    // const userIp = request.ip;

    // Fetch user profile to get roles for more detailed actor info (optional, depending on needs)
    // const userProfileSnapshot = await admin.firestore().collection('users').doc(userId).get();
    // const actorRoles = userProfileSnapshot.exists ? userProfileSnapshot.data()?.roles : undefined;

    // Prepare actor information
    const actor = prepareActor(decodedUserToken, request.ip /*, actorRoles * /);

    try {
      // --- Hypothetical Credit Purchase Logic ---
      // 1. Validate request body (amount, paymentMethodId)
      if (!amount || amount <= 0 || !paymentMethodId) {
        functions.logger.warn('Invalid purchase request:', { userId, body: request.body });
        response.status(400).send({ error: 'Invalid request parameters.' });
        // Log audit event for bad request if desired, though often handled by function input validation logs
        return;
      }

      // 2. Process payment with a payment provider (e.g., Paddle, Stripe - this is a placeholder)
      // const paymentResult = await processPaymentWithProvider(userId, amount, paymentMethodId);
      // if (!paymentResult.success) {
      //   throw new Error(`Payment failed: ${paymentResult.failureReason}`);
      // }
      const mockPaymentResult = { success: true, transactionId: `mock_payment_${Date.now()}` }; // Placeholder
      functions.logger.info('Payment processing successful (mock)', { userId, amount, paymentMethodId });

      // 3. If payment is successful, update user's credits in Firestore
      // This might involve calling a CreditService method or directly updating Firestore
      // For this example, let's assume a direct update for simplicity, though a service is better.
      const userCreditsRef = admin.firestore().collection('users').doc(userId);
      await admin.firestore().runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userCreditsRef);
        if (!userDoc.exists) {
          throw new Error('User profile not found for credit update.');
        }
        const currentCredits = userDoc.data()?.credits || 0;
        const newCredits = currentCredits + amount;
        transaction.update(userCreditsRef, { credits: newCredits });
      });
      functions.logger.info('User credits updated in Firestore', { userId, newCredits: "?" }); // Actual newCredits would be var

      // --- Audit Log for Successful Purchase ---
      await logAuditEvent({
        actor,
        action: 'CREDIT_PURCHASE_SUCCESS',
        target: { resource: 'user_credits', id: userId },
        outcome: 'SUCCESS',
        details: {
          amountPurchased: amount,
          paymentMethodIdUsed: paymentMethodId, // Be cautious with logging sensitive payment details like full IDs
          paymentProviderTransactionId: mockPaymentResult.transactionId,
        },
        context: { functionName: 'purchaseCreditsFunction' }
      });

      response.status(200).send({ message: 'Credits purchased successfully.', transactionId: mockPaymentResult.transactionId });

    } catch (error) {
      functions.logger.error('Credit purchase process failed:', { userId, error: error.message, stack: error.stack });

      // --- Audit Log for Failed Purchase ---
      await logAuditEvent({
        actor,
        action: 'CREDIT_PURCHASE_FAILURE',
        target: { resource: 'user_credits', id: userId },
        outcome: 'FAILURE',
        details: {
          error: error.message,
          amountAttempted: amount,
          paymentMethodIdUsed: paymentMethodId
        },
        context: { functionName: 'purchaseCreditsFunction' }
      });
      response.status(500).send({ error: 'Credit purchase failed. Please try again later.' });
    }
  }
);

// Dummy function to simulate payment processing
// async function processPaymentWithProvider(userId: string, amount: number, paymentMethodId: string) {
//   // In a real scenario, this would interact with Paddle, Stripe, etc.
//   functions.logger.info('Simulating payment processing...', { userId, amount });
//   if (paymentMethodId === 'fail_payment') {
//     return { success: false, failureReason: 'Payment provider declined transaction.' };
//   }
//   return { success: true, transactionId: `real_payment_${Date.now()}` };
// }

*/
