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
exports.batchCreditOperations = exports.adjustCredits = exports.consumeCreditHttp = exports.getCreditStatusHttp = exports.getCreditStatus = exports.consumeCredit = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const audit_1 = require("./audit");
const auth_1 = require("./auth");
// import { rateLimitMiddleware } from './rateLimiter';
const db = admin.firestore();
// interface ConsumeResult {
//   success: boolean;
//   remainingCredits: number;
//   transactionId?: string;
//   error?: string;
// }
/**
 * Task 5.1: Consume credits with atomic Firestore transactions
 */
exports.consumeCredit = functions.https.onCall(async (data, context) => {
    try {
        // Validate authentication
        const userId = await (0, auth_1.validateAuth)(context);
        if (!userId) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const { amount = 1, operation = 'ai_response', metadata = {} } = data;
        // Validate input
        if (typeof amount !== 'number' || amount <= 0 || amount > 100) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid credit amount');
        }
        // Use atomic transaction to consume credits
        const result = await db.runTransaction(async (transaction) => {
            var _a, _b;
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'User not found');
            }
            const userData = userDoc.data();
            const currentCredits = ((_a = userData.subscription) === null || _a === void 0 ? void 0 : _a.currentCredits) || 0;
            const isActive = ((_b = userData.subscription) === null || _b === void 0 ? void 0 : _b.isActive) || false;
            // Check if user has enough credits
            if (currentCredits < amount) {
                return {
                    success: false,
                    remainingCredits: currentCredits,
                    error: 'Insufficient credits'
                };
            }
            // Check if subscription is active
            if (!isActive) {
                return {
                    success: false,
                    remainingCredits: currentCredits,
                    error: 'Subscription inactive'
                };
            }
            // Consume credits
            const newCredits = currentCredits - amount;
            transaction.update(userRef, {
                'subscription.currentCredits': newCredits,
                'subscription.lastUsed': admin.firestore.FieldValue.serverTimestamp()
            });
            // Create transaction record
            const transactionId = db.collection('users').doc(userId).collection('creditTransactions').doc().id;
            const transactionRef = db.collection('users').doc(userId).collection('creditTransactions').doc(transactionId);
            transaction.set(transactionRef, {
                id: transactionId,
                userId,
                type: 'consumption',
                amount: -amount,
                operation,
                metadata,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                balanceAfter: newCredits,
                status: 'completed'
            });
            return {
                success: true,
                remainingCredits: newCredits,
                transactionId
            };
        });
        // Log the operation
        await (0, audit_1.auditLog)({
            userId,
            action: 'credit_consumed',
            level: audit_1.LogLevel.INFO,
            details: {
                amount,
                operation,
                success: result.success,
                remainingCredits: result.remainingCredits
            },
            timestamp: new Date()
        });
        return result;
    }
    catch (error) {
        console.error('Error consuming credits:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to consume credits');
    }
});
/**
 * Task 5.2: Get credit status with caching optimization (Callable Function)
 */
exports.getCreditStatus = functions.https.onCall(async (data, context) => {
    var _a;
    try {
        // Validate authentication
        const userId = await (0, auth_1.validateAuth)(context);
        if (!userId) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // Get user document
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User not found');
        }
        const userData = userDoc.data();
        const subscription = userData.subscription || {};
        const credits = userData.credits || {};
        const creditStatus = {
            hasCredits: (credits.available || 0) > 0,
            available: credits.available || 0,
            used: credits.used || 0,
            total: credits.total || 10,
            required: 1,
            canProceed: (credits.available || 0) > 0,
            message: (credits.available || 0) > 0 ? 'Credits available' : 'No credits remaining',
            plan: subscription.plan || 'free',
            resetDate: ((_a = credits.resetDate) === null || _a === void 0 ? void 0 : _a.toDate()) || new Date()
        };
        // REMOVE NOISE: Don't log routine credit status checks
        // This was generating excessive audit logs for every status check
        return creditStatus;
    }
    catch (error) {
        console.error('Error getting credit status:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to get credit status');
    }
});
/**
 * HTTP version of getCreditStatus for extension compatibility
 */
