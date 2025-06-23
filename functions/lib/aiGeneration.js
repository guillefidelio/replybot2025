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
exports.processAIGeneration = exports.requestAIGeneration = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const audit_1 = require("./audit");
const db = admin.firestore();
/**
 * Part 1.2: Lightning-Fast Callable Function - requestAIGeneration
 * Atomically consumes credit and creates job, returns immediately (< 500ms)
 */
exports.requestAIGeneration = functions.https.onCall(async (data, context) => {
    const startTime = Date.now();
    try {
        // Ensure user is authenticated
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const { userId, userEmail, systemPrompt, userPrompt, reviewData, aiRequest } = data;
        if (!userId || !userEmail || !systemPrompt || !userPrompt || !aiRequest) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
        }
        // ATOMIC TRANSACTION: Credit consumption + Job creation
        const result = await db.runTransaction(async (transaction) => {
            // READ: Get user document
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('User not found');
            }
            const userData = userDoc.data();
            const credits = userData.credits || {};
            const currentCredits = credits.available || 0;
            // CHECK: Validate credits
            if (currentCredits <= 0) {
                return {
                    success: false,
                    error: 'INSUFFICIENT_CREDITS'
                };
            }
            // CONSUME CREDIT: Update user document
            const newCredits = currentCredits - 1;
            const newUsed = (credits.used || 0) + 1;
            transaction.update(userRef, {
                'credits.available': newCredits,
                'credits.used': newUsed,
                'credits.lastUsage': admin.firestore.FieldValue.serverTimestamp()
            });
            // CREATE JOB: Add to generation jobs collection
            const jobRef = db.collection('users').doc(userId).collection('generationJobs').doc();
            const jobId = jobRef.id;
            const jobData = {
                id: jobId,
                userId,
                status: 'pending',
                systemPrompt,
                userPrompt,
                reviewData,
                aiRequest,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            transaction.set(jobRef, jobData);
            // CREATE TRANSACTION RECORD
            const transactionRef = db.collection('users').doc(userId).collection('creditTransactions').doc();
            transaction.set(transactionRef, {
                id: transactionRef.id,
                userId,
                type: 'usage',
                amount: -1,
                operation: 'async_ai_generation',
                metadata: {
                    jobId,
                    reviewId: reviewData === null || reviewData === void 0 ? void 0 : reviewData.id,
                    responseType: 'async_ai_generated'
                },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                balanceAfter: newCredits,
                description: `Async AI generation job ${jobId} created`
            });
            return {
                success: true,
                jobId,
                newCreditBalance: newCredits
            };
        });
        const executionTime = Date.now() - startTime;
        console.log(`[requestAIGeneration] Execution time: ${executionTime}ms`);
        // Handle transaction results
        if (!result.success) {
            console.log(`[Credit Check Failed] User ${userId}: ${result.error}`);
            if (result.error === 'INSUFFICIENT_CREDITS') {
                throw new functions.https.HttpsError('resource-exhausted', 'Insufficient credits');
            }
            throw new functions.https.HttpsError('internal', result.error || 'Transaction failed');
        }
        // REMOVE NOISE: Use specialized AI logging function instead
        // This removes noise by not logging every request
        // await logAIGeneration(userId, 'requested', result.jobId, { ... });
        // Return immediate response (target < 500ms)
        return result;
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        console.error('Error in requestAIGeneration:', error);
        // Log failed operation
        await (0, audit_1.logAIGeneration)(data.userId || 'unknown', 'failed', 'request_failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            executionTime
        });
        // Re-throw Firebase errors, wrap others
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : 'Unknown error');
    }
});
/**
 * Part 1.3: Background Cloud Function - processAIGeneration
 * Triggered by onCreate event on generationJobs collection
 */
exports.processAIGeneration = functions.firestore
    .document('users/{userId}/generationJobs/{jobId}')
    .onCreate(async (snapshot, context) => {
    var _a, _b, _c, _d;
    const startTime = Date.now();
    const { userId, jobId } = context.params;
    try {
        const jobData = snapshot.data();
        console.log(`[processAIGeneration] Processing job ${jobId} for user ${userId}`);
        // Update job status to indicate processing has started
        await snapshot.ref.update({
            processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Call OpenAI API
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${functions.config().openai.api_key}`
            },
            body: JSON.stringify(jobData.aiRequest)
        });
        if (!openaiResponse.ok) {
            throw new Error(`OpenAI API error: ${openaiResponse.status} ${openaiResponse.statusText}`);
        }
        const openaiData = await openaiResponse.json();
        const aiResponse = (_c = (_b = (_a = openaiData.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
        if (!aiResponse) {
            throw new Error('No response text from OpenAI');
        }
        // Update job with successful result
        await snapshot.ref.update({
            status: 'completed',
            aiResponse,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const executionTime = Date.now() - startTime;
        console.log(`[processAIGeneration] Job ${jobId} completed in ${executionTime}ms`);
        // Log successful operation
        await (0, audit_1.logAIGeneration)(userId, 'completed', jobId, {
            reviewId: (_d = jobData.reviewData) === null || _d === void 0 ? void 0 : _d.id,
            success: true,
            processingTime: executionTime
        });
    }
    catch (error) {
        console.error(`[processAIGeneration] Error processing job ${jobId}:`, error);
        // Update job with error status
        await snapshot.ref.update({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown processing error',
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Log failed operation
        await (0, audit_1.logAIGeneration)(userId, 'failed', jobId, {
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTime: Date.now() - startTime
        });
    }
});
//# sourceMappingURL=aiGeneration.js.map