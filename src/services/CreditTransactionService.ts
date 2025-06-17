import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  where,
  serverTimestamp,
  // runTransaction, // Removed unused import
  type Timestamp,
  type Transaction
} from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';
import type { 
  CreditTransaction, 
  CreditTransactionType, 
  CreditTransactionMetadata 
} from '../types/payment';

// Service for managing credit transactions with audit trail
export class CreditTransactionService {
  
  // Get credit transactions collection reference for a user
  private static getCreditTransactionsCollection(userId: string) {
    return collection(db, 'users', userId, 'creditTransactions');
  }

  // Create a new credit transaction with audit trail
  static async createTransaction(
    user: User,
    type: CreditTransactionType,
    amount: number,
    balanceAfter: number,
    description: string,
    metadata: CreditTransactionMetadata = {},
    firestoreTransaction?: Transaction
  ): Promise<string> {
    try {
      const transactionData = {
        type,
        amount,
        balanceAfter,
        timestamp: serverTimestamp() as Timestamp,
        description,
        metadata: {
          ...metadata,
          // Audit trail information
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          timestamp: new Date().toISOString(),
          userId: user.uid,
          userEmail: user.email || 'unknown',
        },
        // Additional audit fields
        audit: {
          createdBy: user.uid,
          createdAt: serverTimestamp() as Timestamp,
          source: 'extension', // 'extension', 'webhook', 'admin', 'system'
          version: '1.0',
        }
      };

      const transactionsCollection = this.getCreditTransactionsCollection(user.uid);

      if (firestoreTransaction) {
        // Use provided Firestore transaction for atomic operations
        const docRef = doc(transactionsCollection);
        firestoreTransaction.set(docRef, transactionData);
        return docRef.id;
      } else {
        // Create standalone transaction
        const docRef = await addDoc(transactionsCollection, transactionData);
        console.log(`Created credit transaction: ${type} for ${amount} credits`);
        return docRef.id;
      }
    } catch (error) {
      console.error('Error creating credit transaction:', error);
      throw new Error(`Failed to create credit transaction: ${error}`);
    }
  }

  // Get user's credit transaction history
  static async getTransactionHistory(
    user: User,
    limitCount: number = 50,
    startAfterTimestamp?: Date
  ): Promise<CreditTransaction[]> {
    try {
      const transactionsCollection = this.getCreditTransactionsCollection(user.uid);
      
      let transactionQuery = query(
        transactionsCollection,
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      // Add pagination support
      if (startAfterTimestamp) {
        transactionQuery = query(
          transactionsCollection,
          orderBy('timestamp', 'desc'),
          where('timestamp', '<', startAfterTimestamp),
          limit(limitCount)
        );
      }

      const querySnapshot = await getDocs(transactionQuery);
      const transactions: CreditTransaction[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        transactions.push({
          id: doc.id,
          type: data.type,
          amount: data.amount,
          balanceAfter: data.balanceAfter,
          timestamp: data.timestamp,
          description: data.description,
          metadata: data.metadata || {},
        });
      });

      return transactions;
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw new Error('Failed to retrieve transaction history');
    }
  }

  // Get transactions by type for analytics
  static async getTransactionsByType(
    user: User,
    type: CreditTransactionType,
    limitCount: number = 100
  ): Promise<CreditTransaction[]> {
    try {
      const transactionsCollection = this.getCreditTransactionsCollection(user.uid);
      
      const transactionQuery = query(
        transactionsCollection,
        where('type', '==', type),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(transactionQuery);
      const transactions: CreditTransaction[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        transactions.push({
          id: doc.id,
          type: data.type,
          amount: data.amount,
          balanceAfter: data.balanceAfter,
          timestamp: data.timestamp,
          description: data.description,
          metadata: data.metadata || {},
        });
      });

      return transactions;
    } catch (error) {
      console.error('Error getting transactions by type:', error);
      throw new Error(`Failed to retrieve ${type} transactions`);
    }
  }

  // Get transactions within a date range for analytics
  static async getTransactionsInDateRange(
    user: User,
    startDate: Date,
    endDate: Date,
    limitCount: number = 1000
  ): Promise<CreditTransaction[]> {
    try {
      const transactionsCollection = this.getCreditTransactionsCollection(user.uid);
      
      const transactionQuery = query(
        transactionsCollection,
        where('timestamp', '>=', startDate),
        where('timestamp', '<=', endDate),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(transactionQuery);
      const transactions: CreditTransaction[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        transactions.push({
          id: doc.id,
          type: data.type,
          amount: data.amount,
          balanceAfter: data.balanceAfter,
          timestamp: data.timestamp,
          description: data.description,
          metadata: data.metadata || {},
        });
      });

      return transactions;
    } catch (error) {
      console.error('Error getting transactions in date range:', error);
      throw new Error('Failed to retrieve transactions for date range');
    }
  }

