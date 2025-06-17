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
exports.refreshUserToken = void 0;
exports.validateAuth = validateAuth;
exports.hasRole = hasRole;
exports.validateAdminAuth = validateAdminAuth;
exports.validateSupportAuth = validateSupportAuth;
exports.setUserRole = setUserRole;
exports.isServiceAccount = isServiceAccount;
exports.getUserRateLimit = getUserRateLimit;
exports.validateOrigin = validateOrigin;
exports.setSecurityHeaders = setSecurityHeaders;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const auth = admin.auth();
const db = admin.firestore();
/**
 * Validate authentication from function context
 */
async function validateAuth(context) {
    if (!context.auth) {
        return null;
    }
    try {
        // Verify the token is still valid
        // Token is already verified by Firebase Functions
        // await auth.verifyIdToken(context.auth.token);
        return context.auth.uid;
    }
    catch (error) {
        console.error('Token validation failed:', error);
        return null;
    }
}
/**
 * Check if user has specific role
 */
async function hasRole(userId, requiredRole) {
    var _a;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return false;
        }
        const userData = userDoc.data();
        const userRole = userData.role || 'user';
        // Define role hierarchy
        const roleHierarchy = {
            'admin': ['admin', 'support', 'user'],
            'support': ['support', 'user'],
            'user': ['user']
        };
        return ((_a = roleHierarchy[userRole]) === null || _a === void 0 ? void 0 : _a.includes(requiredRole)) || false;
    }
    catch (error) {
        console.error('Error checking user role:', error);
        return false;
    }
}
/**
 * Validate admin access
 */
async function validateAdminAuth(context) {
    const userId = await validateAuth(context);
    if (!userId) {
        return null;
    }
    const isAdmin = await hasRole(userId, 'admin');
    return isAdmin ? userId : null;
}
/**
 * Validate support access (admin or support role)
 */
async function validateSupportAuth(context) {
    const userId = await validateAuth(context);
    if (!userId) {
        return null;
    }
    const hasAccess = await hasRole(userId, 'support');
    return hasAccess ? userId : null;
}
/**
 * Create custom claims for user roles
 */
async function setUserRole(userId, role) {
    try {
        await auth.setCustomUserClaims(userId, { role });
        // Also update in Firestore for consistency
        await db.collection('users').doc(userId).update({
            role,
            roleUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        console.error('Error setting user role:', error);
        throw error;
    }
}
/**
 * Refresh user token to include updated claims
 */
exports.refreshUserToken = functions.https.onCall(async (data, context) => {
    try {
        const userId = await validateAuth(context);
        if (!userId) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // Force token refresh by updating a claim
        const user = await auth.getUser(userId);
        const claims = user.customClaims || {};
        await auth.setCustomUserClaims(userId, Object.assign(Object.assign({}, claims), { refreshed: Date.now() }));
        return { success: true, message: 'Token refreshed' };
    }
    catch (error) {
        console.error('Error refreshing token:', error);
        throw new functions.https.HttpsError('internal', 'Failed to refresh token');
    }
});
/**
 * Validate service account access (for internal functions)
 */
function isServiceAccount(context) {
    var _a;
    return ((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid) === undefined && context.rawRequest.headers['x-service-account'] === 'true';
}
/**
 * Rate limit validation based on user tier
 */
async function getUserRateLimit(userId) {
    var _a;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return { requests: 10, windowMs: 60000 }; // Default: 10 requests per minute
        }
        const userData = userDoc.data();
        const plan = ((_a = userData.subscription) === null || _a === void 0 ? void 0 : _a.plan) || 'free';
        // Define rate limits by plan
        const rateLimits = {
            'free': { requests: 10, windowMs: 60000 }, // 10/min
            'basic': { requests: 30, windowMs: 60000 }, // 30/min
            'premium': { requests: 100, windowMs: 60000 }, // 100/min
            'enterprise': { requests: 500, windowMs: 60000 } // 500/min
        };
        return rateLimits[plan] || rateLimits['free'];
    }
    catch (error) {
        console.error('Error getting user rate limit:', error);
        return { requests: 10, windowMs: 60000 };
    }
}
/**
 * Validate request origin and CORS
 */
function validateOrigin(req) {
    const allowedOrigins = [
        'chrome-extension://',
        'moz-extension://',
        'https://replybot25.firebaseapp.com',
        'https://replybot25.web.app'
    ];
    const origin = req.headers.origin || '';
    const userAgent = req.headers['user-agent'] || '';
    // Allow Chrome extension requests
    if (userAgent.includes('Chrome') && origin.startsWith('chrome-extension://')) {
        return true;
    }
    // Allow Firefox extension requests
    if (userAgent.includes('Firefox') && origin.startsWith('moz-extension://')) {
        return true;
    }
    // Allow web app requests
    return allowedOrigins.some(allowed => allowed.startsWith('https://') && origin === allowed);
}
/**
 * Security headers middleware
 */
function setSecurityHeaders(res) {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
}
//# sourceMappingURL=auth.js.map