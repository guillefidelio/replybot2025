# Payment Plan Implementation Guide

## Overview

This document outlines the implementation of a credit-based payment system for the AI Review Responder Chrome Extension, integrating with Firestore for data management and Paddle for payment processing.

## Credit System Architecture

### Subscription Tiers

#### Free Tier
- **Credits per month**: 10 AI responses
- **Features**: 
  - Individual response mode only
  - Basic prompts
  - Email support
- **Target audience**: Small businesses testing the waters

#### Starter Tier ($29/month)
- **Credits per month**: 250 AI responses
- **Features**:
  - All individual response features
  - Custom prompts for all star ratings
  - Bulk positive mode (4-5 star reviews)
  - Priority email support
  - Usage analytics
- **Target audience**: Small to medium businesses with moderate review volume

#### Professional Tier ($79/month)
- **Credits per month**: 1,000 AI responses
- **Features**:
  - All Starter features
  - Bulk all mode (all reviews)
  - Multi-location support
  - Advanced analytics dashboard
  - Priority support with live chat
  - Custom branding options
  - API access
  - **Target audience**: Larger businesses or agencies managing multiple locations

## Technical Implementation

### 1. Database Schema (Firestore)

```javascript
// Users collection structure
users/{userId} {
  // User profile
  email: string,
  displayName: string,
  createdAt: timestamp,
  lastActiveAt: timestamp,
  
  // Subscription information
  subscription: {
    plan: 'free' | 'starter' | 'professional',
    status: 'active' | 'canceled' | 'past_due' | 'trialing',
    paddleSubscriptionId: string,
    paddleCustomerId: string,
    currentPeriodStart: timestamp,
    currentPeriodEnd: timestamp,
    cancelAtPeriodEnd: boolean,
    trialEndsAt?: timestamp
  },
  
  // Credit management
  credits: {
    available: number,
    used: number,
    total: number, // allocated for current period
    resetDate: timestamp,
    lastUsage: timestamp,
    carryover: number // unused credits from previous period (if applicable)
  },
  
  // Feature access control
  features: {
    bulkPositive: boolean,
    bulkAll: boolean,
    customPrompts: boolean,
    analytics: boolean,
    multiLocation: boolean,
    apiAccess: boolean
  },
  
  // User preferences
  preferences: {
    notifications: {
      lowCredits: boolean,
      monthlyUsage: boolean,
      billingReminders: boolean
    },
    autoUpgrade: boolean,
    creditWarningThreshold: number // notify when credits fall below this
  }
}

// Credit transactions subcollection
users/{userId}/creditTransactions/{transactionId} {
  type: 'usage' | 'allocation' | 'purchase' | 'reset' | 'refund' | 'bonus',
  amount: number, // positive for additions, negative for usage
  balanceAfter: number,
  timestamp: timestamp,
  description: string,
  metadata: {
    reviewId?: string,
    planUpgrade?: string,
    refundReason?: string,
    bonusReason?: string,
    ipAddress?: string
  }
}

// Usage analytics subcollection
users/{userId}/analytics/{period} {
  period: string, // 'YYYY-MM' format
  usage: {
    totalResponses: number,
    byRating: {
      '1': number,
      '2': number,
      '3': number,
      '4': number,
      '5': number
    },
    byMode: {
      individual: number,
      bulkPositive: number,
      bulkAll: number
    }
  },
  performance: {
    averageResponseTime: number,
    successRate: number,
    mostActiveDay: string,
    peakHour: number
  }
}
```

### 2. Chrome Extension Integration

#### Credit Service Implementation