  // Calculate total credit usage for a period
  static async calculateUsageForPeriod(
    user: User,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalUsage: number;
    totalAllocated: number;
    transactionCount: number;
    breakdown: Record<CreditTransactionType, number>;
  }> {
    try {
      const transactions = await this.getTransactionsInDateRange(user, startDate, endDate);
      
      let totalUsage = 0;
      let totalAllocated = 0;
      let transactionCount = 0;
      const breakdown: Record<CreditTransactionType, number> = {
        usage: 0,
        allocation: 0,
        purchase: 0,
        reset: 0,
        refund: 0,
        bonus: 0,
      };

      transactions.forEach((transaction) => {
        transactionCount++;
        breakdown[transaction.type] += Math.abs(transaction.amount);

        if (transaction.amount < 0) {
          totalUsage += Math.abs(transaction.amount);
        } else {
          totalAllocated += transaction.amount;
        }
      });

      return {
        totalUsage,
        totalAllocated,
        transactionCount,
        breakdown,
      };
    } catch (error) {
      console.error('Error calculating usage for period:', error);
      throw new Error('Failed to calculate usage statistics');
    }
  }

  // Helper method to create usage transaction (most common type)
  static async recordUsage(
    user: User,
    creditsUsed: number,
    balanceAfter: number,
    reviewId?: string,
    responseType: 'individual' | 'bulk' = 'individual',
    firestoreTransaction?: Transaction
  ): Promise<string> {
    const description = reviewId 
      ? `AI response generated for review ${reviewId} (${responseType})`
      : `AI response generated (${responseType})`;

    const metadata: CreditTransactionMetadata = {
      reviewId,
      responseType,
      ipAddress: typeof window !== 'undefined' ? 'client-side' : 'server-side',
    };

    return this.createTransaction(
      user,
      'usage',
      -creditsUsed, // Negative for usage
      balanceAfter,
      description,
      metadata,
      firestoreTransaction
    );
  }

  // Helper method to create allocation transaction (monthly reset)
  static async recordAllocation(
    user: User,
    creditsAllocated: number,
    balanceAfter: number,
    plan: string,
    firestoreTransaction?: Transaction
  ): Promise<string> {
    const description = `Monthly credit allocation for ${plan} plan`;

    const metadata: CreditTransactionMetadata = {
      planUpgrade: plan,
      allocationReason: 'monthly_reset',
    };

    return this.createTransaction(
      user,
      'allocation',
      creditsAllocated,
      balanceAfter,
      description,
      metadata,
      firestoreTransaction
    );
  }

  // Helper method to create purchase transaction (plan upgrade)
  static async recordPurchase(
    user: User,
    creditsAdded: number,
    balanceAfter: number,
    planUpgrade: string,
    paddleTransactionId?: string,
    firestoreTransaction?: Transaction
  ): Promise<string> {
    const description = `Credits purchased via plan upgrade to ${planUpgrade}`;

    const metadata: CreditTransactionMetadata = {
      planUpgrade,
      paddleTransactionId,
      purchaseSource: 'plan_upgrade',
    };

    return this.createTransaction(
      user,
      'purchase',
      creditsAdded,
      balanceAfter,
      description,
      metadata,
      firestoreTransaction
    );
  }

  // Helper method to create refund transaction
  static async recordRefund(
    user: User,
    creditsRefunded: number,
    balanceAfter: number,
    refundReason: string,
    originalTransactionId?: string,
    firestoreTransaction?: Transaction
  ): Promise<string> {
    const description = `Credit refund: ${refundReason}`;

    const metadata: CreditTransactionMetadata = {
      refundReason,
      originalTransactionId,
      refundSource: 'admin',
    };

    return this.createTransaction(
      user,
      'refund',
      creditsRefunded,
      balanceAfter,
      description,
      metadata,
      firestoreTransaction
    );
  }

  // Helper method to create bonus transaction
  static async recordBonus(
    user: User,
    bonusCredits: number,
    balanceAfter: number,
    bonusReason: string,
    firestoreTransaction?: Transaction
  ): Promise<string> {
    const description = `Bonus credits awarded: ${bonusReason}`;

    const metadata: CreditTransactionMetadata = {
      bonusReason,
      bonusSource: 'admin',
    };

    return this.createTransaction(
      user,
      'bonus',
      bonusCredits,
      balanceAfter,
      description,
      metadata,
      firestoreTransaction
    );
  }
} 