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
exports.healthCheck = exports.getUserAnalytics = exports.logAnalytics = exports.rateLimitMiddleware = exports.paddleWebhook = exports.monthlyReset = exports.adjustCredits = exports.consumeCreditHttp = exports.getCreditStatusHttp = exports.getCreditStatus = exports.consumeCredit = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
// Initialize Firebase Admin SDK
admin.initializeApp();
// Export all credit management functions
var creditManager_1 = require("./creditManager");
Object.defineProperty(exports, "consumeCredit", { enumerable: true, get: function () { return creditManager_1.consumeCredit; } });
Object.defineProperty(exports, "getCreditStatus", { enumerable: true, get: function () { return creditManager_1.getCreditStatus; } });
Object.defineProperty(exports, "getCreditStatusHttp", { enumerable: true, get: function () { return creditManager_1.getCreditStatusHttp; } });
Object.defineProperty(exports, "consumeCreditHttp", { enumerable: true, get: function () { return creditManager_1.consumeCreditHttp; } });
Object.defineProperty(exports, "adjustCredits", { enumerable: true, get: function () { return creditManager_1.adjustCredits; } });
var scheduledFunctions_1 = require("./scheduledFunctions");
Object.defineProperty(exports, "monthlyReset", { enumerable: true, get: function () { return scheduledFunctions_1.monthlyReset; } });
var paddleWebhooks_1 = require("./paddleWebhooks");
Object.defineProperty(exports, "paddleWebhook", { enumerable: true, get: function () { return paddleWebhooks_1.paddleWebhook; } });
var rateLimiter_1 = require("./rateLimiter");
Object.defineProperty(exports, "rateLimitMiddleware", { enumerable: true, get: function () { return rateLimiter_1.rateLimitMiddleware; } });
var analytics_1 = require("./analytics");
Object.defineProperty(exports, "logAnalytics", { enumerable: true, get: function () { return analytics_1.logAnalytics; } });
Object.defineProperty(exports, "getUserAnalytics", { enumerable: true, get: function () { return analytics_1.getUserAnalytics; } });
// Health check function
exports.healthCheck = functions.https.onRequest((req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});
//# sourceMappingURL=index.js.map