exports.getCreditStatusHttp = functions.https.onRequest(async (req, res) => {
    var _a;
    try {
        // Enable CORS
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        const { userId, userEmail } = req.body;
        if (!userId || !userEmail) {
            res.status(400).json({ error: 'Missing userId or userEmail' });
            return;
        }
        // Get user document
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const userData = userDoc.data();
        const subscription = userData.subscription || {};
        const credits = userData.credits || {};
        const creditStatus = {
            hasCredits: (credits.available || 0) > 0,
            available: credits.available || 0,
            used: credits.used || 0,
            total: credits.total || 10,
            required: 1,
            canProceed: (credits.available || 0) > 0,
            message: (credits.available || 0) > 0 ? 'Credits available' : 'No credits remaining',
            plan: subscription.plan || 'free',
            resetDate: ((_a = credits.resetDate) === null || _a === void 0 ? void 0 : _a.toDate()) || new Date()
        };
        // REMOVE NOISE: Don't log routine credit status checks
        // This was generating excessive audit logs for every status check
        res.status(200).json(creditStatus);
    }
    catch (error) {
        console.error('Error getting credit status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * Secure AI Response Flow - Single gatekeeper for credit consumption and AI generation
 * Implements atomic transactions to prevent exploits and provides consolidated response
 */
exports.consumeCreditHttp = functions.https.onRequest(async (req, res) => {
    try {
        // Enable CORS
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        const { userId, userEmail, operation, reviewData, aiRequest } = req.body;
        if (!userId || !userEmail || !aiRequest) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        // MANDATORY: Atomic transaction wrapper for security
        const result = await db.runTransaction(async (transaction) => {
            var _a, _b, _c, _d, _e, _f;
            // READ: Get the user document
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('User not found');
            }
            const userData = userDoc.data();
            const credits = userData.credits || {};
            const currentCredits = credits.available || 0;
            // CHECK: Validate credits before proceeding
            if (currentCredits <= 0) {
                return {
                    success: false,
                    error: 'INSUFFICIENT_CREDITS'
                };
            }
            // EXECUTE: Call OpenAI API (inside transaction to ensure atomicity)
            let aiResponse;
            try {
                const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${functions.config().openai.api_key}`
                    },
                    body: JSON.stringify(aiRequest)
                });
                if (!openaiResponse.ok) {
                    throw new Error(`OpenAI API error: ${openaiResponse.status}`);
                }
                const openaiData = await openaiResponse.json();
                aiResponse = (_c = (_b = (_a = openaiData.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
                if (!aiResponse) {
                    throw new Error('No response text from OpenAI');
                }
            }
            catch (openaiError) {
                console.error('OpenAI API failed inside transaction:', openaiError);
                // If OpenAI fails, the transaction fails - no credit consumed
                throw new Error(`AI generation failed: ${openaiError}`);
            }
            // WRITE: Only update credits after successful OpenAI response
            const newCredits = currentCredits - 1;
            const newUsed = (credits.used || 0) + 1;
            transaction.update(userRef, {
                'credits.available': newCredits,
                'credits.used': newUsed,
                'credits.lastUsage': admin.firestore.FieldValue.serverTimestamp()
            });
            // Create transaction record
            const transactionId = db.collection('users').doc(userId).collection('creditTransactions').doc().id;
            const transactionRef = db.collection('users').doc(userId).collection('creditTransactions').doc(transactionId);
            transaction.set(transactionRef, {
                id: transactionId,
                userId,
                type: 'usage',
                amount: -1,
                operation: operation || 'individual_response',
                metadata: {
                    reviewId: reviewData === null || reviewData === void 0 ? void 0 : reviewData.id,
                    responseType: 'ai_generated',
                    prompt: ((_f = (_e = (_d = aiRequest.messages) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.content) === null || _f === void 0 ? void 0 : _f.substring(0, 100)) + '...' // Truncated for logging
                },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                balanceAfter: newCredits,
                description: `AI response generated for review ${(reviewData === null || reviewData === void 0 ? void 0 : reviewData.id) || 'unknown'}`
            });
            return {
                success: true,
                aiResponse,
                newCreditBalance: newCredits
            };
        });
        // Handle transaction results
        if (!result.success) {
            console.log(`[Credit Check Failed] User ${userId}: ${result.error}`);
            res.status(400).json(result);
            return;
        }
        // Log successful operation
        await (0, audit_1.auditLog)({
            userId,
            action: 'ai_response_generated',
            level: audit_1.LogLevel.INFO,
            details: {
                operation,
                reviewId: reviewData === null || reviewData === void 0 ? void 0 : reviewData.id,
                success: true,
                creditsConsumed: 1,
                remainingCredits: result.newCreditBalance
            },
            timestamp: new Date()
        });
        // Return consolidated response payload
        res.status(200).json(result);
    }
    catch (error) {
        console.error('Error in consumeCreditHttp:', error);
        // Log failed operation
        await (0, audit_1.auditLog)({
            userId: req.body.userId || 'unknown',
            action: 'ai_response_failed',
            level: audit_1.LogLevel.CRITICAL,
            details: {
                operation: req.body.operation || 'unknown',
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            timestamp: new Date()
        });
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR'
        });
    }
});
/**
 * Task 5.4: Manual credit adjustment for support (admin only)
 */
exports.adjustCredits = functions.https.onCall(async (data, context) => {
    var _a;
    try {
        // Validate authentication and admin role
        const adminUserId = await (0, auth_1.validateAuth)(context);
        if (!adminUserId) {
            throw new functions.https.HttpsError('unauthenticated', 'Admin must be authenticated');
        }
        // Check if user has admin role
        const adminRef = db.collection('users').doc(adminUserId);
        const adminDoc = await adminRef.get();
        const adminRole = (_a = adminDoc.data()) === null || _a === void 0 ? void 0 : _a.role;
        if (adminRole !== 'admin' && adminRole !== 'support') {
            throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
        }
        const { userId, amount, reason, type = 'manual_adjustment' } = data;
        // Validate input
        if (!userId || typeof amount !== 'number' || !reason) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
        }
        // Use atomic transaction to adjust credits
        const result = await db.runTransaction(async (transaction) => {
            var _a;
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Target user not found');
            }
            const userData = userDoc.data();
            const currentCredits = ((_a = userData.subscription) === null || _a === void 0 ? void 0 : _a.currentCredits) || 0;
            const newCredits = Math.max(0, currentCredits + amount);
            // Update user credits
            transaction.update(userRef, {
                'subscription.currentCredits': newCredits,
                'subscription.lastModified': admin.firestore.FieldValue.serverTimestamp()
            });
            // Create transaction record
            const transactionId = db.collection('users').doc(userId).collection('creditTransactions').doc().id;
            const transactionRef = db.collection('users').doc(userId).collection('creditTransactions').doc(transactionId);
            transaction.set(transactionRef, {
                id: transactionId,
                userId,
                type,
                amount,
                reason,
                adminUserId,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                balanceAfter: newCredits,
                status: 'completed'
            });
            return {
                success: true,
                previousCredits: currentCredits,
                newCredits,
                transactionId
            };
        });
        // Log the admin action
        await (0, audit_1.auditLog)({
            userId: adminUserId,
            action: 'credit_adjusted',
            level: audit_1.LogLevel.CRITICAL,
            details: {
                targetUserId: userId,
                amount,
                reason,
                type,
                result
            },
            timestamp: new Date()
        });
        return result;
    }
    catch (error) {
        console.error('Error adjusting credits:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to adjust credits');
    }
});
/**
 * Batch credit operations for efficiency
 */
exports.batchCreditOperations = functions.https.onCall(async (data, context) => {
    try {
        const userId = await (0, auth_1.validateAuth)(context);
        if (!userId) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const { operations } = data;
        if (!Array.isArray(operations) || operations.length === 0 || operations.length > 10) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid operations array');
        }
        const results = [];
        // Process operations in batches
        const batch = db.batch();
        const userRef = db.collection('users').doc(userId);
        for (const operation of operations) {
            const { type, amount, metadata } = operation;
            // Create transaction record
            const transactionRef = userRef.collection('creditTransactions').doc();
            batch.set(transactionRef, {
                id: transactionRef.id,
                userId,
                type,
                amount,
                metadata,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: 'completed'
            });
            results.push({
                operationId: transactionRef.id,
                type,
                amount,
                status: 'queued'
            });
        }
        await batch.commit();
        return {
            success: true,
            operations: results,
            processedCount: operations.length
        };
    }
    catch (error) {
        console.error('Error in batch credit operations:', error);
        throw new functions.https.HttpsError('internal', 'Failed to process batch operations');
    }
});
//# sourceMappingURL=creditManager.js.map