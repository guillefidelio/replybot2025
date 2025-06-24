import * as functions from 'firebase-functions';
/**
 * Part 1.2: Lightning-Fast Callable Function - requestAIGeneration
 * Atomically consumes credit and creates job, returns immediately (< 500ms)
 *
 * NEW: Implements business-level free trial lock with admin override
 */
export declare const requestAIGeneration: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Part 1.3: Background Cloud Function - processAIGeneration
 * Triggered by onCreate event on generationJobs collection
 */
export declare const processAIGeneration: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
//# sourceMappingURL=aiGeneration.d.ts.map