```typescript
// src/services/CreditService.ts
import { auth, db } from '../firebase';
import { doc, getDoc, onSnapshot, collection, addDoc } from 'firebase/firestore';

export interface CreditStatus {
  available: number;
  used: number;
  total: number;
  resetDate: Date;
  plan: 'free' | 'starter' | 'professional';
  features: {
    bulkPositive: boolean;
    bulkAll: boolean;
    customPrompts: boolean;
    analytics: boolean;
    multiLocation: boolean;
    apiAccess: boolean;
  };
}

export class CreditService {
  private static instance: CreditService;
  private creditStatusCache: CreditStatus | null = null;
  private listeners: ((status: CreditStatus) => void)[] = [];

  static getInstance(): CreditService {
    if (!CreditService.instance) {
      CreditService.instance = new CreditService();
    }
    return CreditService.instance;
  }

  // Real-time credit status monitoring
  subscribeToCredits(callback: (status: CreditStatus) => void): () => void {
    this.listeners.push(callback);
    
    const user = auth.currentUser;
    if (!user) return () => {};

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const status: CreditStatus = {
          available: data.credits?.available || 0,
          used: data.credits?.used || 0,
          total: data.credits?.total || 0,
          resetDate: data.credits?.resetDate?.toDate() || new Date(),
          plan: data.subscription?.plan || 'free',
          features: data.features || {}
        };
        
        this.creditStatusCache = status;
        this.listeners.forEach(listener => listener(status));
      }
    });

    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
      unsubscribe();
    };
  }

  async getCreditStatus(): Promise<CreditStatus> {
    if (this.creditStatusCache) {
      return this.creditStatusCache;
    }

    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) throw new Error('User document not found');

    const data = userDoc.data();
    return {
      available: data.credits?.available || 0,
      used: data.credits?.used || 0,
      total: data.credits?.total || 0,
      resetDate: data.credits?.resetDate?.toDate() || new Date(),
      plan: data.subscription?.plan || 'free',
      features: data.features || {}
    };
  }

  async hasCreditsAvailable(): Promise<boolean> {
    const status = await this.getCreditStatus();
    return status.available > 0;
  }

  async canUseFeature(feature: keyof CreditStatus['features']): Promise<boolean> {
    const status = await this.getCreditStatus();
    return status.features[feature] || false;
  }

  // This will be called by Cloud Function, but we track locally for UI updates
  async requestCreditConsumption(reviewId: string): Promise<{ success: boolean; remaining: number; message?: string }> {
    const user = auth.currentUser;
    if (!user) return { success: false, remaining: 0, message: 'Not authenticated' };

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('https://your-region-your-project.cloudfunctions.net/consumeCredit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ reviewId })
      });

      const result = await response.json();
      
      if (!result.success) {
        return {
          success: false,
          remaining: result.creditsRemaining || 0,
          message: result.message || 'Failed to consume credit'
        };
      }

      return {
        success: true,
        remaining: result.creditsRemaining,
        message: 'Credit consumed successfully'
      };
    } catch (error) {
      console.error('Error consuming credit:', error);
      return { success: false, remaining: 0, message: 'Network error' };
    }
  }
}
```

#### Integration with Existing Content Script

