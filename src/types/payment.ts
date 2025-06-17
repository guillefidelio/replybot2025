// Payment system TypeScript interfaces
import type { Timestamp } from 'firebase/firestore';

// Subscription plan types
export type SubscriptionPlan = 'free' | 'starter' | 'professional';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

// Credit transaction types
export type CreditTransactionType = 'usage' | 'allocation' | 'purchase' | 'reset' | 'refund' | 'bonus';

// Subscription information interface
export interface SubscriptionInfo {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  paddleSubscriptionId?: string;
  paddleCustomerId?: string;
  currentPeriodStart: Timestamp | Date;
  currentPeriodEnd: Timestamp | Date;
  cancelAtPeriodEnd: boolean;
  trialEndsAt?: Timestamp | Date;
}

// Credit management interface
export interface CreditInfo {
  available: number;
  used: number;
  total: number; // allocated for current period
  resetDate: Timestamp | Date;
  lastUsage?: Timestamp | Date;
  carryover: number; // unused credits from previous period (if applicable)
}

// Feature access control interface
export interface FeatureAccess {
  bulkPositive: boolean;
  bulkAll: boolean;
  customPrompts: boolean;
  analytics: boolean;
  multiLocation: boolean;
  apiAccess: boolean;
}

// User preferences interface
export interface UserPreferences {
  notifications: {
    lowCredits: boolean;
    monthlyUsage: boolean;
    billingReminders: boolean;
  };
  autoUpgrade: boolean;
  creditWarningThreshold: number; // notify when credits fall below this
}

// Credit transaction metadata interface
export interface CreditTransactionMetadata {
  reviewId?: string;
  planUpgrade?: string;
  refundReason?: string;
  refundSource?: string;
  bonusReason?: string;
  bonusSource?: string;
  purchaseSource?: string;
  ipAddress?: string;
  responseType?: string;
  allocationReason?: string;
  paddleTransactionId?: string;
  originalTransactionId?: string;
}

// Credit transaction interface
export interface CreditTransaction {
  id: string;
  type: CreditTransactionType;
  amount: number; // positive for additions, negative for usage
  balanceAfter: number;
  timestamp: Timestamp;
  description: string;
  metadata: CreditTransactionMetadata;
}

// Usage analytics interface
export interface UsageAnalytics {
  period: string; // 'YYYY-MM' format
  usage: {
    totalResponses: number;
    byRating: {
      '1': number;
      '2': number;
      '3': number;
      '4': number;
      '5': number;
    };
    byMode: {
      individual: number;
      bulkPositive: number;
      bulkAll: number;
    };
  };
  performance: {
    averageResponseTime: number;
    successRate: number;
    mostActiveDay: string;
    peakHour: number;
  };
}

// Extended user profile with payment information
export interface ExtendedUserProfile {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: Date;
  lastLoginAt: Date;
  
  // Payment-related fields
  subscription: SubscriptionInfo;
  credits: CreditInfo;
  features: FeatureAccess;
  preferences: UserPreferences;
}

// Firestore version with Timestamp objects
export interface FirestoreExtendedUserProfile extends Omit<ExtendedUserProfile, 'createdAt' | 'lastLoginAt' | 'subscription' | 'credits'> {
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  updatedAt: Timestamp;
  subscription: SubscriptionInfo;
  credits: CreditInfo;
}

// Credit status for real-time display
export interface CreditStatus {
  available: number;
  used: number;
  total: number;
  resetDate: Date;
  plan: SubscriptionPlan;
  features: FeatureAccess;
  canUseFeature: (feature: keyof FeatureAccess) => boolean;
}

// Plan configuration interface
export interface PlanConfig {
  plan: SubscriptionPlan;
  name: string;
  description: string;
  monthlyCredits: number;
  price: number; // in cents
  paddleProductId: string;
  features: FeatureAccess;
  maxCarryover: number;
}

// Payment plan configurations
export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  free: {
    plan: 'free',
    name: 'Free',
    description: 'Perfect for trying out AI responses',
    monthlyCredits: 10,
    price: 0,
    paddleProductId: '',
    features: {
      bulkPositive: false,
      bulkAll: false,
      customPrompts: false,
      analytics: false,
      multiLocation: false,
      apiAccess: false,
    },
    maxCarryover: 0,
  },
  starter: {
    plan: 'starter',
    name: 'Starter',
    description: 'Great for small businesses',
    monthlyCredits: 100,
    price: 1999, // $19.99
    paddleProductId: 'paddle_starter_product_id',
    features: {
      bulkPositive: true,
      bulkAll: false,
      customPrompts: true,
      analytics: true,
      multiLocation: false,
      apiAccess: false,
    },
    maxCarryover: 20,
  },
  professional: {
    plan: 'professional',
    name: 'Professional',
    description: 'For agencies and large businesses',
    monthlyCredits: 500,
    price: 4999, // $49.99
    paddleProductId: 'paddle_professional_product_id',
    features: {
      bulkPositive: true,
      bulkAll: true,
      customPrompts: true,
      analytics: true,
      multiLocation: true,
      apiAccess: true,
    },
    maxCarryover: 100,
  },
};

// Default values for new users
export const DEFAULT_USER_SUBSCRIPTION: SubscriptionInfo = {
  plan: 'free',
  status: 'active',
  currentPeriodStart: new Date() as any, // Will be converted to Timestamp
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) as any, // 30 days from now
  cancelAtPeriodEnd: false,
};

export const DEFAULT_USER_CREDITS: CreditInfo = {
  available: 10,
  used: 0,
  total: 10,
  resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) as any, // 30 days from now
  carryover: 0,
};

export const DEFAULT_USER_FEATURES: FeatureAccess = {
  bulkPositive: false,
  bulkAll: false,
  customPrompts: false,
  analytics: false,
  multiLocation: false,
  apiAccess: false,
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  notifications: {
    lowCredits: true,
    monthlyUsage: true,
    billingReminders: true,
  },
  autoUpgrade: false,
  creditWarningThreshold: 5,
}; 