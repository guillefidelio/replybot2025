// Background service worker for AI Review Responder Chrome Extension
// Handles API communications via Google Cloud Function (secure OpenAI proxy)

// Google Cloud Function API configuration  
const CLOUD_FUNCTION_URL = 'https://us-central1-review-responder-backend.cloudfunctions.net/openai-proxy';
const REQUEST_AI_GENERATION_URL = 'https://us-central1-replybot25.cloudfunctions.net/requestAIGeneration';

// Enhanced logging function
type LogData = unknown;
const log = (message: string, data?: LogData) => {
  if (data !== undefined) {
    console.log(`[Background] ${message}`, data);
  } else {
    console.log(`[Background] ${message}`);
  }
};

// Function to broadcast credit updates to all extension components
const broadcastCreditUpdate = async (creditData?: any) => {
  try {
    // Send message to all tabs and extension pages
    chrome.runtime.sendMessage({
      type: 'CREDIT_UPDATED',
      action: 'creditUpdate',
      data: creditData
    }).catch(() => {
      // Ignore errors if no listeners
    });
    
    // Also send to content scripts on active tabs
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CREDIT_UPDATED',
          action: 'creditUpdate',
          data: creditData
        }).catch(() => {
          // Ignore errors if tab doesn't have content script
        });
      }
    });
  } catch (error) {
    log('Error broadcasting credit update:', error);
  }
};

// Rate limiting management
let lastRequestTime = 0;
let requestCount = 0;
const MIN_REQUEST_INTERVAL = 1000; // Minimum 1 second between requests
const MAX_REQUESTS_PER_MINUTE = 50; // Conservative limit

// Function to check and enforce rate limits
const checkRateLimit = async (): Promise<void> => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  // Reset counter every minute
  if (timeSinceLastRequest > 60000) {
    requestCount = 0;
  }
  
  // Check if we've hit the per-minute limit
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    const waitTime = 60000 - (timeSinceLastRequest % 60000);
    log(`Rate limit reached. Waiting ${waitTime}ms before next request.`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestCount = 0;
  }
  
  // Ensure minimum interval between requests
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    log(`Enforcing minimum request interval. Waiting ${waitTime}ms.`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
  requestCount++;
};

// Function to delay execution
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced error handling for API responses
const handleApiError = async (response: Response): Promise<string> => {
  let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
  
  try {
    const errorData = await response.json();
    log('API Error Details:', errorData);
    
    if (errorData.error) {
      errorMessage = errorData.error.message || errorMessage;
      
      // Handle specific OpenAI error types
      if (errorData.error.type === 'insufficient_quota') {
        errorMessage = 'OpenAI API quota exceeded. Please check your billing details.';
      } else if (errorData.error.type === 'rate_limit_exceeded') {
        errorMessage = 'Rate limit exceeded. Please wait before making more requests.';
      } else if (errorData.error.code === 'invalid_api_key') {
        errorMessage = 'Invalid OpenAI API key. Please check your configuration.';
      }
    }
  } catch (parseError) {
    log('Could not parse error response as JSON:', parseError);
    // Use the default error message if we can't parse the response
  }
  
  return errorMessage;
};

// Handshake service implementation
interface SessionData {
  credits: number;
  subscription: {
    plan: string;
    status: string;
    isActive: boolean;
    currentPeriodEnd?: Date;
  };
  prompts: Array<{
    id: string;
    title: string;
    content: string;
    rating: number;
    hasText: boolean;
  }>;
}

