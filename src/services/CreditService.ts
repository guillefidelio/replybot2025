// src/services/CreditService.ts

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  onSnapshot,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  FieldValue,
} from 'firebase/firestore';
import { db } from '../firebase'; // Assuming db is your Firestore instance
import type { UserProfile } from '../types/firebase';
import type { CreditTransaction, SubscriptionPlan } from '../types/payment';

// Helper to convert Firestore Timestamps to Dates in nested objects
function convertTimestampsToDates(data: any): any {
  if (data && typeof data === 'object') {
    for (const key in data) {
      if (data[key] instanceof Timestamp) {
        data[key] = data[key].toDate();
      } else if (typeof data[key] === 'object') {
        convertTimestampsToDates(data[key]); // Recurse for nested objects
      }
    }
  }
  return data;
}


export class CreditService {
  private static instance: CreditService;
  private userCreditListeners: Map<string, () => void> = new Map(); // To store unsubscribe functions

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): CreditService {
    if (!CreditService.instance) {
      CreditService.instance = new CreditService();
    }
    return CreditService.instance;
  }

  /**
   * Retrieves the current credit balance for a user.
   * @param userId The ID of the user.
   * @returns A promise that resolves to the user's credit balance, or null if user not found.
   */
  async getUserCredits(userId: string): Promise<number | null> {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data() as UserProfile;
        return userData.credits ?? 0;
      }
      console.warn(`User not found: ${userId}`);
      return null;
    } catch (error) {
      console.error(`Error getting user credits for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Consumes a specified amount of credits from a user's balance.
   * Logs the transaction in the 'creditTransactions' subcollection.
   * @param userId The ID of the user.
   * @param amount The number of credits to consume (should be positive).
   * @param description A description of why the credits are being consumed.
   * @param relatedId Optional ID related to this consumption (e.g., AI request ID).
   * @returns A promise that resolves when the transaction is complete.
   */
  async consumeCredits(userId: string, amount: number, description: string, relatedId?: string): Promise<void> {
    if (amount <= 0) {
      throw new Error('Amount to consume must be positive.');
    }

    const userDocRef = doc(db, 'users', userId);
    const transactionColRef = collection(userDocRef, 'creditTransactions');

    try {
      await runTransaction(db, async (transaction) => {
        const userDocSnap = await transaction.get(userDocRef);
        if (!userDocSnap.exists()) {
          throw new Error(`User not found: ${userId}`);
        }

        const userData = userDocSnap.data() as UserProfile;
        const currentCredits = userData.credits ?? 0;

        if (currentCredits < amount) {
          throw new Error('Insufficient credits.');
        }

        const newBalance = currentCredits - amount;
        transaction.update(userDocRef, { credits: newBalance });

        const newTransaction: Omit<CreditTransaction, 'id' | 'timestamp'> = {
          userId,
          type: 'usage',
          amount: -amount, // Store as negative for consumption
          description,
          relatedId,
        };
        // Firestore will add 'id' and 'timestamp' (via serverTimestamp)
        // We need to cast serverTimestamp() to Timestamp for the transaction log,
        // but it will be FieldValue for the actual write.
        transaction.set(doc(transactionColRef), {
          ...newTransaction,
          timestamp: serverTimestamp() as unknown as Timestamp
        });
      });
      console.log(`Successfully consumed ${amount} credits for user ${userId}.`);
    } catch (error) {
      console.error(`Error consuming credits for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Adds a specified amount of credits to a user's balance.
   * Logs the transaction in the 'creditTransactions' subcollection.
   * @param userId The ID of the user.
   * @param amount The number of credits to add (should be positive).
   * @param description A description of why the credits are being added.
   * @param transactionType The type of credit addition.
   * @param relatedId Optional ID related to this addition (e.g., purchase order ID).
   * @returns A promise that resolves when the transaction is complete.
   */
  async addCredits(
    userId: string,
    amount: number,
    description: string,
    transactionType: 'purchase' | 'initial_allocation' | 'bonus' | 'refund' = 'purchase',
    relatedId?: string
  ): Promise<void> {
    if (amount <= 0) {
      throw new Error('Amount to add must be positive.');
    }

    const userDocRef = doc(db, 'users', userId);
    const transactionColRef = collection(userDocRef, 'creditTransactions');

    try {
      await runTransaction(db, async (transaction) => {
        const userDocSnap = await transaction.get(userDocRef);
        if (!userDocSnap.exists()) {
          throw new Error(`User not found: ${userId}`);
        }

        const userData = userDocSnap.data() as UserProfile;
        const currentCredits = userData.credits ?? 0;
        const newBalance = currentCredits + amount;

        transaction.update(userDocRef, { credits: newBalance });

        const newTransaction: Omit<CreditTransaction, 'id' | 'timestamp'> = {
          userId,
          type: transactionType,
          amount: amount, // Store as positive for addition
          description,
          relatedId,
        };
        transaction.set(doc(transactionColRef), {
          ...newTransaction,
          timestamp: serverTimestamp() as unknown as Timestamp
        });
      });
      console.log(`Successfully added ${amount} credits for user ${userId}.`);
    } catch (error) {
      console.error(`Error adding credits for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Checks if a user has access to a specific feature based on their active subscription.
   * @param userId The ID of the user.
   * @param featureId The ID of the feature to check.
   * @returns A promise that resolves to true if the user has access, false otherwise.
   */
  async hasFeatureAccess(userId: string, featureId: string): Promise<boolean> {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data() as UserProfile;
        // Ensure activeFeatures is an array, even if undefined in Firestore
        return userData.activeFeatures?.includes(featureId) ?? false;
      }
      console.warn(`User not found when checking feature access: ${userId}`);
      return false;
    } catch (error) {
      console.error(`Error checking feature access for ${userId}:`, error);
      throw error; // Or return false depending on desired behavior
    }
  }

  /**
   * Subscribes to real-time updates for a user's credit balance.
   * @param userId The ID of the user.
   * @param callback A function to call with the new credit balance whenever it changes.
   * @returns An unsubscribe function to stop listening for updates.
   */
  onCreditChange(userId: string, callback: (credits: number) => void): () => void {
    // Remove any existing listener for this user to avoid duplicates
    this.userCreditListeners.get(userId)?.();

    const userDocRef = doc(db, 'users', userId);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data() as UserProfile;
        callback(userData.credits ?? 0);
      } else {
        // Handle user document deletion or non-existence if necessary
        callback(0); // Or throw an error, or call with null
      }
    }, (error) => {
      console.error(`Error listening to credit changes for ${userId}:`, error);
      // Potentially call callback with a special error value or re-throw
    });

    this.userCreditListeners.set(userId, unsubscribe);
    return unsubscribe;
  }

  /**
   * Cleans up all active listeners when they are no longer needed.
   * For example, when the service is being destroyed or user logs out.
   */
  public cleanupListeners(): void {
    this.userCreditListeners.forEach(unsubscribe => unsubscribe());
    this.userCreditListeners.clear();
    console.log('Cleaned up all CreditService listeners.');
  }

  // --- Placeholder for Caching ---
  // TODO: Implement credit status caching for offline functionality
  // This might involve:
  // - Storing last known credit balance in localStorage/IndexedDB
  // - Retrieving from cache if offline
  // - Syncing with Firestore when back online

  // async getCachedUserCredits(userId: string): Promise<number | null> {
  //   // 1. Try to get from Firestore
  //   // 2. If offline or error, try to get from local cache
  //   // 3. Update cache whenever Firestore data is fetched
  //   return this.getUserCredits(userId); // Placeholder
  // }
}
