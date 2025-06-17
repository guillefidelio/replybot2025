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
exports.creditConsumptionRateLimit = exports.AbuseDetector = void 0;
exports.rateLimitMiddleware = rateLimitMiddleware;
exports.temporaryBlock = temporaryBlock;
exports.isUserBlocked = isUserBlocked;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
// import { RateLimiterFirestore } from 'rate-limiter-flexible';
const db = admin.firestore();
// Rate limiter instances for different operations
// const rateLimiters = new Map<string, RateLimiterFirestore>();
/**
 * Initialize rate limiter for specific operation (placeholder)
 */
// function getRateLimiter(operation: string, options: {
//   points: number;
//   duration: number;
//   blockDuration?: number;
// }): RateLimiterFirestore {
//   const key = `${operation}_${options.points}_${options.duration}`;
//   
//   if (!rateLimiters.has(key)) {
//     const limiter = new RateLimiterFirestore({
//       storeClient: db,
//       keyPrefix: `rate_limit_${operation}`,
//       points: options.points,
//       duration: options.duration,
//       blockDuration: options.blockDuration || options.duration,
//       execEvenly: true
//     });
//     rateLimiters.set(key, limiter);
//   }
//   
//   return rateLimiters.get(key)!;
// }
/**
 * Rate limit middleware for HTTP functions
 */
async function rateLimitMiddleware(req, res, operation, userId) {
    try {
        // Simplified rate limiting - just log for now
        console.log('Rate limit check for:', { operation, userId, ip: req.ip });
        // TODO: Implement actual rate limiting when rate-limiter-flexible is properly configured
        return true;
    }
    catch (error) {
        console.error('Rate limiting error:', error);
        return true;
    }
}
/**
 * Get rate limits for specific user based on subscription
 */
// async function getUserRateLimits(userId: string): Promise<{ points: number; duration: number }> {
//   try {
//     const userDoc = await db.collection('users').doc(userId).get();
//     if (!userDoc.exists) {
//       return { points: 10, duration: 60 }; // Default limits
//     }
//     const userData = userDoc.data()!;
//     const plan = userData.subscription?.plan || 'free';
//     // Define rate limits by subscription plan
//     const planLimits: { [key: string]: { points: number; duration: number } } = {
//       'free': { points: 20, duration: 60 },        // 20 requests per minute
//       'basic': { points: 60, duration: 60 },       // 60 requests per minute
//       'premium': { points: 200, duration: 60 },    // 200 requests per minute
//       'enterprise': { points: 1000, duration: 60 } // 1000 requests per minute
//     };
//     return planLimits[plan] || planLimits['free'];
//   } catch (error) {
//     console.error('Error getting user rate limits:', error);
//     return { points: 10, duration: 60 };
//   }
// }
/**
 * Advanced abuse detection and prevention
 */
