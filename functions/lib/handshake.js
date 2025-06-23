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
exports.getUserSessionData = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("./auth");
const db = admin.firestore();
/**
 * Single handshake function to fetch all user session data
 * This implements the "Handshake Principle" for optimized startup
 */
exports.getUserSessionData = functions.https.onCall(async (data, context) => {
    var _a;
    try {
        // Validate authentication
        const userId = await (0, auth_1.validateAuth)(context);
        if (!userId) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // Use Promise.all for concurrent fetching to maximize speed
        const [userDoc, promptsSnapshot] = await Promise.all([
            // Fetch user document (credits, subscription)
            db.collection('users').doc(userId).get(),
            // Fetch all user prompts
            db.collection('users').doc(userId).collection('prompts')
                .orderBy('updatedAt', 'desc')
                .get()
        ]);
        // Check if user document exists
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User document not found');
        }
        const userData = userDoc.data();
        const subscription = userData.subscription || {};
        const credits = userData.credits || {};
        // Parse prompts data
        const prompts = promptsSnapshot.docs.map(doc => {
            const promptData = doc.data();
            return {
                id: promptData.id || doc.id,
                title: generatePromptTitle(promptData.rating, promptData.hasText),
                content: promptData.content || '',
                rating: promptData.rating || 1,
                hasText: promptData.hasText || false
            };
        });
        // Construct the consolidated response payload
        const sessionData = {
            credits: {
                available: credits.available || 0,
                total: credits.total || credits.available || 10, // Fallback to available or default 10
                used: (credits.total || credits.available || 10) - (credits.available || 0)
            },
            subscription: {
                plan: subscription.plan || 'free',
                status: subscription.status || 'inactive',
                isActive: subscription.isActive || false,
                currentPeriodEnd: (_a = subscription.currentPeriodEnd) === null || _a === void 0 ? void 0 : _a.toDate()
            },
            prompts
        };
        console.log(`[Handshake] Session data fetched for user ${userId}:`, {
            credits: sessionData.credits,
            plan: sessionData.subscription.plan,
            promptCount: prompts.length
        });
        return sessionData;
    }
    catch (error) {
        console.error('Error in getUserSessionData:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to fetch user session data');
    }
});
/**
 * Generate a user-friendly title for a prompt based on rating and text status
 */
function generatePromptTitle(rating, hasText) {
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const textType = hasText ? 'Detailed' : 'Quick';
    return `${stars} ${textType} Response`;
}
//# sourceMappingURL=handshake.js.map