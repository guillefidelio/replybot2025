import { 
  collection, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp,
  writeBatch,
  query,
  limit,
  startAfter,
  orderBy,
  // type DocumentSnapshot, // Removed unused import
  type QueryDocumentSnapshot,
  type Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import type { 
  SubscriptionInfo, 
  CreditInfo, 
  FeatureAccess, 
  UserPreferences,
  // DEFAULT_USER_SUBSCRIPTION,
  // DEFAULT_USER_CREDITS,
  // DEFAULT_USER_FEATURES,
  // DEFAULT_USER_PREFERENCES
} from '../types/payment';

// Migration service for adding payment fields to existing users
export class MigrationService {
  
  // Batch size for processing users to avoid memory issues
  private static readonly BATCH_SIZE = 50;
  
  // Migration version tracking
  private static readonly MIGRATION_VERSION = '1.0.0';
  
  // Check if a user document needs migration
  private static needsMigration(userData: any): boolean {
    return !userData.subscription || 
           !userData.credits || 
           !userData.features || 
           !userData.preferences ||
           userData.migrationVersion !== this.MIGRATION_VERSION;
  }

  // Create default payment data for migration
  private static createDefaultPaymentData(): {
    subscription: SubscriptionInfo;
    credits: CreditInfo;
    features: FeatureAccess;
    preferences: UserPreferences;
  } {
    const now = new Date();
    const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      subscription: {
        plan: 'free',
        status: 'active',
        currentPeriodStart: serverTimestamp() as Timestamp,
        currentPeriodEnd: monthFromNow as any,
        cancelAtPeriodEnd: false,
      },
      credits: {
        available: 10,
        used: 0,
        total: 10,
        resetDate: monthFromNow as any,
        carryover: 0,
      },
      features: {
        bulkPositive: false,
        bulkAll: false,
        customPrompts: false,
        analytics: false,
        multiLocation: false,
        apiAccess: false,
      },
      preferences: {
        notifications: {
          lowCredits: true,
          monthlyUsage: true,
          billingReminders: true,
        },
        autoUpgrade: false,
        creditWarningThreshold: 5,
      },
    };
  }

  // Migrate a single user document
  private static async migrateUserDocument(
    userId: string, 
    userData: any,
    batch?: any // WriteBatch type
  ): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', userId);
      const defaultPaymentData = this.createDefaultPaymentData();
      
      // Preserve existing data and add missing payment fields
      const updatedData = {
        ...userData,
        // Only add subscription if it doesn't exist or is incomplete
        subscription: userData.subscription || defaultPaymentData.subscription,
        // Only add credits if they don't exist or are incomplete
        credits: userData.credits || defaultPaymentData.credits,
        // Only add features if they don't exist
        features: userData.features || defaultPaymentData.features,
        // Only add preferences if they don't exist
        preferences: userData.preferences || defaultPaymentData.preferences,
        // Track migration
        migrationVersion: this.MIGRATION_VERSION,
        migratedAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };

      if (batch) {
        batch.update(userDocRef, updatedData);
      } else {
        await updateDoc(userDocRef, updatedData);
      }

      console.log(`Migrated user: ${userId}`);
    } catch (error) {
      console.error(`Error migrating user ${userId}:`, error);
      throw error;
    }
  }

  // Migrate all users in batches
  static async migrateAllUsers(
    progressCallback?: (progress: { migrated: number; total: number; current: string }) => void
  ): Promise<{
    migrated: number;
    skipped: number;
    errors: string[];
    duration: number;
  }> {
    const startTime = Date.now();
    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];
    let lastDoc: QueryDocumentSnapshot | null = null;

    try {
      console.log('Starting user migration process...');

      // First, count total users for progress tracking
      const usersRef = collection(db, 'users');
      let totalUsers = 0;
      
      try {
        const countSnapshot = await getDocs(usersRef);
        totalUsers = countSnapshot.size;
        console.log(`Found ${totalUsers} users to process`);
      } catch (error) {
        console.warn('Could not get total user count, proceeding with migration');
      }

      // Process users in batches
      while (true) {
        let batchQuery = query(
          usersRef,
          orderBy('createdAt'),
          limit(this.BATCH_SIZE)
        );

        if (lastDoc) {
          batchQuery = query(
            usersRef,
            orderBy('createdAt'),
            startAfter(lastDoc),
            limit(this.BATCH_SIZE)
          );
        }

        const snapshot = await getDocs(batchQuery);
        
        if (snapshot.empty) {
          break; // No more users to process
        }

        // Create a batch for atomic updates
        const batch = writeBatch(db);
        let batchUpdates = 0;

        for (const userDoc of snapshot.docs) {
          const userData = userDoc.data();
          const userId = userDoc.id;

          try {
            if (this.needsMigration(userData)) {
              await this.migrateUserDocument(userId, userData, batch);
              batchUpdates++;
              migrated++;
            } else {
              skipped++;
              console.log(`Skipped user ${userId} (already migrated)`);
            }

            // Update progress
            if (progressCallback) {
              progressCallback({
                migrated: migrated + skipped,
                total: totalUsers || migrated + skipped,
                current: userId,
              });
            }
          } catch (error) {
            const errorMsg = `Failed to prepare migration for user ${userId}: ${error}`;
            errors.push(errorMsg);
            console.error(errorMsg);
          }
        }

        // Commit batch updates
        if (batchUpdates > 0) {
          try {
            await batch.commit();
            console.log(`Committed batch of ${batchUpdates} user migrations`);
          } catch (error) {
            const errorMsg = `Failed to commit batch: ${error}`;
            errors.push(errorMsg);
            console.error(errorMsg);
          }
        }

        // Set up for next batch
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        // Add a small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const duration = Date.now() - startTime;
      const summary = {
        migrated,
        skipped,
        errors,
        duration,
      };

      console.log('Migration completed:', summary);
      return summary;

    } catch (error) {
      console.error('Migration process failed:', error);
      throw new Error(`Migration failed: ${error}`);
    }
  }

  // Migrate a specific user by ID
  static async migrateUser(userId: string): Promise<boolean> {
    try {
      // const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDocs(query(collection(db, 'users'), orderBy('createdAt'), limit(1)));
      
      if (userDoc.empty) {
        throw new Error(`User ${userId} not found`);
      }

      const userData = userDoc.docs[0].data();
      
      if (!this.needsMigration(userData)) {
        console.log(`User ${userId} already migrated`);
        return false;
      }

      await this.migrateUserDocument(userId, userData);
      console.log(`Successfully migrated user ${userId}`);
      return true;

    } catch (error) {
      console.error(`Error migrating user ${userId}:`, error);
      throw error;
    }
  }

  // Rollback migration for a user (remove payment fields)
  static async rollbackUser(userId: string): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        subscription: null,
        credits: null,
        features: null,
        preferences: null,
        migrationVersion: null,
        migratedAt: null,
        updatedAt: serverTimestamp() as Timestamp,
      });

      console.log(`Rolled back migration for user ${userId}`);
    } catch (error) {
      console.error(`Error rolling back user ${userId}:`, error);
      throw error;
    }
  }

  // Check migration status across all users
  static async getMigrationStatus(): Promise<{
    total: number;
    migrated: number;
    needsMigration: number;
    migrationRate: number;
  }> {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      let total = 0;
      let migrated = 0;
      
      snapshot.forEach((doc) => {
        total++;
        const userData = doc.data();
        if (!this.needsMigration(userData)) {
          migrated++;
        }
      });

      const needsMigration = total - migrated;
      const migrationRate = total > 0 ? (migrated / total) * 100 : 0;

      return {
        total,
        migrated,
        needsMigration,
        migrationRate: Math.round(migrationRate * 100) / 100,
      };
    } catch (error) {
      console.error('Error getting migration status:', error);
      throw error;
    }
  }

  // Validate migrated user data
  static async validateMigratedUser(userId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    try {
      // const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDocs(query(collection(db, 'users'), orderBy('createdAt'), limit(1)));
      
      if (userDoc.empty) {
        return { valid: false, issues: ['User not found'] };
      }

      const userData = userDoc.docs[0].data();
      const issues: string[] = [];

      // Validate subscription
      if (!userData.subscription) {
        issues.push('Missing subscription data');
      } else {
        if (!userData.subscription.plan || !['free', 'starter', 'professional'].includes(userData.subscription.plan)) {
          issues.push('Invalid subscription plan');
        }
        if (!userData.subscription.status || !['active', 'canceled', 'past_due', 'trialing'].includes(userData.subscription.status)) {
          issues.push('Invalid subscription status');
        }
      }

      // Validate credits
      if (!userData.credits) {
        issues.push('Missing credits data');
      } else {
        if (typeof userData.credits.available !== 'number' || userData.credits.available < 0) {
          issues.push('Invalid credits available');
        }
        if (typeof userData.credits.used !== 'number' || userData.credits.used < 0) {
          issues.push('Invalid credits used');
        }
        if (typeof userData.credits.total !== 'number' || userData.credits.total < 0) {
          issues.push('Invalid credits total');
        }
      }

      // Validate features
      if (!userData.features) {
        issues.push('Missing features data');
      }

      // Validate preferences
      if (!userData.preferences) {
        issues.push('Missing preferences data');
      }

      return {
        valid: issues.length === 0,
        issues,
      };
    } catch (error) {
      console.error(`Error validating user ${userId}:`, error);
      return { valid: false, issues: [`Validation error: ${error}`] };
    }
  }
} 