class AbuseDetector {
    constructor() {
        this.suspiciousActivityThreshold = 100;
    }
    // private abusePatterns = new Map<string, number>();
    static getInstance() {
        if (!AbuseDetector.instance) {
            AbuseDetector.instance = new AbuseDetector();
        }
        return AbuseDetector.instance;
    }
    /**
     * Check for suspicious activity patterns
     */
    async checkSuspiciousActivity(userId, operation) {
        try {
            let riskScore = 0;
            let reason = '';
            // Check rapid consumption patterns
            const recentTransactions = await this.getRecentTransactions(userId, 300); // Last 5 minutes
            if (recentTransactions.length > 50) {
                riskScore += 30;
                reason += 'High frequency usage. ';
            }
            // Check for unusual patterns
            const hourlyUsage = await this.getHourlyUsage(userId);
            if (hourlyUsage > 500) {
                riskScore += 40;
                reason += 'Excessive hourly usage. ';
            }
            // Check for bot-like behavior
            const isBot = await this.detectBotBehavior(userId);
            if (isBot) {
                riskScore += 50;
                reason += 'Bot-like behavior detected. ';
            }
            // Check IP reputation
            const ipRisk = await this.checkIPReputation(userId);
            riskScore += ipRisk;
            return {
                isSuspicious: riskScore >= this.suspiciousActivityThreshold,
                riskScore,
                reason: reason.trim()
            };
        }
        catch (error) {
            console.error('Error checking suspicious activity:', error);
            return { isSuspicious: false, riskScore: 0 };
        }
    }
    /**
     * Get recent transactions for pattern analysis
     */
    async getRecentTransactions(userId, seconds) {
        const cutoff = new Date(Date.now() - seconds * 1000);
        const snapshot = await db.collection('users')
            .doc(userId)
            .collection('creditTransactions')
            .where('timestamp', '>=', cutoff)
            .get();
        return snapshot.docs.map(doc => doc.data());
    }
    /**
     * Get hourly usage statistics
     */
    async getHourlyUsage(userId) {
        const oneHourAgo = new Date(Date.now() - 3600000);
        const snapshot = await db.collection('users')
            .doc(userId)
            .collection('creditTransactions')
            .where('timestamp', '>=', oneHourAgo)
            .where('type', '==', 'consumption')
            .get();
        return snapshot.docs.reduce((total, doc) => {
            const data = doc.data();
            return total + Math.abs(data.amount || 0);
        }, 0);
    }
    /**
     * Detect bot-like behavior patterns
     */
    async detectBotBehavior(userId) {
        var _a, _b, _c, _d;
        try {
            // Check for perfectly regular intervals
            const transactions = await this.getRecentTransactions(userId, 3600); // Last hour
            if (transactions.length < 10)
                return false;
            const intervals = [];
            for (let i = 1; i < transactions.length; i++) {
                const current = ((_b = (_a = transactions[i].timestamp) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date();
                const previous = ((_d = (_c = transactions[i - 1].timestamp) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c)) || new Date();
                intervals.push(current.getTime() - previous.getTime());
            }
            // Check for suspiciously regular intervals (within 100ms variance)
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const variance = intervals.reduce((sum, interval) => {
                return sum + Math.pow(interval - avgInterval, 2);
            }, 0) / intervals.length;
            return variance < 10000; // Very low variance indicates bot behavior
        }
        catch (error) {
            console.error('Error detecting bot behavior:', error);
            return false;
        }
    }
    /**
     * Check IP reputation (simplified implementation)
     */
    async checkIPReputation(userId) {
        try {
            // Get user's recent IP addresses from audit logs
            const auditSnapshot = await db.collection('auditLogs')
                .where('userId', '==', userId)
                .orderBy('timestamp', 'desc')
                .limit(10)
                .get();
            const ipAddresses = new Set();
            auditSnapshot.docs.forEach(doc => {
                var _a;
                const ip = (_a = doc.data().metadata) === null || _a === void 0 ? void 0 : _a.ip;
                if (ip)
                    ipAddresses.add(ip);
            });
            // Multiple IPs in short time = higher risk
            if (ipAddresses.size > 5) {
                return 20;
            }
            return 0;
        }
        catch (error) {
            console.error('Error checking IP reputation:', error);
            return 0;
        }
    }
}
exports.AbuseDetector = AbuseDetector;
/**
 * Log rate limit violations for monitoring
 */
// async function logRateLimitViolation(
//   key: string,
//   operation: string,
//   attempts: number,
//   limit: number
// ): Promise<void> {
//   try {
//     await db.collection('securityLogs').add({
//       type: 'rate_limit_violation',
//       key,
//       operation,
//       attempts,
//       limit,
//       timestamp: admin.firestore.FieldValue.serverTimestamp(),
//       severity: attempts > limit * 2 ? 'high' : 'medium'
//     });
//   } catch (error) {
//     console.error('Error logging rate limit violation:', error);
//   }
// }
/**
 * Block user temporarily for abuse
 */
async function temporaryBlock(userId, reason, durationMinutes = 60) {
    try {
        const unblockTime = new Date(Date.now() + durationMinutes * 60000);
        await db.collection('users').doc(userId).update({
            'security.blocked': true,
            'security.blockReason': reason,
            'security.blockedUntil': unblockTime,
            'security.blockedAt': admin.firestore.FieldValue.serverTimestamp()
        });
        // Log the block action
        await db.collection('securityLogs').add({
            type: 'user_blocked',
            userId,
            reason,
            duration: durationMinutes,
            unblockTime,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        console.error('Error blocking user:', error);
    }
}
/**
 * Check if user is currently blocked
 */
async function isUserBlocked(userId) {
    var _a, _b;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists)
            return false;
        const userData = userDoc.data();
        const security = userData.security || {};
        if (!security.blocked)
            return false;
        const blockedUntil = (_b = (_a = security.blockedUntil) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a);
        if (!blockedUntil)
            return false;
        // Check if block has expired
        if (new Date() > blockedUntil) {
            // Unblock user
            await db.collection('users').doc(userId).update({
                'security.blocked': false,
                'security.blockReason': admin.firestore.FieldValue.delete(),
                'security.blockedUntil': admin.firestore.FieldValue.delete()
            });
            return false;
        }
        return true;
    }
    catch (error) {
        console.error('Error checking user block status:', error);
        return false;
    }
}
/**
 * Rate limit for credit consumption specifically
 */
exports.creditConsumptionRateLimit = functions.https.onCall(async (data, context) => {
    var _a;
    const userId = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!userId) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    // Check if user is blocked
    if (await isUserBlocked(userId)) {
        throw new functions.https.HttpsError('permission-denied', 'User is temporarily blocked');
    }
    // Check for suspicious activity
    const abuseDetector = AbuseDetector.getInstance();
    const suspiciousCheck = await abuseDetector.checkSuspiciousActivity(userId, 'credit_consumption');
    if (suspiciousCheck.isSuspicious) {
        // Log suspicious activity
        await db.collection('securityLogs').add({
            type: 'suspicious_activity',
            userId,
            operation: 'credit_consumption',
            riskScore: suspiciousCheck.riskScore,
            reason: suspiciousCheck.reason,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        // Temporary block for high risk scores
        if (suspiciousCheck.riskScore > 150) {
            await temporaryBlock(userId, `Suspicious activity: ${suspiciousCheck.reason}`, 30);
            throw new functions.https.HttpsError('permission-denied', 'Account temporarily restricted');
        }
    }
    return { allowed: true, riskScore: suspiciousCheck.riskScore };
});
//# sourceMappingURL=rateLimiter.js.map