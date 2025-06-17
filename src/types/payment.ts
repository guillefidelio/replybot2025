// src/types/payment.ts

/**
 * Represents a subscription plan available to users.
 */
export interface SubscriptionPlan {
  id: string; // e.g., 'free', 'premium_monthly', 'premium_yearly'
  name: string; // e.g., 'Free Plan', 'Premium Monthly', 'Premium Yearly'
  price: number; // Price in smallest currency unit (e.g., cents for USD)
  currency: string; // e.g., 'USD'
  credits: number; // Number of credits allocated with this plan (e.g., per month)
  features: string[]; // Array of feature IDs included in this plan
}

/**
 * Represents a single credit transaction for a user.
 */
export interface CreditTransaction {
  id: string; // Unique transaction ID
  userId: string; // ID of the user this transaction belongs to
  type: 'purchase' | 'usage' | 'refund' | 'initial_allocation' | 'bonus'; // Type of transaction
  amount: number; // Number of credits involved (positive for additions, negative for deductions)
  timestamp: Date; // Timestamp of when the transaction occurred
  description: string; // Brief description of the transaction (e.g., 'Consumed credits for AI response', 'Purchased 100 credits')
  relatedId?: string; // Optional ID related to the transaction (e.g., purchase order ID, AI request ID)
}

/**
 * Extends the base UserProfile with payment and subscription specific details.
 */
export interface UserPaymentProfile {
  subscriptionId?: string; // ID of the current active subscription plan
  subscriptionStatus?: 'active' | 'inactive' | 'cancelled' | 'past_due';
  credits: number; // Current available credits for the user
  activeFeatures: string[]; // Features currently active based on their subscription
  paddleCustomerId?: string; // Customer ID from Paddle (or other payment provider)
  nextBillingDate?: Date;
  cancellationDate?: Date;
}

// Example of a default free plan (could be moved to a config file or seeded data)
export const DEFAULT_FREE_PLAN: SubscriptionPlan = {
  id: 'free',
  name: 'Free Plan',
  price: 0,
  currency: 'USD',
  credits: 50, // Example: 50 free credits
  features: ['basic_ai_response', 'limited_history'],
};
