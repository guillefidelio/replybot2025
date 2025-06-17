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
exports.paddleWebhook = void 0;
// import * as admin from 'firebase-admin';
const functions = __importStar(require("firebase-functions"));
// import * as crypto from 'crypto';
const audit_1 = require("./audit");
// const db = admin.firestore();
/**
 * Paddle webhook handler (placeholder for future payment integration)
 * This will be implemented in Task 6.0 - Paddle Payment Integration
 */
exports.paddleWebhook = functions.https.onRequest(async (req, res) => {
    try {
        // CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        // TODO: Implement Paddle webhook signature verification
        // const signature = req.headers['paddle-signature'];
        // if (!verifyPaddleSignature(req.body, signature)) {
        //   res.status(401).json({ error: 'Invalid signature' });
        //   return;
        // }
        const webhookData = req.body;
        console.log('Received Paddle webhook:', webhookData);
        // Log the webhook receipt
        await (0, audit_1.auditLog)({
            userId: 'system',
            action: 'paddle_webhook_received',
            details: {
                event: webhookData.event_type || 'unknown',
                data: webhookData
            },
            timestamp: new Date()
        });
        // TODO: Process different webhook events
        // switch (webhookData.event_type) {
        //   case 'subscription_created':
        //     await handleSubscriptionCreated(webhookData);
        //     break;
        //   case 'subscription_updated':
        //     await handleSubscriptionUpdated(webhookData);
        //     break;
        //   case 'subscription_cancelled':
        //     await handleSubscriptionCancelled(webhookData);
        //     break;
        //   case 'payment_succeeded':
        //     await handlePaymentSucceeded(webhookData);
        //     break;
        //   case 'payment_failed':
        //     await handlePaymentFailed(webhookData);
        //     break;
        //   default:
        //     console.log('Unhandled webhook event:', webhookData.event_type);
        // }
        res.status(200).json({ status: 'received' });
    }
    catch (error) {
        console.error('Error processing Paddle webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * Placeholder function for signature verification
 */
// function verifyPaddleSignature(body: any, signature: string): boolean {
//   // TODO: Implement actual Paddle signature verification
//   // This will be implemented in Task 6.0
//   return true;
// } 
//# sourceMappingURL=paddleWebhooks.js.map