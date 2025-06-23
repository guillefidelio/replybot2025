import { 
  doc, 
  getDoc,
  type Unsubscribe
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { User } from 'firebase/auth';
import type { 
  CreditStatus, 
  SubscriptionPlan, 
  FeatureAccess,
  SubscriptionInfo,
  CreditInfo
} from '../types/payment';

// Credit service event types
export interface CreditServiceEvents {
  onCreditUpdate: (status: CreditStatus) => void;
  onError: (error: Error) => void;
  onAuthChange: (authenticated: boolean) => void;
}

// Credit consumption result interface
export interface CreditConsumptionResult {
  success: boolean;
  remaining: number;
  message?: string;
  error?: string;
}

// Feature check result interface
export interface FeatureCheckResult {
  canUse: boolean;
  reason?: string;
  upgradeRequired?: boolean;
}

// Credit consumption request interface
export interface CreditConsumptionRequest {
  reviewId: string;
  rating?: number;
  mode?: 'individual' | 'bulkPositive' | 'bulkAll';
  metadata?: {
    pageUrl?: string;
    businessName?: string;
    responseLength?: number;
  };
}

// Request queue item interface
interface QueuedRequest {
  id: string;
  request: CreditConsumptionRequest;
  timestamp: Date;
  retryCount: number;
  resolve: (result: CreditConsumptionResult) => void;
  reject: (error: Error) => void;
}

// Retry configuration
interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
}

// Cache data structure
interface CachedCreditData {
  status: CreditStatus;
  timestamp: number;
  userId: string;
  version: number; // for cache migration if needed
}

// Credit validation result interface
export interface CreditValidationResult {
  canProceed: boolean;
  reason?: string;
  suggestion?: string;
  creditsRequired: number;
  creditsAvailable: number;
  estimatedCost?: number;
}

// Pre-flight check result interface
export interface PreflightCheckResult {
  approved: boolean;
  warnings: string[];
  errors: string[];
  recommendations: string[];
  creditInfo: {
    required: number;
    available: number;
    remaining: number;
  };
}

// Credit operation types
export type CreditOperationType = 'individual' | 'bulkPositive' | 'bulkAll' | 'customPrompt' | 'analytics' | 'api';

// Credit operation permission result
export interface CreditOperationPermission {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
  upgradeRequired?: boolean;
  creditsRequired?: number;
}

// Feature limitations interface
export interface FeatureLimitations {
  plan: SubscriptionPlan;
  features: FeatureAccess;
  limits: {
    maxBulkSize: number;
    maxCustomPrompts: number;
    analyticsRetention: number; // days
    apiCallsPerDay: number;
  };
}

// Upgrade suggestion interface
export interface UpgradeSuggestion {
  currentPlan: SubscriptionPlan;
  suggestedPlan: SubscriptionPlan;
  missingFeatures: (keyof FeatureAccess)[];
  benefits: string[];
  estimatedMonthlySavings?: number;
}

// Cache status interface
export interface CacheStatus {
  exists: boolean;
  age?: number;
  isValid?: boolean;
  lastWrite?: Date | null;
}

// Queue status interface
export interface QueueStatus {
  count: number;
  isProcessing: boolean;
}

// Service debug information interface
export interface CreditServiceDebugInfo {
  isInitialized: boolean;
  isAuthenticated: boolean;
  isOnline: boolean;
  lastSyncTime: Date | null;
  hasCachedStatus: boolean;
  queueStatus: QueueStatus;
  cache: {
    exists: boolean;
    age?: number;
    isValid?: boolean;
    size?: number;
    lastWrite: Date | null;
    isStale: boolean;
  };
  listenerCounts: {
    creditUpdate: number;
    error: number;
    authChange: number;
  };
}

// Credit service initialization options
export interface CreditServiceOptions {
  cacheExpiryMs?: number;
  retryConfig?: Partial<RetryConfig>;
  cloudFunctionsBaseUrl?: string;
}

// Chrome extension CreditService singleton class
export class CreditService {
  private static instance: CreditService | null = null;
  
  // Real-time listeners and caching
  private userUnsubscribe: Unsubscribe | null = null;
  private authUnsubscribe: Unsubscribe | null = null;
  private creditStatusCache: CreditStatus | null = null;
  private isInitialized = false;
  private currentUser: User | null = null;
  
  // Event listeners
  private creditUpdateListeners: Array<(status: CreditStatus) => void> = [];
  private errorListeners: Array<(error: Error) => void> = [];
  private authChangeListeners: Array<(authenticated: boolean) => void> = [];
  
  // Network status tracking
  private isOnline = navigator.onLine;
  private lastSyncTime: Date | null = null;