// Perform initial handshake to fetch all user data
const performHandshake = async (user: { uid: string; email: string }): Promise<boolean> => {
  try {
    log('Performing handshake for user:', user.uid);
    
    // Import Firebase functions
    const { httpsCallable, getFunctions } = await import('firebase/functions');
    const app = (await import('../firebase')).default;
    const functions = getFunctions(app);
    
    const getUserSessionData = httpsCallable(functions, 'getUserSessionData');
    const sessionData = await getUserSessionData() as { data: SessionData };
    
    log('Handshake successful, received data:', sessionData.data);
    
    // Cache all data locally
    await chrome.storage.local.set({
      'sessionData': sessionData.data,
      'handshakeComplete': true,
      'lastHandshake': Date.now()
    });
    
    // Broadcast update to all components
    await broadcastCreditUpdate({
      credits: sessionData.data.credits,
      subscription: sessionData.data.subscription
    });
    
    // Part 2: Setup intelligent subscription listener after successful handshake
    await setupIntelligentSubscriptionListener();
    
    return true;
  } catch (error) {
    log('Handshake failed:', error);
    return false;
  }
};

// Part 2: Intelligent State Synchronization
// Global subscription listener tracking
let subscriptionUnsubscribe: (() => void) | null = null;

// Setup targeted subscription listener for authenticated users
async function setupIntelligentSubscriptionListener(): Promise<void> {
  try {
    const authResult = await chrome.storage.local.get(['authUser']);
    if (!authResult.authUser?.uid) {
      log('No authenticated user for subscription listener');
      return;
    }

    // Clean up existing listener
    if (subscriptionUnsubscribe) {
      subscriptionUnsubscribe();
      subscriptionUnsubscribe = null;
    }

    // Import Firebase
    const { doc, onSnapshot } = await import('firebase/firestore');
    const { db } = await import('../firebase');

    const userId = authResult.authUser.uid;
    const userDocRef = doc(db, 'users', userId);
    
    log(`Setting up targeted subscription listener for user ${userId}`);

    // TARGETED LISTENER: Only monitor subscription changes (not credits)
    subscriptionUnsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        const newSubscription = userData.subscription;
        
        // Compare with cached subscription data
        chrome.storage.local.get(['sessionData']).then(({ sessionData }) => {
          if (sessionData?.subscription) {
            const cachedSubscription = sessionData.subscription;
            
            // Check if subscription status has changed
            if (cachedSubscription.status !== newSubscription?.status ||
                cachedSubscription.plan !== newSubscription?.plan ||
                cachedSubscription.isActive !== newSubscription?.isActive) {
              
              log('Subscription change detected:', {
                old: cachedSubscription,
                new: newSubscription
              });
              
              // Update cached subscription data
              const updatedSessionData = {
                ...sessionData,
                subscription: newSubscription
              };
              
              chrome.storage.local.set({ sessionData: updatedSessionData });
              
              // Broadcast subscription update to UI
              chrome.runtime.sendMessage({
                type: 'SUBSCRIPTION_UPDATED',
                data: newSubscription
              });
            }
          }
        });
      }
    }, (error) => {
      log('Subscription listener error:', error);
    });

  } catch (error) {
    log('Error setting up subscription listener:', error);
  }
}

// Chrome extension service worker event listeners
chrome.runtime.onInstalled.addListener((details) => {
  log('AI Review Responder installed:', details.reason);
  
  // Initialize default settings on install
  if (details.reason === 'install') {
    initializeDefaultSettings();
  }
});

// Types
interface ReviewData {
  id: string;
  reviewer: string;
  rating: number;
  text: string;
}

type ChromeSendResponse = (response: unknown) => void;

// Interface for messages arriving from content/popup scripts
interface IncomingMessage {
  type?: string;
  action?: string;
  payload?: unknown;
  data?: unknown;
}

// Simple review format coming from content script
interface SimpleReview {
  author: string;
  score: number;
  content: string;
}

// top after constants
const SYSTEM_FALLBACK_PROMPT = 'You are a business owner and just received the following review.\nRespond in a professional and kind manner.';

