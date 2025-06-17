import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  serverTimestamp,
  writeBatch,
  type Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { PLAN_CONFIGS } from '../types/payment';

// Service for seeding default data and configurations
export class DataSeedingService {
  
  // System configuration collection
  private static readonly SYSTEM_CONFIG_COLLECTION = 'systemConfig';
  private static readonly PLAN_CONFIGS_COLLECTION = 'planConfigs';
  
  // Seed all default data
  static async seedAllData(): Promise<{
    success: boolean;
    seeded: string[];
    skipped: string[];
    errors: string[];
  }> {
    const seeded: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    try {
      console.log('Starting data seeding process...');

      // Seed plan configurations
      const planResult = await this.seedPlanConfigurations();
      if (planResult.success) {
        seeded.push('planConfigurations');
      } else {
        errors.push('Failed to seed plan configurations');
      }

      // Seed system configuration
      const systemResult = await this.seedSystemConfiguration();
      if (systemResult.success) {
        seeded.push('systemConfiguration');
      } else {
        errors.push('Failed to seed system configuration');
      }

      // Seed credit allocation rules
      const creditResult = await this.seedCreditAllocationRules();
      if (creditResult.success) {
        seeded.push('creditAllocationRules');
      } else {
        errors.push('Failed to seed credit allocation rules');
      }

      // Seed default feature flags
      const featureResult = await this.seedFeatureFlags();
      if (featureResult.success) {
        seeded.push('featureFlags');
      } else {
        errors.push('Failed to seed feature flags');
      }

      console.log('Data seeding completed:', { seeded, skipped, errors });

      return {
        success: errors.length === 0,
        seeded,
        skipped,
        errors,
      };

    } catch (error) {
      console.error('Data seeding process failed:', error);
      return {
        success: false,
        seeded,
        skipped,
        errors: [`Seeding process failed: ${error}`],
      };
    }
  }

