import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export all credit management functions
export { consumeCredit, getCreditStatus, getCreditStatusHttp, consumeCreditHttp, adjustCredits } from './creditManager';
export { monthlyReset } from './scheduledFunctions';
export { paddleWebhook } from './paddleWebhooks';
export { rateLimitMiddleware } from './rateLimiter';
export { logAnalytics, getUserAnalytics } from './analytics';

// Health check function
export const healthCheck = functions.https.onRequest((req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
}); 