// Update message listener
chrome.runtime.onMessage.addListener((message: IncomingMessage, _sender, sendResponse) => {
  log('Background received message:', message);
  const msgType: string | undefined = message.type ?? message.action; // fallback
  switch (msgType) {
    case 'checkCredits': {
      const data = (message as IncomingMessage).data as { operation: string };
      handleCheckCredits(data, sendResponse as ChromeSendResponse);
      return true;
    }
    
    case 'GENERATE_RESPONSE':
    case 'GENERATE_AI_RESPONSE':
    case 'generateResponse': {
      const payloadUnknown = (message as IncomingMessage).payload ?? (message as IncomingMessage).data ?? message;
      const payload = payloadUnknown as { reviewData?: ReviewData; review?: SimpleReview; promptType?: string; prompt?: string };
      handleGenerateResponse(payload, sendResponse as ChromeSendResponse);
      return true;
    }
      
    case 'GET_SETTINGS':
      getExtensionSettings(sendResponse as ChromeSendResponse);
      return true;
      
    case 'SAVE_SETTINGS':
      saveExtensionSettings((message as IncomingMessage).data as Record<string, unknown>, sendResponse as ChromeSendResponse);
      return true;
      
    case 'GET_PROMPTS':
      getPrompts(sendResponse as ChromeSendResponse);
      return true;
      
    case 'SAVE_PROMPT':
      savePrompt((message as IncomingMessage).data as SavePromptData, sendResponse as ChromeSendResponse);
      return true;
      
    case 'DELETE_PROMPT':
      deletePrompt((message as IncomingMessage).data as string, sendResponse as ChromeSendResponse);
      return true;
      
    case 'INITIALIZE_DEFAULT_PROMPTS':
      initializeDefaultPrompts(sendResponse);
      return true;
      
    case 'TEST_API_CONNECTION':
      testApiConnection(sendResponse);
      return true;
      
    case 'openUpgradeFlow':
      // Open the extension popup for upgrade flow
      chrome.action.openPopup();
      sendResponse({ success: true });
      return true;

    case 'PERFORM_HANDSHAKE':
      handlePerformHandshake((message as IncomingMessage).data as { uid: string; email: string; displayName: string }, sendResponse as ChromeSendResponse);
      return true;
      
    case 'LOW_CREDITS_WARNING':
      // Part 3: Proactive business logic - handle low credit notifications
      handleLowCreditsWarning((message as IncomingMessage).data as { credits: number; threshold: number }, sendResponse as ChromeSendResponse);
      return true;
      
    case 'SUBSCRIPTION_UPDATED':
      // Part 2: Handle subscription updates
      handleSubscriptionUpdate((message as IncomingMessage).data, sendResponse as ChromeSendResponse);
      return true;
      
    // Removed VALIDATE_USER for MVP simplicity
      
    default:
      console.warn('Unknown message type:', msgType);
      (sendResponse as ChromeSendResponse)({ success: false, error: 'Unknown message type' });
  }
});

// Handle handshake message from auth context
async function handlePerformHandshake(
  userData: { uid: string; email: string; displayName: string },
  sendResponse: ChromeSendResponse
): Promise<void> {
  try {
    log('Background script handling handshake for user:', userData.uid);
    
    const success = await performHandshake({ uid: userData.uid, email: userData.email });
    
    sendResponse({
      success,
      message: success ? 'Handshake completed successfully' : 'Handshake failed'
    });
    
  } catch (error) {
    log('Error handling handshake:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown handshake error'
    });
  }
}

