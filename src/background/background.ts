// Background service worker for AI Review Responder Chrome Extension
// Handles API communications via Google Cloud Function (secure OpenAI proxy)

// Google Cloud Function API configuration
const CLOUD_FUNCTION_URL = 'https://us-central1-review-responder-backend.cloudfunctions.net/openai-proxy';

// Enhanced logging function
type LogData = unknown;
const log = (message: string, data?: LogData) => {
  if (data !== undefined) {
    console.log(`[Background] ${message}`, data);
  } else {
    console.log(`[Background] ${message}`);
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
      
    // Removed VALIDATE_USER for MVP simplicity
      
    default:
      console.warn('Unknown message type:', msgType);
      (sendResponse as ChromeSendResponse)({ success: false, error: 'Unknown message type' });
  }
});

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

// Handle AI response generation using OpenAI API
async function handleGenerateResponse(
  data: { reviewData?: ReviewData; review?: SimpleReview; promptType?: string; prompt?: string },
  sendResponse: ChromeSendResponse
): Promise<void> {
  try {
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
      const variant = hasText ? 'with_text' : 'no_text';
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

    const responseText = await generateSaaSResponse(systemPrompt, userPrompt);

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

// Google Cloud Function API call with retry logic
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

// Get prompts from storage
async function getPrompts(sendResponse: ChromeSendResponse): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['prompts']);
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