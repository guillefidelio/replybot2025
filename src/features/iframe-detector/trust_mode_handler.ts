/**
 * Trust Mode Handler for iframe view
 * Manages individual trust mode logic and auto-submission
 */

interface ExtensionSettings {
  trustModes: {
    individual: boolean;
    bulkPositive: boolean;
    bulkFull: boolean;
  };
  rateLimit: number;
  maxPages: number;
}

interface ReviewData {
  reviewerName: string | null;
  rating: string | null;
  reviewContent: string | null;
}

interface BackgroundResponse {
  success: boolean;
  data?: {
    responseText: string;
    reviewId?: string;
    rating?: number;
  };
  error?: string;
}

/**
 * Loads extension settings from Chrome storage
 */
async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const result = await chrome.storage.local.get(['settings']);
    return result.settings || {
      trustModes: { individual: false, bulkPositive: false, bulkFull: false },
      rateLimit: 15000,
      maxPages: 3
    };
  } catch (error) {
    console.error('[TrustModeHandler] Error loading settings:', error);
    return {
      trustModes: { individual: false, bulkPositive: false, bulkFull: false },
      rateLimit: 15000,
      maxPages: 3
    };
  }
}

/**
 * Fills the response textarea with the AI-generated response
 */
async function fillResponseTextarea(responseText: string): Promise<boolean> {
  try {
    // Find the textarea with jsname="YPqjbf"
    const textarea = document.querySelector('textarea[jsname="YPqjbf"]') as HTMLTextAreaElement;
    
    if (!textarea) {
      console.error('[TrustModeHandler] Response textarea not found');
      return false;
    }
    
    // Fill the textarea
    textarea.value = responseText;
    
    // Trigger input events to ensure the UI updates properly
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Focus the textarea so user can see the response
    textarea.focus();
    
    console.log('[TrustModeHandler] ✅ Response filled into textarea successfully');
    return true;
  } catch (error) {
    console.error('[TrustModeHandler] Error filling textarea:', error);
    return false;
  }
}

/**
 * Auto-submits the response by clicking the submit button
 */
async function autoSubmitResponse(): Promise<boolean> {
  try {
    // Wait 1 second as specified in the requirements
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Find the submit button using the selector provided: div.VfPpkd-RLmnJb
    // This is inside the submit button structure
    const submitButtonContainer = document.querySelector('div.VfPpkd-RLmnJb');
    
    if (submitButtonContainer) {
      // Find the actual button element (parent of the div)
      const submitButton = submitButtonContainer.closest('button');
      
      if (submitButton) {
        (submitButton as HTMLElement).click();
        console.log('[TrustModeHandler] ✅ Response auto-submitted successfully');
        return true;
      }
    }
    
    // Fallback: try to find submit button by other selectors
    const fallbackButton = document.querySelector('button[jsname="hrGhad"]') as HTMLElement;
    if (fallbackButton) {
      fallbackButton.click();
      console.log('[TrustModeHandler] ✅ Response auto-submitted via fallback selector');
      return true;
    }
    
    console.error('[TrustModeHandler] Submit button not found for auto-submission');
    return false;
  } catch (error) {
    console.error('[TrustModeHandler] Error auto-submitting response:', error);
    return false;
  }
}

/**
 * Shows a notification to the user
 */
function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    z-index: 10001;
    max-width: 350px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    background-color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: slideIn 0.3s ease-out;
  `;
  
  // Add slide-in animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  notification.textContent = message;
  document.body.appendChild(notification);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 300);
  }, 4000);
}

/**
 * Handles the complete trust mode flow for individual reviews
 */
export async function handleTrustModeResponse(
  _reviewData: ReviewData,
  backgroundResponse: BackgroundResponse
): Promise<void> {
  console.log('[TrustModeHandler] 🛡️ Processing trust mode response...');
  
  if (!backgroundResponse.success || !backgroundResponse.data?.responseText) {
    console.error('[TrustModeHandler] Invalid background response');
    showNotification('Failed to generate AI response', 'error');
    return;
  }
  
  const responseText = backgroundResponse.data.responseText;
  console.log('[TrustModeHandler] Generated response:', responseText);
  
  // Load current settings to check trust mode
  const settings = await loadSettings();
  const trustModeEnabled = settings.trustModes.individual;
  
  // Fill the textarea
  const fillSuccess = await fillResponseTextarea(responseText);
  
  if (!fillSuccess) {
    showNotification('AI response generated but could not fill textarea. Check console for details.', 'error');
    console.log('[TrustModeHandler] 📋 Generated response (copy manually):', responseText);
    return;
  }
  
  if (trustModeEnabled) {
    // Trust mode: auto-submit the response
    console.log('[TrustModeHandler] 🚀 Trust mode enabled - auto-submitting response...');
    
    const submitSuccess = await autoSubmitResponse();
    
    if (submitSuccess) {
      showNotification('✨ AI response generated and posted automatically!', 'success');
    } else {
      showNotification('Response filled but auto-submit failed. Please click Send manually.', 'info');
    }
  } else {
    // Preview mode: just show success message
    showNotification('✨ AI response generated and filled! Review and send when ready.', 'success');
  }
} 