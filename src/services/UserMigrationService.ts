import { 
  doc, 
  getDoc, 
  updateDoc, 
  serverTimestamp,
  type Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';
import type { 
  SubscriptionInfo, 
  CreditInfo, 
  FeatureAccess, 
  UserPreferences 
} from '../types/payment';
import { 
  DEFAULT_USER_SUBSCRIPTION, 
  DEFAULT_USER_CREDITS, 
  DEFAULT_USER_FEATURES, 
  DEFAULT_USER_PREFERENCES 
} from '../types/payment';
import { MigrationService } from './MigrationService';

/**
 * UserMigrationService handles automatic migration of existing users
 * to the new payment system structure when they log in.
 * 
 * This ensures backward compatibility and seamless user experience.
 */
export class UserMigrationService {
  private static readonly MIGRATION_VERSION = '1.0.0';
  private static readonly MIGRATION_TIMEOUT = 10000; // 10 seconds timeout

  /**
   * Check if a user needs migration to the new payment system
   */
  private static needsPaymentMigration(userData: any): boolean {
    // Check if user has all required payment fields
    const hasSubscription = userData.subscription && 
      typeof userData.subscription === 'object' &&
      userData.subscription.plan;
    
    const hasCredits = userData.credits && 
      typeof userData.credits === 'object' &&
      typeof userData.credits.available === 'number';
    
    const hasFeatures = userData.features && 
      typeof userData.features === 'object';
    
    const hasPreferences = userData.preferences && 
      typeof userData.preferences === 'object';
    
    const hasCorrectVersion = userData.migrationVersion === this.MIGRATION_VERSION;

    return !hasSubscription || !hasCredits || !hasFeatures || !hasPreferences || !hasCorrectVersion;
  }

  /**
   * Create default payment data for legacy users
   */
  private static createLegacyUserPaymentData(): {
    subscription: SubscriptionInfo;
    credits: CreditInfo;
    features: FeatureAccess;
    preferences: UserPreferences;
  } {
    const now = new Date();
    const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      subscription: {
        ...DEFAULT_USER_SUBSCRIPTION,
        currentPeriodStart: serverTimestamp() as Timestamp,
        currentPeriodEnd: monthFromNow as any,
        // Legacy users get a grace period
        status: 'active',
        plan: 'free'
      },
      credits: {
        ...DEFAULT_USER_CREDITS,
        // Legacy users get bonus credits as a welcome gift
        available: 15, // 5 extra credits for existing users
        total: 15,
        resetDate: monthFromNow as any,
        carryover: 0,
      },
      features: {
        ...DEFAULT_USER_FEATURES,
        // Legacy users might get some features enabled based on usage
      },
      preferences: {
        ...DEFAULT_USER_PREFERENCES,
        notifications: {
          lowCredits: true,
          monthlyUsage: true,
          billingReminders: false, // Don't overwhelm legacy users initially
        },
        creditWarningThreshold: 5,
        autoUpgrade: false,
      },
    };
  }

  /**
   * Migrate a user to the new payment system structure
   */
  private static async migrateUserToPaymentSystem(user: User, userData: any): Promise<boolean> {
    try {
      console.log(`Starting payment migration for user: ${user.email}`);
      
      const userDocRef = doc(db, 'users', user.uid);
      const paymentData = this.createLegacyUserPaymentData();
      
      // Preserve all existing user data and add payment fields
      const migrationData = {
        // Preserve existing data
        ...userData,
        
        // Add payment fields only if they don't exist or are incomplete
        subscription: userData.subscription && this.isValidSubscription(userData.subscription) 
          ? userData.subscription 
          : paymentData.subscription,
        
        credits: userData.credits && this.isValidCredits(userData.credits)
          ? userData.credits 
          : paymentData.credits,
        
        features: userData.features && this.isValidFeatures(userData.features)
          ? userData.features 
          : paymentData.features,
        
        preferences: userData.preferences && this.isValidPreferences(userData.preferences)
          ? userData.preferences 
          : paymentData.preferences,
        
        // Migration tracking
        migrationVersion: this.MIGRATION_VERSION,
        migratedAt: serverTimestamp() as Timestamp,
        migrationSource: 'login_auto_migration',
        updatedAt: serverTimestamp() as Timestamp,
      };

      await updateDoc(userDocRef, migrationData);
      
      console.log(`Successfully migrated user to payment system: ${user.email}`);
      return true;
    } catch (error) {
      console.error(`Failed to migrate user ${user.email}:`, error);
      return false;
    }
  }

  /**
   * Validate subscription data structure
   */
  private static isValidSubscription(subscription: any): boolean {
    return subscription && 
      typeof subscription === 'object' &&
      subscription.plan &&
      subscription.status &&
      subscription.currentPeriodStart &&
      subscription.currentPeriodEnd;
  }

  /**
   * Validate credits data structure
   */
  private static isValidCredits(credits: any): boolean {
    return credits && 
      typeof credits === 'object' &&
      typeof credits.available === 'number' &&
      typeof credits.used === 'number' &&
      typeof credits.total === 'number' &&
      credits.resetDate;
  }

  /**
   * Validate features data structure
   */
  private static isValidFeatures(features: any): boolean {
    return features && 
      typeof features === 'object' &&
      typeof features.bulkPositive === 'boolean' &&
      typeof features.bulkAll === 'boolean' &&
      typeof features.customPrompts === 'boolean';
  }

  /**
   * Validate preferences data structure
   */
  private static isValidPreferences(preferences: any): boolean {
    return preferences && 
      typeof preferences === 'object' &&
      preferences.notifications &&
      typeof preferences.notifications === 'object';
  }

  /**
   * Main method: Check and migrate user if needed during login
   */
  static async checkAndMigrateUser(user: User): Promise<{
    migrated: boolean;
    success: boolean;
    error?: string;
  }> {
    try {
      // Set a timeout for the migration process
      const migrationPromise = this.performMigrationCheck(user);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Migration timeout')), this.MIGRATION_TIMEOUT);
      });

      const result = await Promise.race([migrationPromise, timeoutPromise]);
      return result;
    } catch (error) {
      console.error('Migration check failed:', error);
      return {
        migrated: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown migration error'
      };
    }
  }

  /**
   * Perform the actual migration check and process
   */
  private static async performMigrationCheck(user: User): Promise<{
    migrated: boolean;
    success: boolean;
    error?: string;
  }> {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        // User document doesn't exist - this should be handled by UserService.createUserDocument
        return { migrated: false, success: true };
      }

      const userData = userDoc.data();
      
      // Check if migration is needed
      if (!this.needsPaymentMigration(userData)) {
        console.log(`User ${user.email} already has payment system structure`);
        return { migrated: false, success: true };
      }

      // Perform migration
      const migrationSuccess = await this.migrateUserToPaymentSystem(user, userData);
      
      if (migrationSuccess) {
        // Log successful migration for analytics
        console.log(`Payment migration completed for user: ${user.email}`);
        
        // Optional: Send migration analytics
        await this.logMigrationEvent(user.uid, 'success');
        
        return { migrated: true, success: true };
      } else {
        await this.logMigrationEvent(user.uid, 'failed');
        return { 
          migrated: false, 
          success: false, 
          error: 'Migration process failed' 
        };
      }
    } catch (error) {
      console.error('Error during migration check:', error);
      await this.logMigrationEvent(user.uid, 'error', error instanceof Error ? error.message : 'Unknown error');
      
      return {
        migrated: false,
        success: false,
        error: error instanceof Error ? error.message : 'Migration check failed'
      };
    }
  }

  /**
   * Log migration events for monitoring and analytics
   */
  private static async logMigrationEvent(
    userId: string, 
    status: 'success' | 'failed' | 'error', 
    errorMessage?: string
  ): Promise<void> {
    try {
      // Log to console for development
      console.log(`Migration event: ${status} for user ${userId}`, errorMessage ? { error: errorMessage } : '');
      
      // In production, you might want to send this to an analytics service
      // await AnalyticsService.logEvent('user_migration', {
      //   userId,
      //   status,
      //   errorMessage,
      //   timestamp: new Date().toISOString()
      // });
    } catch (error) {
      console.error('Failed to log migration event:', error);
      // Don't throw error here to avoid disrupting the migration process
    }
  }

  /**
   * Batch migrate multiple users (for admin use)
   */
  static async batchMigrateUsers(
    userIds: string[],
    progressCallback?: (progress: { completed: number; total: number; currentUser: string }) => void
  ): Promise<{
    successful: number;
    failed: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    console.log(`Starting batch migration for ${userIds.length} users`);
    
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as Array<{ userId: string; error: string }>
    };

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      
      try {
        // Use the existing MigrationService for batch operations
        const migrated = await MigrationService.migrateUser(userId);
        
        if (migrated) {
          results.successful++;
          console.log(`Batch migration successful for user: ${userId}`);
        } else {
          results.failed++;
          results.errors.push({ userId, error: 'Migration returned false' });
        }
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push({ userId, error: errorMessage });
        console.error(`Batch migration failed for user ${userId}:`, error);
      }

      // Report progress
      if (progressCallback) {
        progressCallback({
          completed: i + 1,
          total: userIds.length,
          currentUser: userId
        });
      }
    }

    console.log(`Batch migration completed. Successful: ${results.successful}, Failed: ${results.failed}`);
    return results;
  }

  /**
   * Get migration statistics
   */
  static async getMigrationStats(): Promise<{
    totalUsers: number;
    migratedUsers: number;
    pendingMigration: number;
    migrationRate: number;
  }> {
    try {
      const migrationStatus = await MigrationService.getMigrationStatus();
      
      // Convert the response to match the expected interface
      return {
        totalUsers: migrationStatus.total,
        migratedUsers: migrationStatus.migrated,
        pendingMigration: migrationStatus.needsMigration,
        migrationRate: migrationStatus.migrationRate
      };
    } catch (error) {
      console.error('Failed to get migration stats:', error);
      return {
        totalUsers: 0,
        migratedUsers: 0,
        pendingMigration: 0,
        migrationRate: 0
      };
    }
  }
} 