// Part 3: Proactive Business Logic - Low Credits Warning Handler
async function handleLowCreditsWarning(
  data: { credits: number; threshold: number },
  sendResponse: ChromeSendResponse
): Promise<void> {
  try {
    log(`Low credits warning triggered: ${data.credits} credits remaining (threshold: ${data.threshold})`);
    
    // Create notification
    if (chrome.notifications) {
      chrome.notifications.create(`low-credits-${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon.svg',
        title: 'AI Review Responder - Low Credits',
        message: `You have ${data.credits} credits remaining. Consider upgrading to continue using AI responses.`,
        buttons: [
          { title: 'Upgrade Now' },
          { title: 'Dismiss' }
        ]
      });
    }
    
    // Also broadcast to popup/content scripts for in-app notification
    chrome.runtime.sendMessage({
      type: 'SHOW_LOW_CREDITS_UI',
      data: {
        credits: data.credits,
        threshold: data.threshold,
        message: `Only ${data.credits} credits left! Upgrade now to continue using AI responses.`
      }
    });
    
    sendResponse({ success: true });
  } catch (error) {
    log('Error handling low credits warning:', error);
    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Part 2: Handle subscription updates
async function handleSubscriptionUpdate(
  subscriptionData: any,
  sendResponse: ChromeSendResponse
): Promise<void> {
  try {
    log('Subscription updated:', subscriptionData);
    
    // Broadcast to all extension components
    chrome.runtime.sendMessage({
      type: 'SUBSCRIPTION_CHANGED',
      data: subscriptionData
    });
    
    // If subscription became active, show success notification
    if (subscriptionData.isActive && subscriptionData.status === 'active') {
      if (chrome.notifications) {
        chrome.notifications.create(`subscription-active-${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icons/icon.svg',
          title: 'AI Review Responder - Subscription Active',
          message: `Your ${subscriptionData.plan} plan is now active! Enjoy unlimited AI responses.`
        });
      }
    }
    
    sendResponse({ success: true });
  } catch (error) {
    log('Error handling subscription update:', error);
    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Initialize default settings
async function initializeDefaultSettings(): Promise<void> {
  try {
    log('Initializing default settings and prompts...');
    
    // Initialize default settings matching popup interface
    const settings = {
      trustModes: {
        individual: false,
        bulkPositive: false,
        bulkFull: false
      },
      rateLimit: 15000, // milliseconds between responses (15 seconds)
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 300,
      maxPages: 3, // default number of pages to process
      prompts: {}
    };

    await chrome.storage.local.set({ settings, prompts: {} });
    log('Default settings and prompts initialized successfully');
  } catch (error) {
    log('Failed to initialize default settings:', error);
  }
}

// Handle credit checking using cached data from handshake
async function handleCheckCredits(
  data: { operation: string },
  sendResponse: ChromeSendResponse
): Promise<void> {
  try {
    log('Checking credits for operation:', data.operation);
    
    // Get cached session data first for immediate response
    const cachedData = await chrome.storage.local.get(['sessionData', 'handshakeComplete', 'authUser']);
    
    log('Cache status:', {
      hasSessionData: !!cachedData.sessionData,
      handshakeComplete: cachedData.handshakeComplete,
      hasAuthUser: !!cachedData.authUser
    });
    
    if (cachedData.handshakeComplete && cachedData.sessionData) {
      const sessionData = cachedData.sessionData as SessionData;
      log('Using cached credit data:', { 
        credits: sessionData.credits,
        plan: sessionData.subscription?.plan,
        isActive: sessionData.subscription?.isActive
      });
      
      const responseData = {
        hasCredits: sessionData.credits > 0,
        available: sessionData.credits,
        total: sessionData.credits,
        required: 1,
        canProceed: sessionData.credits > 0,
        message: sessionData.credits > 0 ? 'Credits available' : 'No credits remaining',
        plan: sessionData.subscription.plan,
        resetDate: sessionData.subscription.currentPeriodEnd?.toISOString() || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };

      sendResponse({
        success: true,
        data: responseData
      });
      return;
    }
    
    // Fallback: No cached data available - try to perform handshake
    log('No cached data available, attempting handshake');
    
    if (!cachedData.authUser) {
      log('Authentication check failed - no authUser in storage');
      sendResponse({
        success: false,
        error: 'User not authenticated - please sign in again'
      });
      return;
    }

    log('Auth user found, attempting handshake:', { 
      uid: cachedData.authUser.uid, 
      email: cachedData.authUser.email 
    });

    // Try to perform handshake first
    const handshakeSuccess = await performHandshake({ 
      uid: cachedData.authUser.uid, 
      email: cachedData.authUser.email 
    });
    
    if (handshakeSuccess) {
      log('Handshake successful, retrieving fresh data');
      // Retry with cached data
      const freshData = await chrome.storage.local.get(['sessionData']);
      
      if (freshData.sessionData) {
        const sessionData = freshData.sessionData as SessionData;
        
        const responseData = {
          hasCredits: sessionData.credits > 0,
          available: sessionData.credits,
          total: sessionData.credits,
          required: 1,
          canProceed: sessionData.credits > 0,
          message: sessionData.credits > 0 ? 'Credits available' : 'No credits remaining',
          plan: sessionData.subscription.plan,
          resetDate: sessionData.subscription.currentPeriodEnd?.toISOString() || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };

        sendResponse({
          success: true,
          data: responseData
        });
      } else {
        log('Handshake succeeded but no session data found');
        sendResponse({
          success: false,
          error: 'Handshake succeeded but failed to retrieve user data'
        });
      }
    } else {
      log('Handshake failed');
      sendResponse({
        success: false,
        error: 'Failed to load user data - please check your internet connection and try again'
      });
    }

  } catch (error) {
    log('Error checking credits:', error);
    sendResponse({
      success: false,
      error: `Credit check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}

// Handle AI response generation using OpenAI API (now with credit consumption)
async function handleGenerateResponse(
  data: { reviewData?: ReviewData; review?: SimpleReview; promptType?: string; prompt?: string },
  sendResponse: ChromeSendResponse
): Promise<void> {
  try {
    // Get current user authentication
    const authResult = await chrome.storage.local.get(['authUser']);
    if (!authResult.authUser) {
      sendResponse({
        success: false,
        error: 'User not authenticated'
      });
      return;
    }

    // Normalize reviewData
    let reviewData: ReviewData | undefined = data.reviewData;
    if (!reviewData && data.review) {
      const { author, score, content } = data.review;
      reviewData = {
        id: `review-${Date.now()}`,
        reviewer: author,
        rating: score,
        text: content
      };
    }
    if (!reviewData) {
      sendResponse({ success: false, error: 'Invalid review data' });
      return;
    }
    log('Generating AI response for review data:', reviewData);

    const rating = reviewData.rating || 5;
    const hasText = reviewData.text && reviewData.text.trim().length > 0;

    // Get prompts
    const result = await chrome.storage.local.get(['prompts']);
    const prompts = (result.prompts || {}) as Record<string, string>;

    // Determine prompt
    let promptTemplate = '';
    if (data.prompt) {
      promptTemplate = data.prompt;
    } else {
      const keyBase = rating.toString();
              const variant = hasText ? 'text' : 'no_text';
      const altVariant = hasText ? 'text' : 'no_text';
      const possibleKeys = [`${keyBase}_${variant}`, `${keyBase}_${altVariant}`];
      for (const k of possibleKeys) {
        if (prompts[k]) {
          promptTemplate = prompts[k];
          break;
        }
      }
      if (!promptTemplate) {
        promptTemplate = SYSTEM_FALLBACK_PROMPT;
      }
    }

    // Build prompts for OpenAI
    const systemPrompt = `You are a professional business owner responding to a customer review.\n\nPlease generate a professional, personalized response based on this template:\n"${promptTemplate}"\n\nMake the response:\n- Professional and courteous\n- Personalized to the specific review\n- Appropriate for the rating given\n- Around 1-2 sentences for ratings 4-5, slightly longer for lower ratings\n- Natural and authentic, not robotic\n\nGenerate only the response text, no additional formatting or quotes.`;

    const userPrompt = `Review by ${reviewData.reviewer || 'Anonymous'} (${rating}/5 stars): ${reviewData.text || 'No text provided'}`;

    log('=== AI PROMPT BEING SENT ===');
    log('System prompt:', systemPrompt);
    log('User prompt:', userPrompt);
    log('=== END AI PROMPT ===');

    // Generate the AI response asynchronously (this will consume credits)
    const responseText = await generateAsyncAIResponse(
      systemPrompt, 
      userPrompt, 
      authResult.authUser.uid,
      authResult.authUser.email,
      reviewData
    );

    sendResponse({
      success: true,
      data: {
        responseText,
        reviewId: reviewData.id,
        rating
      }
    });
  } catch (error) {
    log('Error in handleGenerateResponse:', error);
    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Part 1.4: Asynchronous AI Generation Flow
// This replaces the synchronous generateSaaSResponseWithCreditConsumption
async function generateAsyncAIResponse(
  systemPrompt: string, 
  userPrompt: string, 
  userId: string,
  userEmail: string,
  reviewData: ReviewData
): Promise<string> {
  try {
    log('Starting async AI generation flow', { 
      userId, 
      userEmail, 
      reviewId: reviewData.id 
    });
    
    // Check rate limits before making request
    await checkRateLimit();

    const requestBody = {
      userId,
      userEmail,
      systemPrompt,
      userPrompt,
      reviewData: {
        id: reviewData.id,
        reviewer: reviewData.reviewer,
        rating: reviewData.rating,
        text: reviewData.text
      },
      aiRequest: {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 300,
        temperature: 0.7
      }
    };

    log('Requesting AI generation job creation:', requestBody);

    // Step 1: Request job creation (fast, < 500ms)
    const response = await fetch(REQUEST_AI_GENERATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jobData = await response.json();
    log('Job creation response:', jobData);

    // Handle job creation results
    if (!jobData.success) {
      if (jobData.error === 'INSUFFICIENT_CREDITS') {
        // Update local cache to reflect no credits
        await updateLocalCreditCache(0);
        throw new Error('Insufficient credits. Please upgrade your plan to continue.');
      }
      throw new Error(jobData.error || 'Failed to create AI generation job');
    }

    // Step 2: Update local credit cache immediately
    await updateLocalCreditCache(jobData.newCreditBalance);
    
    // Part 3.1: Check for low credit threshold (proactive business logic)
    if (jobData.newCreditBalance <= 5) {
      chrome.runtime.sendMessage({
        type: 'LOW_CREDITS_WARNING',
        data: { 
          credits: jobData.newCreditBalance,
          threshold: 5
        }
      });
    }

    // Step 3: Setup temporary listener for job completion
    const aiResponse = await waitForJobCompletion(userId, jobData.jobId);
    
    return aiResponse;

  } catch (error) {
    log('Error in generateAsyncAIResponse:', error);
    throw error;
  }
}

// Helper function to update local credit cache and broadcast
async function updateLocalCreditCache(newCredits: number): Promise<void> {
  const currentSessionData = (await chrome.storage.local.get(['sessionData'])).sessionData || {};
  await chrome.storage.local.set({
    sessionData: {
      ...currentSessionData,
      credits: newCredits
    }
  });
  
  // Broadcast credit update to UI
  await broadcastCreditUpdate({ 
    credits: newCredits,
    hasCredits: newCredits > 0
  });
}

// Helper function to wait for job completion using temporary onSnapshot listener
async function waitForJobCompletion(userId: string, jobId: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      // Import Firebase
      const { doc, onSnapshot } = await import('firebase/firestore');
      const { db } = await import('../firebase');

      log(`Setting up temporary listener for job ${jobId}`);
      
      // Setup temporary listener on the specific job document
      const jobDocRef = doc(db, 'users', userId, 'generationJobs', jobId);
      
      let unsubscribe: (() => void) | null = null;
      let timeoutId: NodeJS.Timeout | null = null;
      
      // Set timeout for job completion (5 minutes max)
      timeoutId = setTimeout(() => {
        if (unsubscribe) unsubscribe();
        reject(new Error('AI generation timed out'));
      }, 5 * 60 * 1000); // 5 minutes

      // Create the listener
      unsubscribe = onSnapshot(jobDocRef, (doc) => {
        if (doc.exists()) {
          const jobData = doc.data();
          log(`Job ${jobId} status:`, jobData.status);
          
          if (jobData.status === 'completed') {
            // SUCCESS: Clean up and return result
            if (unsubscribe) unsubscribe();
            if (timeoutId) clearTimeout(timeoutId);
            
            if (jobData.aiResponse) {
              log(`Job ${jobId} completed successfully`);
              resolve(jobData.aiResponse);
            } else {
              reject(new Error('Job completed but no AI response found'));
            }
          } else if (jobData.status === 'failed') {
            // FAILURE: Clean up and reject
            if (unsubscribe) unsubscribe();
            if (timeoutId) clearTimeout(timeoutId);
            
            reject(new Error(`AI generation failed: ${jobData.error || 'Unknown error'}`));
          }
          // If status is still 'pending', continue waiting
        } else {
          // Job document doesn't exist
          if (unsubscribe) unsubscribe();
          if (timeoutId) clearTimeout(timeoutId);
          reject(new Error('Job document not found'));
        }
      }, (error) => {
        // Listener error
        if (unsubscribe) unsubscribe();
        if (timeoutId) clearTimeout(timeoutId);
        reject(new Error(`Listener error: ${error.message}`));
      });
      
    } catch (error) {
      reject(error);
    }
  });
}

// Google Cloud Function API call with retry logic (fallback for non-credit operations)
async function generateSaaSResponse(systemPrompt: string, userPrompt: string, retryCount = 0): Promise<string> {
  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds base delay
  
  log(`Generating response via Google Cloud Function (attempt ${retryCount + 1}/${maxRetries + 1})`, { systemPrompt, userPrompt });
  
  try {
    // Check rate limits before making request
    await checkRateLimit();
    
    // Format request for OpenAI Chat Completions API
    const requestBody = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 300,
      temperature: 0.7
    };

    log('=== CLOUD FUNCTION API REQUEST ===');
    log('API URL:', CLOUD_FUNCTION_URL);
    log('Request body:', JSON.stringify(requestBody, null, 2));
    log('=== END API REQUEST ===');
    
    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorMessage = await handleApiError(response);
      
      // Check if this is a retryable error
      if (response.status === 429 || response.status >= 500) {
        if (retryCount < maxRetries) {
          const retryDelay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
          log(`Retryable error (${response.status}). Retrying in ${retryDelay}ms...`);
          await delay(retryDelay);
          return generateSaaSResponse(systemPrompt, userPrompt, retryCount + 1);
        }
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    log('Response received from Google Cloud Function:', data);
    
    // OpenAI response format: { choices: [{ message: { content: "..." } }] }
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content;
    } else {
      log('Unexpected response format:', data);
      const errorMsg = data.error || 'Unexpected response format from Cloud Function';
      throw new Error(errorMsg);
    }
    
  } catch (error) {
    log('Error generating AI response:', error);
    
    // If this was a network error and we haven't exceeded retries, try again
    if (error instanceof TypeError && error.message.includes('fetch') && retryCount < maxRetries) {
      const retryDelay = baseDelay * Math.pow(2, retryCount);
      log(`Network error. Retrying in ${retryDelay}ms...`);
      await delay(retryDelay);
      return generateSaaSResponse(systemPrompt, userPrompt, retryCount + 1);
    }
    
    // For the final attempt or non-retryable errors, throw with detailed message
    if (retryCount >= maxRetries) {
      throw new Error(`Failed to generate AI response after ${maxRetries + 1} attempts. Last error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    throw new Error(`Failed to generate AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get extension settings
async function getExtensionSettings(sendResponse: ChromeSendResponse): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['settings', 'prompts']);
    const settings = result.settings || {};
    const prompts = result.prompts || {};
    
    // Merge prompts into settings for compatibility
    const mergedSettings = {
      ...settings,
      prompts: prompts
    };
    
    sendResponse({ success: true, settings: mergedSettings });
  } catch (error) {
    log('Error getting settings:', error);
    sendResponse({ success: false, error: 'Failed to get settings' });
  }
}

// Save extension settings
async function saveExtensionSettings(
  settings: Record<string, unknown>,
  sendResponse: ChromeSendResponse
): Promise<void> {
  try {
    // Extract prompts from settings and save separately for better organization
    const { prompts, ...otherSettings } = settings;
    
    // Save both settings and prompts
    await chrome.storage.local.set({ 
      settings: otherSettings,
      prompts: prompts || {}
    });
    
    log('Settings and prompts saved successfully');
    sendResponse({ success: true });
  } catch (error) {
    log('Error saving settings:', error);
    sendResponse({ success: false, error: 'Failed to save settings' });
  }
}

// Get prompts from cached session data (handshake) or fallback to local storage
async function getPrompts(sendResponse: ChromeSendResponse): Promise<void> {
  try {
    // Try to get prompts from cached session data first
    const cachedData = await chrome.storage.local.get(['sessionData', 'handshakeComplete']);
    
    if (cachedData.handshakeComplete && cachedData.sessionData?.prompts) {
      const sessionData = cachedData.sessionData as SessionData;
      
      // Convert prompts array to the format expected by the UI
      const promptsObject: Record<string, string> = {};
      sessionData.prompts.forEach(prompt => {
        promptsObject[prompt.id] = prompt.content;
      });
      
      log('Using prompts from cached session data:', promptsObject);
      sendResponse({ success: true, data: promptsObject });
      return;
    }
    
    // Fallback to local storage for backward compatibility
    const result = await chrome.storage.local.get(['prompts']);
    log('Using prompts from local storage fallback:', result.prompts);
    sendResponse({ success: true, data: result.prompts || {} });
  } catch (error) {
    log('Error getting prompts:', error);
    sendResponse({ success: false, error: 'Failed to get prompts' });
  }
}

// Save a specific prompt
type SavePromptData = { key: string; text: string };

async function savePrompt(promptData: SavePromptData, sendResponse: ChromeSendResponse): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['prompts']);
    const prompts = (result.prompts || {}) as Record<string, string>;
    prompts[promptData.key] = promptData.text;
    
    await chrome.storage.local.set({ prompts });
    sendResponse({ success: true });
  } catch (error) {
    log('Error saving prompt:', error);
    sendResponse({ success: false, error: 'Failed to save prompt' });
  }
}

// Delete a specific prompt
async function deletePrompt(promptId: string, sendResponse: ChromeSendResponse): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['prompts']);
    const prompts = (result.prompts || {}) as Record<string, string>;
    delete prompts[promptId];
    
    await chrome.storage.local.set({ prompts });
    sendResponse({ success: true });
  } catch (error) {
    log('Error deleting prompt:', error);
    sendResponse({ success: false, error: 'Failed to delete prompt' });
  }
}

// Initialize default prompts
async function initializeDefaultPrompts(sendResponse: ChromeSendResponse): Promise<void> {
  try {
    await initializeDefaultSettings();
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error initializing default prompts:', error);
    sendResponse({ success: false, error: 'Failed to initialize default prompts' });
  }
}

// For MVP, no complex user validation needed

// Test API connection
async function testApiConnection(sendResponse: ChromeSendResponse): Promise<void> {
  try {
    const startTime = Date.now();
    const result = await generateSaaSResponse('Test connection. Respond with "OK".', 'Test');
    const latency = Date.now() - startTime;
    
    sendResponse({
      success: !!result,
      error: result ? undefined : 'Test failed',
      latency: result ? latency : undefined,
      response: result
    });
  } catch (error) {
    log('Error testing API connection:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed'
    });
  }
}

// Export for testing purposes
export { 
  initializeDefaultSettings, 
  handleGenerateResponse, 
  getPrompts,
  savePrompt,
  deletePrompt,
  initializeDefaultPrompts,
  testApiConnection
}; 