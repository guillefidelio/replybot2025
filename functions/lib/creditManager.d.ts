import * as functions from 'firebase-functions';
/**
 * Task 5.1: Consume credits with atomic Firestore transactions
 */
export declare const consumeCredit: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Task 5.2: Get credit status with caching optimization (Callable Function)
 */
export declare const getCreditStatus: functions.HttpsFunction & functions.Runnable<any>;
/**
 * HTTP version of getCreditStatus for extension compatibility
 */
export declare const getCreditStatusHttp: functions.HttpsFunction;
/**
 * Secure AI Response Flow - Single gatekeeper for credit consumption and AI generation
 * Implements atomic transactions to prevent exploits and provides consolidated response
 */
export declare const consumeCreditHttp: functions.HttpsFunction;
/**
 * Task 5.4: Manual credit adjustment for support (admin only)
 */
export declare const adjustCredits: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Batch credit operations for efficiency
 */
export declare const batchCreditOperations: functions.HttpsFunction & functions.Runnable<any>;
//# sourceMappingURL=creditManager.d.ts.map