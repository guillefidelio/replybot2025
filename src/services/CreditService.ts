// src/services/CreditService.ts

import {
  doc,
  getDoc,
  // setDoc, // Removed unused
  // updateDoc, // Removed unused
  runTransaction,
  onSnapshot,
  collection,
  // addDoc, // Removed unused
  serverTimestamp,
  Timestamp,
  // FieldValue, // Removed unused
} from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile } from '../types/firebase';
import type { CreditTransaction /*, SubscriptionPlan*/ } from '../types/payment'; // Removed SubscriptionPlan

// Removed unused function convertTimestampsToDates
// function convertTimestampsToDates(data: any): any { ... }


export class CreditService {
  private static instance: CreditService;
  private userCreditListeners: Map<string, () => void> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): CreditService {
    if (!CreditService.instance) {
      CreditService.instance = new CreditService();
    }
    return CreditService.instance;
  }

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
          amount: -amount,
          description,
          relatedId,
        };
        transaction.set(doc(transactionColRef), { // doc() here creates a new doc ref in the subcollection
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
          amount: amount,
          description,
          relatedId,
        };
        transaction.set(doc(transactionColRef), { // doc() here creates a new doc ref in the subcollection
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

  async hasFeatureAccess(userId: string, featureId: string): Promise<boolean> {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data() as UserProfile;
        return userData.activeFeatures?.includes(featureId) ?? false;
      }
      console.warn(`User not found when checking feature access: ${userId}`);
      return false;
    } catch (error) {
      console.error(`Error checking feature access for ${userId}:`, error);
      throw error;
    }
  }

  onCreditChange(userId: string, callback: (credits: number) => void): () => void {
    this.userCreditListeners.get(userId)?.();

    const userDocRef = doc(db, 'users', userId);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data() as UserProfile;
        callback(userData.credits ?? 0);
      } else {
        callback(0);
      }
    }, (error) => {
      console.error(`Error listening to credit changes for ${userId}:`, error);
    });

    this.userCreditListeners.set(userId, unsubscribe);
    return unsubscribe;
  }

  public cleanupListeners(): void {
    this.userCreditListeners.forEach(unsubscribe => unsubscribe());
    this.userCreditListeners.clear();
    console.log('Cleaned up all CreditService listeners.');
  }
}