  // Seed subscription plan configurations
  static async seedPlanConfigurations(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Seeding plan configurations...');
      
      const batch = writeBatch(db);
      let seededCount = 0;

      for (const [planId, planConfig] of Object.entries(PLAN_CONFIGS)) {
        const planDocRef = doc(db, this.PLAN_CONFIGS_COLLECTION, planId);
        const planDoc = await getDoc(planDocRef);

        if (!planDoc.exists()) {
          const planData = {
            ...planConfig,
            createdAt: serverTimestamp() as Timestamp,
            updatedAt: serverTimestamp() as Timestamp,
            isActive: true,
            version: '1.0.0',
          };

          batch.set(planDocRef, planData);
          seededCount++;
          console.log(`Prepared seeding for plan: ${planId}`);
        } else {
          console.log(`Plan ${planId} already exists, skipping`);
        }
      }

      if (seededCount > 0) {
        await batch.commit();
        console.log(`Successfully seeded ${seededCount} plan configurations`);
        return { success: true, message: `Seeded ${seededCount} plans` };
      } else {
        return { success: true, message: 'All plans already exist' };
      }

    } catch (error) {
      console.error('Error seeding plan configurations:', error);
      return { success: false, message: `Failed to seed plans: ${error}` };
    }
  }

  // Seed system-wide configuration
  static async seedSystemConfiguration(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Seeding system configuration...');

      const systemConfigRef = doc(db, this.SYSTEM_CONFIG_COLLECTION, 'global');
      const systemDoc = await getDoc(systemConfigRef);

      if (!systemDoc.exists()) {
        const systemConfig = {
          // Credit system configuration
          creditSystem: {
            defaultFreeCredits: 10,
            maxCarryoverPercent: 20,
            resetDay: 1,
            warningThresholds: [5, 2, 0],
            gracePeriod: 3,
          },

          // Feature flags
          features: {
            bulkProcessing: true,
            customPrompts: true,
            analytics: true,
            multiLocation: true,
            apiAccess: false, // Coming soon
            betaFeatures: false,
          },

          // Rate limiting configuration
          rateLimits: {
            requestsPerMinute: 60,
            requestsPerHour: 1000,
            requestsPerDay: 10000,
            concurrentRequests: 10,
            burstAllowance: 20,
          },

          // Payment configuration
          payment: {
            paddleVendorId: process.env.PADDLE_VENDOR_ID || '',
            currency: 'USD',
            taxHandling: 'automatic',
            trialPeriodDays: 7,
            gracePeriodDays: 3,
          },

          // Analytics configuration
          analytics: {
            retentionDays: 365,
            aggregationIntervals: ['hourly', 'daily', 'monthly'],
            trackingEnabled: true,
            exportFormats: ['json', 'csv'],
          },

          // Security configuration
          security: {
            sessionTimeoutMinutes: 480, // 8 hours
            maxLoginAttempts: 5,
            lockoutDurationMinutes: 30,
            requireEmailVerification: true,
            passwordMinLength: 8,
          },

          // Notification settings
          notifications: {
            emailEnabled: true,
            smsEnabled: false,
            pushEnabled: true,
            defaultPreferences: {
              lowCredits: true,
              monthlyUsage: true,
              billingReminders: true,
              productUpdates: false,
              marketingEmails: false,
            },
          },

          // System metadata
          version: '1.0.0',
          lastUpdated: serverTimestamp() as Timestamp,
          createdAt: serverTimestamp() as Timestamp,
          environment: process.env.NODE_ENV || 'development',
        };

        await setDoc(systemConfigRef, systemConfig);
        console.log('Successfully seeded system configuration');
        return { success: true, message: 'Seeded system configuration' };

      } else {
        console.log('System configuration already exists, skipping');
        return { success: true, message: 'System configuration already exists' };
      }

    } catch (error) {
      console.error('Error seeding system configuration:', error);
      return { success: false, message: `Failed to seed system config: ${error}` };
    }
  }

  // Seed credit allocation rules
  static async seedCreditAllocationRules(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Seeding credit allocation rules...');

      const rulesRef = doc(db, this.SYSTEM_CONFIG_COLLECTION, 'creditAllocationRules');
      const rulesDoc = await getDoc(rulesRef);

      if (!rulesDoc.exists()) {
        const allocationRules = {
          monthlyAllocation: {
            free: {
              baseCredits: 10,
              carryoverLimit: 0,
              resetOnDate: 1,
            },
            starter: {
              baseCredits: 100,
              carryoverLimit: 20,
              resetOnDate: 1,
            },
            professional: {
              baseCredits: 500,
              carryoverLimit: 100,
              resetOnDate: 1,
            },
          },

          usageRules: {
            creditCosts: {
              individualResponse: 1,
              bulkPositiveResponse: 0.5,
              bulkAllResponse: 0.3,
            },
          },

          version: '1.0.0',
          lastUpdated: serverTimestamp() as Timestamp,
          createdAt: serverTimestamp() as Timestamp,
        };

        await setDoc(rulesRef, allocationRules);
        console.log('Successfully seeded credit allocation rules');
        return { success: true, message: 'Seeded credit allocation rules' };

      } else {
        console.log('Credit allocation rules already exist, skipping');
        return { success: true, message: 'Credit allocation rules already exist' };
      }

    } catch (error) {
      console.error('Error seeding credit allocation rules:', error);
      return { success: false, message: `Failed to seed allocation rules: ${error}` };
    }
  }

  // Seed feature flags
  static async seedFeatureFlags(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Seeding feature flags...');

      const flagsRef = doc(db, this.SYSTEM_CONFIG_COLLECTION, 'featureFlags');
      const flagsDoc = await getDoc(flagsRef);

      if (!flagsDoc.exists()) {
        const featureFlags = {
          // Core features
          core: {
            bulkProcessing: { enabled: true, rolloutPercent: 100 },
            customPrompts: { enabled: true, rolloutPercent: 100 },
            analytics: { enabled: true, rolloutPercent: 100 },
            multiLocation: { enabled: true, rolloutPercent: 100 },
          },

          // Beta features
          beta: {
            aiModelSelection: { enabled: false, rolloutPercent: 0 },
            apiAccess: { enabled: false, rolloutPercent: 0 },
            advancedAnalytics: { enabled: false, rolloutPercent: 10 },
            realTimeCollaboration: { enabled: false, rolloutPercent: 0 },
          },

          // Experimental features
          experimental: {
            voiceResponses: { enabled: false, rolloutPercent: 0 },
            multiLanguage: { enabled: false, rolloutPercent: 5 },
            sentimentAnalysis: { enabled: false, rolloutPercent: 0 },
            competitorAnalysis: { enabled: false, rolloutPercent: 0 },
          },

          // Plan-specific features
          planRestrictions: {
            free: ['bulkProcessing', 'customPrompts', 'analytics', 'multiLocation'],
            starter: ['analytics', 'multiLocation', 'apiAccess'],
            professional: ['apiAccess'],
          },

          // A/B testing flags
          abTests: {
            newOnboardingFlow: { enabled: false, variants: ['A', 'B'], allocation: [50, 50] },
            improvedUI: { enabled: false, variants: ['old', 'new'], allocation: [70, 30] },
            paymentModal: { enabled: false, variants: ['standard', 'premium'], allocation: [60, 40] },
          },

          // Kill switches
          killSwitches: {
            paddlePayments: false,
            emailNotifications: false,
            analyticsCollection: false,
            creditConsumption: false,
          },

          // Metadata
          version: '1.0.0',
          lastUpdated: serverTimestamp() as Timestamp,
          createdAt: serverTimestamp() as Timestamp,
        };

        await setDoc(flagsRef, featureFlags);
        console.log('Successfully seeded feature flags');
        return { success: true, message: 'Seeded feature flags' };

      } else {
        console.log('Feature flags already exist, skipping');
        return { success: true, message: 'Feature flags already exist' };
      }

    } catch (error) {
      console.error('Error seeding feature flags:', error);
      return { success: false, message: `Failed to seed feature flags: ${error}` };
    }
  }

  // Get current system configuration
  static async getSystemConfiguration(): Promise<any> {
    try {
      const systemConfigRef = doc(db, this.SYSTEM_CONFIG_COLLECTION, 'global');
      const systemDoc = await getDoc(systemConfigRef);

      if (systemDoc.exists()) {
        return systemDoc.data();
      }

      throw new Error('System configuration not found. Run seeding first.');
    } catch (error) {
      console.error('Error getting system configuration:', error);
      throw error;
    }
  }

  // Update specific system configuration
  static async updateSystemConfiguration(updates: any): Promise<void> {
    try {
      const systemConfigRef = doc(db, this.SYSTEM_CONFIG_COLLECTION, 'global');
      
      await setDoc(systemConfigRef, {
        ...updates,
        lastUpdated: serverTimestamp() as Timestamp,
      }, { merge: true });

      console.log('System configuration updated successfully');
    } catch (error) {
      console.error('Error updating system configuration:', error);
      throw error;
    }
  }

  // Validate seeded data integrity
  static async validateSeededData(): Promise<{
    valid: boolean;
    issues: string[];
    summary: {
      planConfigs: boolean;
      systemConfig: boolean;
      creditRules: boolean;
      featureFlags: boolean;
    };
  }> {
    const issues: string[] = [];
    const summary = {
      planConfigs: false,
      systemConfig: false,
      creditRules: false,
      featureFlags: false,
    };

    try {
      // Validate plan configurations
      const planConfigsSnapshot = await getDocs(collection(db, this.PLAN_CONFIGS_COLLECTION));
      if (planConfigsSnapshot.size >= 3) {
        summary.planConfigs = true;
      } else {
        issues.push(`Expected at least 3 plan configurations, found ${planConfigsSnapshot.size}`);
      }

      // Validate system configuration
      const systemConfigRef = doc(db, this.SYSTEM_CONFIG_COLLECTION, 'global');
      const systemDoc = await getDoc(systemConfigRef);
      if (systemDoc.exists()) {
        summary.systemConfig = true;
      } else {
        issues.push('System configuration document not found');
      }

      // Validate credit allocation rules
      const rulesRef = doc(db, this.SYSTEM_CONFIG_COLLECTION, 'creditAllocationRules');
      const rulesDoc = await getDoc(rulesRef);
      if (rulesDoc.exists()) {
        summary.creditRules = true;
      } else {
        issues.push('Credit allocation rules not found');
      }

      // Validate feature flags
      const flagsRef = doc(db, this.SYSTEM_CONFIG_COLLECTION, 'featureFlags');
      const flagsDoc = await getDoc(flagsRef);
      if (flagsDoc.exists()) {
        summary.featureFlags = true;
      } else {
        issues.push('Feature flags not found');
      }

      return {
        valid: issues.length === 0,
        issues,
        summary,
      };

    } catch (error) {
      console.error('Error validating seeded data:', error);
      return {
        valid: false,
        issues: [`Validation failed: ${error}`],
        summary,
      };
    }
  }
} 