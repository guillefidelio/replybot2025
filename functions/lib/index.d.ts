import * as functions from 'firebase-functions';
export { consumeCredit, getCreditStatus, getCreditStatusHttp, consumeCreditHttp, adjustCredits } from './creditManager';
export { monthlyReset } from './scheduledFunctions';
export { paddleWebhook } from './paddleWebhooks';
export { rateLimitMiddleware } from './rateLimiter';
export { logAnalytics, getUserAnalytics, dailyAnalyticsAggregator } from './analytics';
export { getUserAuditLogs, getSecurityLogs, cleanupAuditLogs, exportAuditLogs, auditLogSink } from './audit';
export { getUserSessionData } from './handshake';
export { requestAIGeneration, processAIGeneration } from './aiGeneration';
export declare const healthCheck: functions.HttpsFunction;
//# sourceMappingURL=index.d.ts.map