  // Credit consumption request handling
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  };

  // Cloud Functions endpoints
  private readonly CLOUD_FUNCTIONS_BASE_URL = 'https://us-central1-replybot25.cloudfunctions.net';

  // Credit status caching for offline functionality
  private readonly CACHE_KEY = 'creditService_cache';
  private readonly CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private cacheWriteInProgress = false;
  private lastCacheWrite: Date | null = null;

  // Private constructor for singleton pattern
  private constructor() {
    this.setupNetworkListeners();
    this.setupAuthListener();
  }

  // Singleton pattern implementation
  static getInstance(): CreditService {
    if (!CreditService.instance) {
      CreditService.instance = new CreditService();
    }
    return CreditService.instance;
  }

  // Initialize the service
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[CreditService] Already initialized');
      return;
    }

    try {
      console.log('[CreditService] Initializing...');
      
      // Wait for auth state to be ready
      await this.waitForAuthReady();
      
      if (this.currentUser) {
        // Try to load from cache first for immediate availability
        await this.loadFromCache();
        
        await this.setupUserListener(this.currentUser);
        await this.loadInitialCreditStatus();
      }

      // Start processing any queued requests
      this.processRequestQueue();

      this.isInitialized = true;
      console.log('[CreditService] Initialized successfully');
    } catch (error) {
      console.error('[CreditService] Initialization failed:', error);
      this.emitError(new Error(`Initialization failed: ${error}`));
      throw error;
    }
  }

  // Wait for Firebase auth to be ready
  private waitForAuthReady(): Promise<void> {
    return new Promise((resolve) => {
      if (auth.currentUser !== undefined) {
        this.currentUser = auth.currentUser;
        resolve();
      } else {
        const unsubscribe = auth.onAuthStateChanged((user) => {
          this.currentUser = user;
          unsubscribe();
          resolve();
        });
      }
    });
  }

  // Setup authentication state listener
  private setupAuthListener(): void {
    this.authUnsubscribe = auth.onAuthStateChanged(async (user) => {
      const wasAuthenticated = !!this.currentUser;
      const isAuthenticated = !!user;
      
      console.log('[CreditService] Auth state changed:', { wasAuthenticated, isAuthenticated });
      
      this.currentUser = user;
      
      if (wasAuthenticated && !isAuthenticated) {
        // User logged out
        this.cleanup();
        this.clearRequestQueue();
        this.emitAuthChange(false);
      } else if (!wasAuthenticated && isAuthenticated) {
        // User logged in
        if (this.isInitialized) {
          await this.setupUserListener(user);
          await this.loadInitialCreditStatus();
          this.processRequestQueue();
        }
        this.emitAuthChange(true);
      } else if (isAuthenticated && user) {
        // User changed
        await this.setupUserListener(user);
        await this.loadInitialCreditStatus();
      }
    });
  }

  // DEPRECATED: Real-time listeners removed for cost optimization
  // Credit updates now come from the background script via handshake and AI responses
  private async setupUserListener(_user: User): Promise<void> {
    console.log('[CreditService] Real-time listeners deprecated - using cached data from handshake');
    
    // Clean up existing listener if any
    if (this.userUnsubscribe) {
      this.userUnsubscribe();
      this.userUnsubscribe = null;
    }

    // Load initial data from cache instead
    await this.loadInitialCreditStatus();
  }

  // Parse user data to CreditStatus format
  private parseUserDataToCreditStatus(userData: any): CreditStatus {
    const subscription: SubscriptionInfo = userData.subscription || {};
    const credits: CreditInfo = userData.credits || {};
    const features: FeatureAccess = userData.features || {};

    return {
      available: credits.available || 0,
      used: credits.used || 0,
      total: credits.total || 0,
      resetDate: credits.resetDate instanceof Date ? credits.resetDate : (credits.resetDate?.toDate() || new Date()),
      plan: subscription.plan || 'free',
      features,
      canUseFeature: (feature: keyof FeatureAccess) => features[feature] || false
    };
  }

  // Load initial credit status (for immediate access)
  private async loadInitialCreditStatus(): Promise<void> {
    if (!this.currentUser) return;

    try {
      const userDocRef = doc(db, 'users', this.currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        this.creditStatusCache = this.parseUserDataToCreditStatus(userData);
        this.lastSyncTime = new Date();
        
        // Save to persistent cache
        this.saveToCache(this.creditStatusCache);
        
        console.log('[CreditService] Initial credit status loaded');
      }
    } catch (error) {
      console.error('[CreditService] Error loading initial credit status:', error);
      // Don't throw error here, real-time listener will handle it
    }
  }

  // Setup network status listeners
  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('[CreditService] Network came online');
      // Attempt to refresh data when back online
      if (this.currentUser && this.isInitialized) {
        this.loadInitialCreditStatus();
        this.processRequestQueue();
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('[CreditService] Network went offline');
    });
  }

  // Public API: Validate credit balance before AI response generation
  async validateCreditBalance(operation: {
    type: CreditOperationType;
    reviewCount?: number;
    requireOnline?: boolean;
  }): Promise<CreditValidationResult> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.currentUser) {
        return {
          canProceed: false,
          reason: 'User not authenticated',
          suggestion: 'Please log in to continue',
          creditsRequired: operation.reviewCount || 1,
          creditsAvailable: 0
        };
      }

      const reviewCount = operation.reviewCount || 1;
      const status = await this.getCreditStatus();

      if (!status) {
        return {
          canProceed: false,
          reason: 'Unable to verify credit status',
          suggestion: 'Please refresh and try again',
          creditsRequired: reviewCount,
          creditsAvailable: 0
        };
      }

      // Check if user has sufficient credits
      if (status.available < reviewCount) {
        const shortfall = reviewCount - status.available;
        return {
          canProceed: false,
          reason: `Insufficient credits`,
          suggestion: status.available === 0 
            ? 'No credits remaining. Please upgrade your plan or wait for monthly reset.'
            : `Need ${reviewCount} credits, but only ${status.available} available. Missing ${shortfall} credits.`,
          creditsRequired: reviewCount,
          creditsAvailable: status.available,
          estimatedCost: this.estimateCreditCost(operation.type, reviewCount)
        };
      }

      // Check feature access for bulk operations
      if (operation.type !== 'individual') {
        // Map operation type to feature name
        const featureMap: Record<string, keyof FeatureAccess> = {
          'bulkPositive': 'bulkPositive',
          'bulkAll': 'bulkAll',
          'analytics': 'analytics',
          'customPrompt': 'customPrompts',
          'api': 'apiAccess'
        };
        const featureName = featureMap[operation.type] || 'bulkPositive';
        const featureCheck = await this.canUseFeature(featureName);
        if (!featureCheck.canUse) {
          return {
            canProceed: false,
            reason: featureCheck.reason || 'Feature not available',
            suggestion: 'Please upgrade your plan to use bulk processing',
            creditsRequired: reviewCount,
            creditsAvailable: status.available
          };
        }

        // Check bulk size limits
        const maxBulkSize = await this.getMaxBulkSize(status.plan);
        if (reviewCount > maxBulkSize) {
          return {
            canProceed: false,
            reason: `Bulk operation too large for ${status.plan} plan`,
            suggestion: `Maximum ${maxBulkSize} reviews per bulk operation. Consider upgrading for larger batches.`,
            creditsRequired: reviewCount,
            creditsAvailable: status.available
          };
        }
      }

      // Check if online connection is required and available
      if (operation.requireOnline && !this.isOnline) {
        return {
          canProceed: false,
          reason: 'No internet connection',
          suggestion: 'This operation requires an internet connection. Please check your connection and try again.',
          creditsRequired: reviewCount,
          creditsAvailable: status.available
        };
      }

      // Check if cache is too stale for reliable validation
      if (!this.isOnline && this.isCacheStale()) {
        return {
          canProceed: false,
          reason: 'Credit status may be outdated',
          suggestion: 'Please connect to the internet to verify your current credit balance.',
          creditsRequired: reviewCount,
          creditsAvailable: status.available
        };
      }

      return {
        canProceed: true,
        creditsRequired: reviewCount,
        creditsAvailable: status.available,
        estimatedCost: this.estimateCreditCost(operation.type, reviewCount)
      };

    } catch (error) {
      console.error('[CreditService] Error validating credit balance:', error);
      return {
        canProceed: false,
        reason: 'Error validating credits',
        suggestion: 'Please try again or contact support',
        creditsRequired: operation.reviewCount || 1,
        creditsAvailable: 0
      };
    }
  }

  // Public API: Pre-flight check for AI response generation
  async preflightCheck(operation: {
    type: CreditOperationType;
    reviewCount?: number;
    reviewIds?: string[];
  }): Promise<PreflightCheckResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    try {
      const reviewCount = operation.reviewCount || operation.reviewIds?.length || 1;
      
      // Validate credit balance
      const validation = await this.validateCreditBalance({
        type: operation.type,
        reviewCount,
        requireOnline: true
      });

      const creditInfo = {
        required: validation.creditsRequired,
        available: validation.creditsAvailable,
        remaining: validation.creditsAvailable - validation.creditsRequired
      };

      if (!validation.canProceed) {
        errors.push(validation.reason || 'Cannot proceed with operation');
        if (validation.suggestion) {
          recommendations.push(validation.suggestion);
        }
        
        return {
          approved: false,
          warnings,
          errors,
          recommendations,
          creditInfo
        };
      }

      // Add warnings for low credit scenarios
      const remainingAfter = validation.creditsAvailable - validation.creditsRequired;
      if (remainingAfter <= 5 && remainingAfter > 0) {
        warnings.push(`Low credits warning: Only ${remainingAfter} credits will remain after this operation`);
        recommendations.push('Consider upgrading your plan to avoid running out of credits');
      }

      // Add warnings for bulk operations
      if (operation.type !== 'individual' && reviewCount > 10) {
        warnings.push(`Large bulk operation: Processing ${reviewCount} reviews`);
        recommendations.push('Large bulk operations may take several minutes to complete');
      }

      // Add warnings for offline/cache staleness
      if (!this.isOnline) {
        warnings.push('Operating in offline mode - credit balance may not be current');
      } else if (this.isCacheStale()) {
        warnings.push('Credit information may be slightly outdated');
        recommendations.push('Consider refreshing if you recently purchased credits');
      }

      // Add recommendations based on plan
      const currentPlan = await this.getCurrentPlan();
      if (currentPlan === 'free' && reviewCount > 5) {
        recommendations.push('Upgrade to a paid plan for more credits and bulk processing features');
      }

      return {
        approved: true,
        warnings,
        errors,
        recommendations,
        creditInfo
      };

    } catch (error) {
      console.error('[CreditService] Error in preflight check:', error);
      errors.push('Error performing preflight check');
      recommendations.push('Please try again or contact support');
      
      return {
        approved: false,
        warnings,
        errors,
        recommendations,
        creditInfo: {
          required: operation.reviewCount || 1,
          available: 0,
          remaining: 0
        }
      };
    }
  }

  // Helper method to estimate credit cost
  private estimateCreditCost(operationType: CreditOperationType, reviewCount: number): number {
    // Currently 1:1 ratio, but this could be adjusted for different operation types
    switch (operationType) {
      case 'individual':
        return 1;
      case 'bulkPositive':
      case 'bulkAll':
        return reviewCount; // 1 credit per review
      default:
        return reviewCount;
    }
  }

  // Public API: Request credit consumption with error recovery
  async requestCreditConsumption(request: CreditConsumptionRequest): Promise<CreditConsumptionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.currentUser) {
      return {
        success: false,
        remaining: 0,
        error: 'User not authenticated'
      };
    }

    // Enhanced pre-flight validation
    const validation = await this.validateCreditBalance({
      type: request.mode || 'individual',
      reviewCount: 1,
      requireOnline: false // Allow queuing for offline
    });

    if (!validation.canProceed && this.isOnline) {
      return {
        success: false,
        remaining: validation.creditsAvailable,
        error: validation.reason || 'Cannot consume credit',
        message: validation.suggestion || 'Please check your credit balance'
      };
    }

    // If offline, queue the request
    if (!this.isOnline) {
      return this.queueRequest(request);
    }

    // Process the request immediately
    return this.processConsumptionRequest(request);
  }

  // Process credit consumption request with retry logic
  private async processConsumptionRequest(request: CreditConsumptionRequest, retryCount = 0): Promise<CreditConsumptionResult> {
    try {
      const idToken = await this.currentUser!.getIdToken();
      
      const response = await fetch(`${this.CLOUD_FUNCTIONS_BASE_URL}/consumeCredit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        return {
          success: false,
          remaining: result.creditsRemaining || 0,
          error: result.error || 'Credit consumption failed',
          message: result.message || 'Unable to consume credit'
        };
      }

      console.log('[CreditService] Credit consumed successfully:', result);
      
      return {
        success: true,
        remaining: result.creditsRemaining,
        message: result.message || 'Credit consumed successfully'
      };

    } catch (error) {
      console.error('[CreditService] Credit consumption error:', error);
      
      // Check if we should retry
      if (retryCount < this.retryConfig.maxRetries && this.shouldRetry(error)) {
        const delay = this.calculateRetryDelay(retryCount);
        console.log(`[CreditService] Retrying in ${delay}ms (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);
        
        await this.delay(delay);
        return this.processConsumptionRequest(request, retryCount + 1);
      }

      return {
        success: false,
        remaining: 0,
        error: this.getErrorMessage(error),
        message: 'Failed to consume credit. Please try again.'
      };
    }
  }

  // Queue request for offline processing
  private queueRequest(request: CreditConsumptionRequest): Promise<CreditConsumptionResult> {
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: this.generateRequestId(),
        request,
        timestamp: new Date(),
        retryCount: 0,
        resolve,
        reject
      };

      this.requestQueue.push(queuedRequest);
      console.log(`[CreditService] Request queued (${this.requestQueue.length} in queue)`);

      // Return immediate response indicating queued status
      resolve({
        success: false,
        remaining: this.creditStatusCache?.available || 0,
        message: 'Request queued for when connection is restored'
      });
    });
  }

  // Process queued requests when online
  private async processRequestQueue(): Promise<void> {
    if (this.isProcessingQueue || !this.isOnline || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    console.log(`[CreditService] Processing ${this.requestQueue.length} queued requests`);

    while (this.requestQueue.length > 0 && this.isOnline) {
      const queuedRequest = this.requestQueue.shift()!;
      
      try {
        const result = await this.processConsumptionRequest(queuedRequest.request);
        queuedRequest.resolve(result);
      } catch (error) {
        queuedRequest.reject(error as Error);
      }

      // Small delay between requests to avoid overwhelming the server
      await this.delay(100);
    }

    this.isProcessingQueue = false;
    console.log('[CreditService] Queue processing complete');
  }

  // Clear request queue (on logout)
  private clearRequestQueue(): void {
    this.requestQueue.forEach(queuedRequest => {
      queuedRequest.reject(new Error('User logged out'));
    });
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }

  // Utility methods for request handling
  private shouldRetry(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    if (error.name === 'AbortError') return true; // Timeout
    if (error.message?.includes('fetch')) return true; // Network error
    if (error.message?.includes('HTTP 5')) return true; // Server error
    return false;
  }

  private calculateRetryDelay(retryCount: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getErrorMessage(error: any): string {
    if (error.name === 'AbortError') return 'Request timeout';
    if (error.message?.includes('fetch')) return 'Network error';
    return error.message || 'Unknown error';
  }

  // Chrome storage caching methods for offline functionality
  private async saveToCache(status: CreditStatus): Promise<void> {
    if (!this.currentUser || this.cacheWriteInProgress) {
      return;
    }

    try {
      this.cacheWriteInProgress = true;
      
      const cacheData: CachedCreditData = {
        status,
        timestamp: Date.now(),
        userId: this.currentUser.uid,
        version: 1
      };

      if (chrome?.storage?.local) {
        await chrome.storage.local.set({ [this.CACHE_KEY]: cacheData });
        this.lastCacheWrite = new Date();
        console.log('[CreditService] Credit status saved to cache');
      }
    } catch (error) {
      console.error('[CreditService] Error saving to cache:', error);
    } finally {
      this.cacheWriteInProgress = false;
    }
  }

  private async loadFromCache(): Promise<boolean> {
    if (!this.currentUser) {
      return false;
    }

    try {
      if (!chrome?.storage?.local) {
        console.warn('[CreditService] Chrome storage not available');
        return false;
      }

      const result = await chrome.storage.local.get([this.CACHE_KEY]);
      const cachedData: CachedCreditData = result[this.CACHE_KEY];

      if (!cachedData) {
        console.log('[CreditService] No cached data found');
        return false;
      }

      // Validate cache
      if (!this.isCacheValid(cachedData)) {
        console.log('[CreditService] Cache invalid, clearing');
        await this.clearCache();
        return false;
      }

      // Load cached status
      this.creditStatusCache = cachedData.status;
      this.lastSyncTime = new Date(cachedData.timestamp);
      
      console.log('[CreditService] Credit status loaded from cache');
      
      // Emit to listeners if we have valid cached data
      if (this.creditStatusCache) {
        this.emitCreditUpdate(this.creditStatusCache);
      }

      return true;
    } catch (error) {
      console.error('[CreditService] Error loading from cache:', error);
      return false;
    }
  }

  private isCacheValid(cachedData: CachedCreditData): boolean {
    if (!cachedData || !this.currentUser) {
      return false;
    }

    // Check if cache is for current user
    if (cachedData.userId !== this.currentUser.uid) {
      console.log('[CreditService] Cache is for different user');
      return false;
    }

    // Check cache age
    const age = Date.now() - cachedData.timestamp;
    if (age > this.CACHE_EXPIRY_MS) {
      console.log('[CreditService] Cache expired');
      return false;
    }

    // Check cache version
    if (cachedData.version !== 1) {
      console.log('[CreditService] Cache version mismatch');
      return false;
    }

    // Validate cache structure
    if (!cachedData.status || typeof cachedData.status.available !== 'number') {
      console.log('[CreditService] Invalid cache structure');
      return false;
    }

    return true;
  }

  private async clearCache(): Promise<void> {
    try {
      if (chrome?.storage?.local) {
        await chrome.storage.local.remove([this.CACHE_KEY]);
        console.log('[CreditService] Cache cleared');
      }
    } catch (error) {
      console.error('[CreditService] Error clearing cache:', error);
    }
  }

  private async getCacheInfo(): Promise<{
    exists: boolean;
    age?: number;
    userId?: string;
    isValid?: boolean;
    size?: number;
  }> {
    try {
      if (!chrome?.storage?.local) {
        return { exists: false };
      }

      const result = await chrome.storage.local.get([this.CACHE_KEY]);
      const cachedData: CachedCreditData = result[this.CACHE_KEY];

      if (!cachedData) {
        return { exists: false };
      }

      const age = Date.now() - cachedData.timestamp;
      const isValid = this.isCacheValid(cachedData);
      const size = JSON.stringify(cachedData).length;

      return {
        exists: true,
        age,
        userId: cachedData.userId,
        isValid,
        size
      };
    } catch (error) {
      console.error('[CreditService] Error getting cache info:', error);
      return { exists: false };
    }
  }

  // Public API: Get current credit status
  async getCreditStatus(): Promise<CreditStatus | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    // Return cached status if available
    if (this.creditStatusCache) {
      return this.creditStatusCache;
    }

    // If no cache, load from Firestore
    try {
      await this.loadInitialCreditStatus();
      return this.creditStatusCache;
    } catch (error) {
      console.error('[CreditService] Error getting credit status:', error);
      throw new Error(`Failed to get credit status: ${error}`);
    }
  }

  // Public API: Check if user has credits available
  async hasCreditsAvailable(): Promise<boolean> {
    try {
      const status = await this.getCreditStatus();
      return status ? status.available > 0 : false;
    } catch (error) {
      console.error('[CreditService] Error checking credit availability:', error);
      return false;
    }
  }

  // Public API: Check if user can use a specific feature
  async canUseFeature(feature: keyof FeatureAccess): Promise<FeatureCheckResult> {
    try {
      const status = await this.getCreditStatus();
      
      if (!status) {
        return {
          canUse: false,
          reason: 'Unable to verify subscription status',
          upgradeRequired: true
        };
      }

      const canUse = status.canUseFeature(feature);
      
      if (!canUse) {
        return {
          canUse: false,
          reason: `${feature} feature not available in ${status.plan} plan`,
          upgradeRequired: true
        };
      }

      return { canUse: true };
    } catch (error) {
      console.error('[CreditService] Error checking feature access:', error);
      return {
        canUse: false,
        reason: 'Error checking feature access'
      };
    }
  }

  // Public API: Check if user can use bulk positive mode
  async canUseBulkPositive(): Promise<FeatureCheckResult> {
    return this.canUseFeature('bulkPositive');
  }

  // Public API: Check if user can use bulk all mode
  async canUseBulkAll(): Promise<FeatureCheckResult> {
    return this.canUseFeature('bulkAll');
  }

  // Public API: Check if user can use custom prompts
  async canUseCustomPrompts(): Promise<FeatureCheckResult> {
    return this.canUseFeature('customPrompts');
  }

  // Public API: Check if user can access analytics
  async canUseAnalytics(): Promise<FeatureCheckResult> {
    return this.canUseFeature('analytics');
  }

  // Public API: Check if user can use multi-location features
  async canUseMultiLocation(): Promise<FeatureCheckResult> {
    return this.canUseFeature('multiLocation');
  }

  // Public API: Check if user can access API
  async canUseApiAccess(): Promise<FeatureCheckResult> {
    return this.canUseFeature('apiAccess');
  }

  // Public API: Validate bulk operation request
  async validateBulkOperation(mode: 'bulkPositive' | 'bulkAll', reviewCount: number): Promise<FeatureCheckResult> {
    try {
      // Check feature access
      const featureCheck = await this.canUseFeature(mode);
      if (!featureCheck.canUse) {
        return featureCheck;
      }

      // Check if user has enough credits for bulk operation
      const status = await this.getCreditStatus();
      if (!status) {
        return {
          canUse: false,
          reason: 'Unable to verify credit status',
          upgradeRequired: true
        };
      }

      if (status.available < reviewCount) {
        return {
          canUse: false,
          reason: `Insufficient credits. Need ${reviewCount}, have ${status.available}`,
          upgradeRequired: status.available === 0
        };
      }

      // Additional validation for bulk all mode (more restrictive)
      if (mode === 'bulkAll') {
        const plan = status.plan;
        const maxBulkSize = await this.getMaxBulkSize(plan);
        
        if (reviewCount > maxBulkSize) {
          return {
            canUse: false,
            reason: `Bulk operation too large. Maximum ${maxBulkSize} reviews for ${plan} plan`,
            upgradeRequired: true
          };
        }
      }

      return { canUse: true };
    } catch (error) {
      console.error('[CreditService] Error validating bulk operation:', error);
      return {
        canUse: false,
        reason: 'Error validating bulk operation'
      };
    }
  }

  // Public API: Get maximum bulk operation size for current plan
  async getMaxBulkSize(plan?: SubscriptionPlan): Promise<number> {
    if (!plan) {
      plan = await this.getCurrentPlan();
    }

    switch (plan) {
      case 'free':
        return 0; // No bulk operations
      case 'starter':
        return 25; // Bulk positive only, max 25
      case 'professional':
        return 100; // Bulk all, max 100
      default:
        return 0;
    }
  }

  // Public API: Get feature limitations for current plan
  async getFeatureLimitations(): Promise<FeatureLimitations> {
    try {
      const status = await this.getCreditStatus();
      const plan = status?.plan || 'free';
      const features = status?.features || {
        bulkPositive: false,
        bulkAll: false,
        customPrompts: false,
        analytics: false,
        multiLocation: false,
        apiAccess: false,
      };

      const limits = this.getPlanLimits(plan);

      return {
        plan,
        features,
        limits
      };
    } catch (error) {
      console.error('[CreditService] Error getting feature limitations:', error);
      return {
        plan: 'free',
        features: {
          bulkPositive: false,
          bulkAll: false,
          customPrompts: false,
          analytics: false,
          multiLocation: false,
          apiAccess: false,
        },
        limits: this.getPlanLimits('free')
      };
    }
  }

  // Private helper: Get plan-specific limits
  private getPlanLimits(plan: SubscriptionPlan): {
    maxBulkSize: number;
    maxCustomPrompts: number;
    analyticsRetention: number;
    apiCallsPerDay: number;
  } {
    switch (plan) {
      case 'free':
        return {
          maxBulkSize: 0,
          maxCustomPrompts: 0,
          analyticsRetention: 0,
          apiCallsPerDay: 0,
        };
      case 'starter':
        return {
          maxBulkSize: 25,
          maxCustomPrompts: 5,
          analyticsRetention: 30,
          apiCallsPerDay: 100,
        };
      case 'professional':
        return {
          maxBulkSize: 100,
          maxCustomPrompts: 50,
          analyticsRetention: 365,
          apiCallsPerDay: 1000,
        };
      default:
        return this.getPlanLimits('free');
    }
  }

  // Public API: Check if operation is allowed with detailed reasoning
  async checkOperationPermission(operation: {
    type: CreditOperationType;
    reviewCount?: number;
    customPromptId?: string;
  }): Promise<CreditOperationPermission> {
    try {
      const status = await this.getCreditStatus();
      
      if (!status) {
        return {
          allowed: false,
          reason: 'Unable to verify account status',
          suggestion: 'Please refresh the page and try again',
          upgradeRequired: false
        };
      }

      switch (operation.type) {
        case 'individual':
          return this.checkIndividualPermission(status);
          
        case 'bulkPositive':
          return this.checkBulkPermission(status, 'bulkPositive', operation.reviewCount || 1);
          
        case 'bulkAll':
          return this.checkBulkPermission(status, 'bulkAll', operation.reviewCount || 1);
          
        case 'customPrompt':
          return this.checkCustomPromptPermission(status);
          
        case 'analytics':
          return this.checkAnalyticsPermission(status);
          
        case 'api':
          return this.checkApiPermission(status);
          
        default:
          return {
            allowed: false,
            reason: 'Unknown operation type',
            suggestion: 'Please contact support'
          };
      }
    } catch (error) {
      console.error('[CreditService] Error checking operation permission:', error);
      return {
        allowed: false,
        reason: 'Error checking permissions',
        suggestion: 'Please try again or contact support'
      };
    }
  }

  // Private helpers for permission checking
  private checkIndividualPermission(status: CreditStatus): {
    allowed: boolean;
    reason?: string;
    suggestion?: string;
    upgradeRequired?: boolean;
    creditsRequired?: number;
  } {
    if (status.available <= 0) {
      return {
        allowed: false,
        reason: 'No credits available',
        suggestion: status.plan === 'free' 
          ? 'Upgrade to a paid plan for more credits'
          : 'Your monthly credits have been used. They will reset on your next billing cycle.',
        upgradeRequired: status.plan === 'free',
        creditsRequired: 1
      };
    }

    return { allowed: true };
  }

  private checkBulkPermission(status: CreditStatus, mode: 'bulkPositive' | 'bulkAll', reviewCount: number): {
    allowed: boolean;
    reason?: string;
    suggestion?: string;
    upgradeRequired?: boolean;
    creditsRequired?: number;
  } {
    // Check feature access
    if (!status.canUseFeature(mode)) {
      const suggestion = mode === 'bulkPositive' 
        ? 'Upgrade to Starter plan to use bulk positive processing'
        : 'Upgrade to Professional plan to use bulk all processing';
        
      return {
        allowed: false,
        reason: `${mode} feature not available in ${status.plan} plan`,
        suggestion,
        upgradeRequired: true
      };
    }

    // Check credit availability
    if (status.available < reviewCount) {
      return {
        allowed: false,
        reason: `Insufficient credits for bulk operation`,
        suggestion: `Need ${reviewCount} credits, but only ${status.available} available`,
        upgradeRequired: status.available === 0,
        creditsRequired: reviewCount - status.available
      };
    }

    // Check bulk size limits
    const maxBulkSize = this.getPlanLimits(status.plan).maxBulkSize;
    if (reviewCount > maxBulkSize) {
      return {
        allowed: false,
        reason: `Bulk operation too large for ${status.plan} plan`,
        suggestion: `Maximum ${maxBulkSize} reviews. Consider upgrading for larger bulk operations.`,
        upgradeRequired: true
      };
    }

    return { allowed: true };
  }

  private checkCustomPromptPermission(status: CreditStatus): {
    allowed: boolean;
    reason?: string;
    suggestion?: string;
    upgradeRequired?: boolean;
  } {
    if (!status.canUseFeature('customPrompts')) {
      return {
        allowed: false,
        reason: 'Custom prompts not available in free plan',
        suggestion: 'Upgrade to Starter or Professional plan to use custom prompts',
        upgradeRequired: true
      };
    }

    return { allowed: true };
  }

  private checkAnalyticsPermission(status: CreditStatus): {
    allowed: boolean;
    reason?: string;
    suggestion?: string;
    upgradeRequired?: boolean;
  } {
    if (!status.canUseFeature('analytics')) {
      return {
        allowed: false,
        reason: 'Analytics not available in free plan',
        suggestion: 'Upgrade to Starter or Professional plan to access analytics',
        upgradeRequired: true
      };
    }

    return { allowed: true };
  }

  private checkApiPermission(status: CreditStatus): {
    allowed: boolean;
    reason?: string;
    suggestion?: string;
    upgradeRequired?: boolean;
  } {
    if (!status.canUseFeature('apiAccess')) {
      return {
        allowed: false,
        reason: 'API access not available in current plan',
        suggestion: 'Upgrade to Professional plan to access the API',
        upgradeRequired: true
      };
    }

    return { allowed: true };
  }

  // Public API: Get upgrade suggestions for specific features
  async getUpgradeSuggestions(desiredFeatures: (keyof FeatureAccess)[]): Promise<UpgradeSuggestion> {
    try {
      const currentPlan = await this.getCurrentPlan();
      const currentFeatures = (await this.getCreditStatus())?.features || {
        bulkPositive: false,
        bulkAll: false,
        customPrompts: false,
        analytics: false,
        multiLocation: false,
        apiAccess: false,
      };
      
      const missingFeatures = desiredFeatures.filter(feature => !currentFeatures[feature]);
      
      if (missingFeatures.length === 0) {
        return {
          currentPlan,
          suggestedPlan: currentPlan,
          missingFeatures: [],
          benefits: ['You already have access to all requested features!']
        };
      }

      // Determine minimum plan needed
      let suggestedPlan: SubscriptionPlan = 'starter';
      
      if (missingFeatures.includes('bulkAll') || 
          missingFeatures.includes('multiLocation') || 
          missingFeatures.includes('apiAccess')) {
        suggestedPlan = 'professional';
      }

      const benefits = this.generateUpgradeBenefits(currentPlan, suggestedPlan, missingFeatures);

      return {
        currentPlan,
        suggestedPlan,
        missingFeatures,
        benefits
      };
    } catch (error) {
      console.error('[CreditService] Error getting upgrade suggestions:', error);
      return {
        currentPlan: 'free',
        suggestedPlan: 'starter',
        missingFeatures: desiredFeatures,
        benefits: ['Upgrade to access premium features']
      };
    }
  }

  // Private helper: Generate upgrade benefits messaging
  private generateUpgradeBenefits(currentPlan: SubscriptionPlan, suggestedPlan: SubscriptionPlan, missingFeatures: (keyof FeatureAccess)[]): string[] {
    const benefits: string[] = [];
    
    if (currentPlan === 'free') {
      if (suggestedPlan === 'starter') {
        benefits.push('100 monthly credits (vs 10 free)');
        benefits.push('Bulk positive review processing');
        benefits.push('Custom response prompts');
        benefits.push('Usage analytics and insights');
        benefits.push('Priority support');
      } else if (suggestedPlan === 'professional') {
        benefits.push('500 monthly credits (vs 10 free)');
        benefits.push('Bulk processing for all reviews');
        benefits.push('Multi-location management');
        benefits.push('API access for integrations');
        benefits.push('Advanced analytics');
        benefits.push('Custom prompts and templates');
      }
    } else if (currentPlan === 'starter' && suggestedPlan === 'professional') {
      benefits.push('500 monthly credits (vs 100)');
      benefits.push('Bulk processing for all reviews');
      benefits.push('Multi-location management');
      benefits.push('API access for integrations');
      benefits.push('Extended analytics retention');
    }

    // Add specific feature benefits
    missingFeatures.forEach(feature => {
      switch (feature) {
        case 'bulkPositive':
          benefits.push('Process multiple positive reviews at once');
          break;
        case 'bulkAll':
          benefits.push('Process all reviews regardless of rating');
          break;
        case 'customPrompts':
          benefits.push('Create personalized response templates');
          break;
        case 'analytics':
          benefits.push('Track response performance and trends');
          break;
        case 'multiLocation':
          benefits.push('Manage multiple business locations');
          break;
        case 'apiAccess':
          benefits.push('Integrate with your existing systems');
          break;
      }
    });

    return benefits;
  }

  // Public API: Get current subscription plan
  async getCurrentPlan(): Promise<SubscriptionPlan> {
    try {
      const status = await this.getCreditStatus();
      return status?.plan || 'free';
    } catch (error) {
      console.error('[CreditService] Error getting current plan:', error);
      return 'free';
    }
  }

  // Public API: Check if user is in grace period
  async isInGracePeriod(): Promise<boolean> {
    try {
      const status = await this.getCreditStatus();
      if (!status) return false;

      // If user has 0 credits but features are still available, they might be in grace period
      return status.available === 0 && status.canUseFeature('bulkPositive');
    } catch (error) {
      console.error('[CreditService] Error checking grace period:', error);
      return false;
    }
  }

  // Public API: Get queue status
  getQueueStatus(): QueueStatus {
    return {
      count: this.requestQueue.length,
      isProcessing: this.isProcessingQueue
    };
  }

  // Event listener management
  onCreditUpdate(callback: (status: CreditStatus) => void): () => void {
    this.creditUpdateListeners.push(callback);
    
    // If we have cached status, call immediately
    if (this.creditStatusCache) {
      callback(this.creditStatusCache);
    }
    
    // Return unsubscribe function
    return () => {
      this.creditUpdateListeners = this.creditUpdateListeners.filter(cb => cb !== callback);
    };
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter(cb => cb !== callback);
    };
  }

  onAuthChange(callback: (authenticated: boolean) => void): () => void {
    this.authChangeListeners.push(callback);
    
    // Call immediately with current state
    callback(!!this.currentUser);
    
    return () => {
      this.authChangeListeners = this.authChangeListeners.filter(cb => cb !== callback);
    };
  }

  // Event emitters
  private emitCreditUpdate(status: CreditStatus): void {
    this.creditUpdateListeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('[CreditService] Error in credit update callback:', error);
      }
    });
  }

  private emitError(error: Error): void {
    this.errorListeners.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('[CreditService] Error in error callback:', err);
      }
    });
  }

  private emitAuthChange(authenticated: boolean): void {
    this.authChangeListeners.forEach(callback => {
      try {
        callback(authenticated);
      } catch (error) {
        console.error('[CreditService] Error in auth change callback:', error);
      }
    });
  }

  // Utility methods
  isAuthenticated(): boolean {
    return !!this.currentUser;
  }

  isOnlineMode(): boolean {
    return this.isOnline;
  }

  getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  getCachedStatus(): CreditStatus | null {
    return this.creditStatusCache;
  }

  // Cleanup method
  private cleanup(): void {
    if (this.userUnsubscribe) {
      this.userUnsubscribe();
      this.userUnsubscribe = null;
    }
    
    this.creditStatusCache = null;
    this.lastSyncTime = null;
    this.lastCacheWrite = null;
    
    // Clear cache on logout
    this.clearCache();
  }

  // Destroy method for testing or manual cleanup
  destroy(): void {
    this.cleanup();
    
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
      this.authUnsubscribe = null;
    }
    
    this.clearRequestQueue();
    this.creditUpdateListeners = [];
    this.errorListeners = [];
    this.authChangeListeners = [];
    this.isInitialized = false;
    
    CreditService.instance = null;
    console.log('[CreditService] Service destroyed');
  }

  // Public API: Cache management methods
  async forceCacheRefresh(): Promise<void> {
    if (this.currentUser) {
      await this.clearCache();
      await this.loadInitialCreditStatus();
    }
  }

  async getCacheStatus(): Promise<CacheStatus> {
    const cacheInfo = await this.getCacheInfo();
    return {
      exists: cacheInfo.exists,
      age: cacheInfo.age,
      isValid: cacheInfo.isValid,
      lastWrite: this.lastCacheWrite
    };
  }

  // Public API: Offline mode handling
  isOfflineMode(): boolean {
    return !this.isOnline;
  }

  hasValidCache(): boolean {
    return !!this.creditStatusCache && !!this.lastSyncTime;
  }

  getCacheAge(): number | null {
    if (!this.lastSyncTime) return null;
    return Date.now() - this.lastSyncTime.getTime();
  }

  isCacheStale(): boolean {
    const age = this.getCacheAge();
    return age ? age > this.CACHE_EXPIRY_MS : true;
  }

  // Development/debugging methods
  async refreshStatus(): Promise<void> {
    if (this.currentUser) {
      await this.loadInitialCreditStatus();
    }
  }

  async getDebugInfo(): Promise<CreditServiceDebugInfo> {
    const cacheInfo = await this.getCacheInfo();
    return {
      isInitialized: this.isInitialized,
      isAuthenticated: this.isAuthenticated(),
      isOnline: this.isOnline,
      lastSyncTime: this.lastSyncTime,
      hasCachedStatus: !!this.creditStatusCache,
      queueStatus: this.getQueueStatus(),
      cache: {
        exists: cacheInfo.exists,
        age: cacheInfo.age,
        isValid: cacheInfo.isValid,
        size: cacheInfo.size,
        lastWrite: this.lastCacheWrite,
        isStale: this.isCacheStale()
      },
      listenerCounts: {
        creditUpdate: this.creditUpdateListeners.length,
        error: this.errorListeners.length,
        authChange: this.authChangeListeners.length
      }
    };
  }
} 