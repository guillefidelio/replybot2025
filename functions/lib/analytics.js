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
exports.getUserAnalytics = void 0;
exports.logAnalytics = logAnalytics;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("./auth");
const db = admin.firestore();
/**
 * Log analytics event
 */
async function logAnalytics(event) {
    try {
        const analyticsEntry = Object.assign(Object.assign({}, event), { timestamp: admin.firestore.FieldValue.serverTimestamp(), id: generateEventId(), processed: false });
        // Store in analytics collection
        await db.collection('analytics').add(analyticsEntry);
        // Also store in user-specific analytics for easy querying
        if (event.userId) {
            await db.collection('users')
                .doc(event.userId)
                .collection('analytics')
                .add(analyticsEntry);
        }
    }
    catch (error) {
        console.error('Error logging analytics:', error);
    }
}
/**
 * Get user analytics
 */
exports.getUserAnalytics = functions.https.onCall(async (data, context) => {
    try {
        const userId = await (0, auth_1.validateAuth)(context);
        if (!userId) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const { startDate, endDate, limit = 100 } = data;
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();
        const analyticsSnapshot = await db.collection('users')
            .doc(userId)
            .collection('analytics')
            .where('timestamp', '>=', start)
            .where('timestamp', '<=', end)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();
        const events = analyticsSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        return { events };
    }
    catch (error) {
        console.error('Error getting user analytics:', error);
        throw new functions.https.HttpsError('internal', 'Failed to get user analytics');
    }
});
/**
 * Generate unique event ID
 */
function generateEventId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `evt_${timestamp}_${random}`;
}
//# sourceMappingURL=analytics.js.map