```typescript
// src/content/content.ts - Modified sections

// Add credit checking before AI response generation
private async handleAIButtonClick(reviewData: ReviewData, button: HTMLElement) {
  const creditService = CreditService.getInstance();
  
  // Check if user has credits
  const hasCredits = await creditService.hasCreditsAvailable();
  if (!hasCredits) {
    this.showUpgradeModal();
    return;
  }

  // Update button state
  this.updateButtonState(button, 'loading');

  try {
    // Generate AI response (existing logic)
    const response = await this.generateAIResponse(reviewData);
    
    if (response.success) {
      // Consume credit through backend
      const creditResult = await creditService.requestCreditConsumption(reviewData.id);
      
      if (creditResult.success) {
        // Show response and update UI with remaining credits
        this.fillResponseAndSubmit(reviewData, response.data.responseText, false);
        this.updateButtonState(button, 'success');
        this.showCreditStatus(creditResult.remaining);
      } else {
        // Credit consumption failed
        this.showNotification(creditResult.message || 'Credit limit reached', 'error');
        this.updateButtonState(button, 'error');
      }
    } else {
      this.updateButtonState(button, 'error');
    }
  } catch (error) {
    this.updateButtonState(button, 'error');
    console.error('AI response generation failed:', error);
  }
}

private showUpgradeModal() {
  const modal = this.createUpgradeModal();
  document.body.appendChild(modal);
}

private createUpgradeModal(): HTMLElement {
  const modal = document.createElement('div');
  modal.className = 'ai-upgrade-modal';
  modal.innerHTML = `
    <div class="ai-modal-backdrop">
      <div class="ai-modal-content">
        <h3>Credits Exhausted</h3>
        <p>You've used all your AI response credits for this month.</p>
        <div class="ai-modal-actions">
          <button id="ai-upgrade-btn" class="ai-btn-primary">Upgrade Plan</button>
          <button id="ai-close-modal" class="ai-btn-secondary">Close</button>
        </div>
      </div>
    </div>
  `;

  // Add event listeners
  modal.querySelector('#ai-upgrade-btn')?.addEventListener('click', () => {
    window.open('https://your-website.com/pricing', '_blank');
    modal.remove();
  });

  modal.querySelector('#ai-close-modal')?.addEventListener('click', () => {
    modal.remove();
  });

  return modal;
}

private showCreditStatus(remaining: number) {
  const statusElement = document.createElement('div');
  statusElement.className = 'ai-credit-status';
  statusElement.innerHTML = `
    <div class="ai-credit-indicator ${remaining < 10 ? 'low-credits' : ''}">
      <span class="ai-credit-count">${remaining}</span>
      <span class="ai-credit-label">credits left</span>
    </div>
  `;
  
  // Position and show temporarily
  document.body.appendChild(statusElement);
  setTimeout(() => statusElement.remove(), 3000);
}
```

### 3. Cloud Functions for Backend Logic

#### Credit Management Function

```typescript
// functions/src/creditManager.ts
import { https, logger } from 'firebase-functions';
import { admin, db } from './admin';
import { authenticateUser } from './auth';

export const consumeCredit = https.onCall(async (data, context) => {
  try {
    const userId = await authenticateUser(context);
    const { reviewId } = data;

    if (!reviewId) {
      throw new https.HttpsError('invalid-argument', 'Review ID is required');
    }

    return await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists) {
        throw new https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;
      const currentCredits = userData.credits?.available || 0;
      const subscription = userData.subscription || {};

      // Check if user has credits
      if (currentCredits <= 0) {
        logger.warn(`Credit consumption failed: No credits remaining for user ${userId}`);
        throw new https.HttpsError('resource-exhausted', 'No credits remaining');
      }

      // Check subscription status
      if (subscription.status !== 'active' && subscription.plan !== 'free') {
        throw new https.HttpsError('failed-precondition', 'Subscription is not active');
      }

      const newBalance = currentCredits - 1;
      const newUsed = (userData.credits?.used || 0) + 1;

      // Update user credits
      transaction.update(userRef, {
        'credits.available': newBalance,
        'credits.used': newUsed,
        'credits.lastUsage': admin.firestore.FieldValue.serverTimestamp()
      });

      // Log credit transaction
      const transactionRef = userRef.collection('creditTransactions').doc();
      transaction.set(transactionRef, {
        type: 'usage',
        amount: -1,
        balanceAfter: newBalance,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: 'AI response generated',
        metadata: {
          reviewId,
          ipAddress: context.rawRequest?.ip
        }
      });

      // Update monthly analytics
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const analyticsRef = userRef.collection('analytics').doc(monthKey);
      
      transaction.set(analyticsRef, {
        period: monthKey,
        'usage.totalResponses': admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      logger.info(`Credit consumed successfully for user ${userId}. Remaining: ${newBalance}`);

      return {
        success: true,
        creditsRemaining: newBalance,
        message: `Credit consumed. ${newBalance} credits remaining.`
      };
    });

  } catch (error) {
    logger.error('Error consuming credit:', error);
    
    if (error instanceof https.HttpsError) {
      throw error;
    }
    
    throw new https.HttpsError('internal', 'Failed to consume credit');
  }
});

export const getCreditStatus = https.onCall(async (data, context) => {
  const userId = await authenticateUser(context);
  
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new https.HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data()!;
  return {
    available: userData.credits?.available || 0,
    used: userData.credits?.used || 0,
    total: userData.credits?.total || 0,
    resetDate: userData.credits?.resetDate,
    plan: userData.subscription?.plan || 'free',
    features: userData.features || {}
  };
});

// Monthly credit reset function (scheduled)
export const resetMonthlyCredits = https.onSchedule('0 0 1 * *', async (context) => {
  const batch = db.batch();
  
  const usersSnapshot = await db.collection('users')
    .where('subscription.status', '==', 'active')
    .get();

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const plan = userData.subscription?.plan || 'free';
    const planCredits = getPlanCredits(plan);
    
    const userRef = db.collection('users').doc(userDoc.id);
    
    // Reset credits
    batch.update(userRef, {
      'credits.available': planCredits,
      'credits.used': 0,
      'credits.total': planCredits,
      'credits.resetDate': admin.firestore.FieldValue.serverTimestamp()
    });

    // Log reset transaction
    const transactionRef = userRef.collection('creditTransactions').doc();
    batch.set(transactionRef, {
      type: 'reset',
      amount: planCredits,
      balanceAfter: planCredits,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      description: 'Monthly credit reset',
      metadata: { plan }
    });
  }

  await batch.commit();
  logger.info(`Monthly credits reset for ${usersSnapshot.size} users`);
});

function getPlanCredits(plan: string): number {
  const planConfig = {
    free: 10,
    starter: 250,
    professional: 1000
  };
  return planConfig[plan as keyof typeof planConfig] || 0;
}
```

### 4. Paddle Integration

#### Webhook Handler

```typescript
// functions/src/paddleWebhooks.ts
import { https, logger } from 'firebase-functions';
import { db } from './admin';
import crypto from 'crypto';

const PADDLE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
// Your Paddle public key here
-----END PUBLIC KEY-----`;

export const handlePaddleWebhook = https.onRequest(async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['paddle-signature'] as string;
    if (!verifyPaddleSignature(req.body, signature)) {
      logger.warn('Invalid Paddle webhook signature');
      res.status(401).send('Invalid signature');
      return;
    }

    const event = req.body;
    logger.info('Paddle webhook received:', event.event_type);

    switch (event.event_type) {
      case 'subscription_created':
        await handleSubscriptionCreated(event);
        break;
      case 'subscription_updated':
        await handleSubscriptionUpdated(event);
        break;
      case 'subscription_cancelled':
        await handleSubscriptionCancelled(event);
        break;
      case 'subscription_payment_succeeded':
        await handlePaymentSucceeded(event);
        break;
      case 'subscription_payment_failed':
        await handlePaymentFailed(event);
        break;
      default:
        logger.info(`Unhandled webhook event: ${event.event_type}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error processing Paddle webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

async function handleSubscriptionCreated(event: any) {
  const { user_id, subscription_id, subscription_plan_id, next_payment } = event;
  
  const planConfig = getPlanConfigByPaddleId(subscription_plan_id);
  if (!planConfig) {
    logger.error(`Unknown subscription plan: ${subscription_plan_id}`);
    return;
  }

  await db.collection('users').doc(user_id).update({
    'subscription.plan': planConfig.name,
    'subscription.status': 'active',
    'subscription.paddleSubscriptionId': subscription_id,
    'subscription.currentPeriodStart': admin.firestore.FieldValue.serverTimestamp(),
    'subscription.currentPeriodEnd': new Date(next_payment.date),
    'subscription.cancelAtPeriodEnd': false,
    'credits.available': planConfig.credits,
    'credits.total': planConfig.credits,
    'credits.used': 0,
    'credits.resetDate': new Date(next_payment.date),
    'features': planConfig.features
  });

  // Log credit allocation
  await db.collection('users').doc(user_id)
    .collection('creditTransactions').add({
      type: 'allocation',
      amount: planConfig.credits,
      balanceAfter: planConfig.credits,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      description: `Credits allocated for ${planConfig.name} plan`,
      metadata: { subscriptionId: subscription_id }
    });

  logger.info(`Subscription created for user ${user_id}: ${planConfig.name}`);
}

async function handlePaymentSucceeded(event: any) {
  const { user_id, subscription_plan_id, next_payment } = event;
  
  const planConfig = getPlanConfigByPaddleId(subscription_plan_id);
  if (!planConfig) return;

  // Reset credits for new billing period
  await db.collection('users').doc(user_id).update({
    'subscription.currentPeriodStart': admin.firestore.FieldValue.serverTimestamp(),
    'subscription.currentPeriodEnd': new Date(next_payment.date),
    'credits.available': planConfig.credits,
    'credits.total': planConfig.credits,
    'credits.used': 0,
    'credits.resetDate': new Date(next_payment.date)
  });

  logger.info(`Payment succeeded for user ${user_id}, credits reset`);
}

function getPlanConfigByPaddleId(paddlePlanId: string) {
  const planConfigs = {
    'your_starter_plan_id': {
      name: 'starter',
      credits: 250,
      features: {
        bulkPositive: true,
        bulkAll: false,
        customPrompts: true,
        analytics: true,
        multiLocation: false,
        apiAccess: false
      }
    },
    'your_professional_plan_id': {
      name: 'professional',
      credits: 1000,
      features: {
        bulkPositive: true,
        bulkAll: true,
        customPrompts: true,
        analytics: true,
        multiLocation: true,
        apiAccess: true
      }
    }
  };

  return planConfigs[paddlePlanId as keyof typeof planConfigs];
}

function verifyPaddleSignature(payload: any, signature: string): boolean {
  // Implement Paddle signature verification
  // This is a simplified version - use Paddle's official verification method
  const verify = crypto.createVerify('sha1');
  verify.update(JSON.stringify(payload));
  return verify.verify(PADDLE_PUBLIC_KEY, signature, 'base64');
}
```

### 5. Chrome Extension Popup Updates

```typescript
// src/popup/popup.tsx - Add credit display and management

const CreditDisplay: React.FC = () => {
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const creditService = CreditService.getInstance();
    
    const unsubscribe = creditService.subscribeToCredits((status) => {
      setCreditStatus(status);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) return <div className="credit-loading">Loading...</div>;
  if (!creditStatus) return null;

  const usagePercentage = (creditStatus.used / creditStatus.total) * 100;
  const isLowCredits = creditStatus.available < 10;

  return (
    <div className={`credit-display ${isLowCredits ? 'low-credits' : ''}`}>
      <div className="credit-header">
        <h3>Credits ({creditStatus.plan})</h3>
        <div className="credit-count">
          {creditStatus.available} / {creditStatus.total}
        </div>
      </div>
      
      <div className="credit-progress">
        <div 
          className="credit-progress-bar"
          style={{ width: `${100 - usagePercentage}%` }}
        />
      </div>
      
      <div className="credit-details">
        <span>Used: {creditStatus.used}</span>
        <span>Resets: {creditStatus.resetDate.toLocaleDateString()}</span>
      </div>
      
      {isLowCredits && (
        <div className="credit-warning">
          <p>⚠️ Running low on credits!</p>
          <button 
            onClick={() => window.open('https://your-website.com/pricing', '_blank')}
            className="upgrade-btn"
          >
            Upgrade Plan
          </button>
        </div>
      )}
    </div>
  );
};

// Add to dashboard tab component
const DashboardTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <CreditDisplay />
      {/* ... existing dashboard content ... */}
    </div>
  );
};
```

### 6. Security Considerations

#### Rate Limiting & Abuse Prevention

```typescript
// functions/src/rateLimiter.ts
import { https } from 'firebase-functions';

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(userId: string, maxRequests = 60, windowMs = 60000): boolean {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitStore.set(userId, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (userLimit.count >= maxRequests) {
    return false;
  }

  userLimit.count++;
  return true;
}

// Apply to credit consumption
export const consumeCreditWithRateLimit = https.onCall(async (data, context) => {
  const userId = await authenticateUser(context);
  
  if (!checkRateLimit(userId, 30, 60000)) { // 30 requests per minute
    throw new https.HttpsError('resource-exhausted', 'Rate limit exceeded');
  }

  // Continue with credit consumption logic...
});
```

#### Input Validation & Sanitization

```typescript
// functions/src/validation.ts
import { https } from 'firebase-functions';

export function validateReviewId(reviewId: string): boolean {
  // Validate review ID format
  const reviewIdPattern = /^review-\d{13}$/;
  return reviewIdPattern.test(reviewId);
}

export function sanitizeInput(input: string): string {
  // Remove potentially harmful characters
  return input.replace(/[<>'"&]/g, '');
}
```

### 7. Monitoring & Analytics

#### Usage Analytics Dashboard

```typescript
// functions/src/analytics.ts
export const generateUsageReport = https.onCall(async (data, context) => {
  const userId = await authenticateUser(context);
  const { period } = data; // 'YYYY-MM' format

  const analyticsDoc = await db.collection('users')
    .doc(userId)
    .collection('analytics')
    .doc(period)
    .get();

  if (!analyticsDoc.exists) {
    return { period, usage: { totalResponses: 0 } };
  }

  return { period, ...analyticsDoc.data() };
});

export const getUsageTrends = https.onCall(async (data, context) => {
  const userId = await authenticateUser(context);
  const { months = 6 } = data;

  const analytics = await db.collection('users')
    .doc(userId)
    .collection('analytics')
    .orderBy('period', 'desc')
    .limit(months)
    .get();

  return analytics.docs.map(doc => doc.data());
});
```

## Implementation Timeline

### Phase 1: Foundation (Week 1-2)
1. Set up Firestore database schema
2. Implement basic credit tracking in Chrome extension
3. Create credit consumption Cloud Function
4. Add credit display to popup

### Phase 2: Payment Integration (Week 3-4)
1. Integrate Paddle SDK
2. Set up webhook handlers
3. Implement subscription management
4. Add upgrade/downgrade flows

### Phase 3: Feature Gates (Week 5-6)
1. Implement feature restrictions based on plan
2. Add bulk processing limitations
3. Create upgrade prompts
4. Test all payment flows

### Phase 4: Polish & Analytics (Week 7-8)
1. Add usage analytics
2. Implement monitoring and alerts
3. Create admin dashboard
4. Performance optimization

## Testing Strategy

### Unit Tests
- Credit calculation logic
- Feature access control
- Payment webhook processing

### Integration Tests
- End-to-end credit consumption flow
- Payment processing with Paddle
- Subscription lifecycle management

### Load Testing
- Credit consumption under high load
- Database transaction performance
- Rate limiting effectiveness

## Deployment Checklist

- [ ] Firestore security rules configured
- [ ] Cloud Functions deployed with proper IAM roles
- [ ] Paddle webhook endpoints secured
- [ ] Chrome extension updated with credit checking
- [ ] Payment plans configured in Paddle
- [ ] Monitoring and alerting set up
- [ ] Backup and recovery procedures tested

## Support & Maintenance

### Customer Support Integration
- Credit balance inquiry endpoints
- Manual credit adjustments
- Refund processing
- Plan change requests

### Monitoring & Alerts
- Low credit warnings
- Payment failures
- Unusual usage patterns
- System performance metrics

This implementation provides a robust, scalable credit-based payment system that integrates seamlessly with your existing Chrome extension while providing a smooth user experience and comprehensive business management capabilities.