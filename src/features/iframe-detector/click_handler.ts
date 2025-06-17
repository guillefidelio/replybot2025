/**
 * This module contains the logic for what happens when the AI button is clicked.
 * It extracts review data, generates AI responses, and delegates to trust mode handler.
 */

import { type SiteRule } from './site_rules';
import { handleTrustModeResponse } from './trust_mode_handler';

interface ReviewData {
  reviewerName: string | null;
  rating: string | null;
  reviewContent: string | null;
}

// BackgroundResponse interface removed - using direct response structure

/**
 * Extracts review data from the current page
 */
function extractReviewData(): ReviewData {
  // Try to find reviewer name using the selector you provided earlier
  const reviewerNameElement = document.querySelector('.N0c6q.JhRJje');
  const reviewerName = reviewerNameElement?.textContent?.trim() || null;

  // Extract rating using the specific selector you provided
  const ratingElement = document.querySelector('.DYizzd[aria-label][role="img"]');
  const rating = ratingElement?.getAttribute('aria-label') || null;

  // Extract review content using the specific selector you provided
  const contentElement = document.querySelector('.gyKkFe.JhRJje.Fv38Af');
  const reviewContent = contentElement?.textContent?.trim() || null;

  return {
    reviewerName,
    rating,
    reviewContent
  };
}

/**
 * Parses rating string like "5 de 5 estrellas" to extract numeric rating
 */
function parseRating(ratingString: string | null): number {
  if (!ratingString) return 5; // Default to 5 stars
  
  // Look for patterns like "5 de 5", "4 out of 5", "3/5", etc.
  const patterns = [
    /(\d+)\s*de\s*5/i,           // "5 de 5 estrellas"
    /(\d+)\s*out\s*of\s*5/i,    // "5 out of 5 stars"
    /(\d+)\/5/i,                // "5/5"
    /(\d+)\s*star/i,            // "5 stars"
    /(\d+)/                     // Any number as fallback
  ];
  
  for (const pattern of patterns) {
    const match = ratingString.match(pattern);
    if (match) {
      const rating = parseInt(match[1], 10);
      if (rating >= 1 && rating <= 5) {
        return rating;
      }
    }
  }
  
  return 5; // Default fallback
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
 * Updates button state during processing
 */
function updateButtonState(button: HTMLElement | null, state: 'loading' | 'success' | 'error' | 'default'): void {
  if (!button) return;
  
  const textSpan = button.querySelector('.VfPpkd-vQzf8d');
  if (!textSpan) return;
  
  switch (state) {
    case 'loading':
      textSpan.textContent = '🤖 Generating...';
      button.style.opacity = '0.7';
      button.setAttribute('disabled', 'true');
      break;
    case 'success':
      textSpan.textContent = '✅ Response Generated';
      button.style.opacity = '1';
      button.removeAttribute('disabled');
      setTimeout(() => updateButtonState(button, 'default'), 2000);
      break;
    case 'error':
      textSpan.textContent = '❌ Error - Try Again';
      button.style.opacity = '1';
      button.removeAttribute('disabled');
      setTimeout(() => updateButtonState(button, 'default'), 3000);
      break;
    case 'default':
      textSpan.textContent = 'Respond with AI';
      button.style.opacity = '1';
      button.removeAttribute('disabled');
      break;
  }
}

interface CreditCheckResult {
  hasCredits: boolean;
  available: number;
  required: number;
  message: string;
  canProceed: boolean;
}

/**
 * Check credit availability before processing AI request
 */
async function checkCreditAvailability(): Promise<CreditCheckResult> {
  try {
    // Send message to background script to check credits
    const response = await chrome.runtime.sendMessage({
      action: 'checkCredits',
      data: { operation: 'individual_response' }
    });

    if (response && response.success) {
      return {
        hasCredits: response.data.hasCredits,
        available: response.data.available,
        required: response.data.required || 1,
        message: response.data.message || '',
        canProceed: response.data.canProceed
      };
    } else {
      console.error('[ClickHandler] Credit check failed:', response?.error);
      return {
        hasCredits: false,
        available: 0,
        required: 1,
        message: response?.error || 'Failed to check credit availability',
        canProceed: false
      };
    }
  } catch (error) {
    console.error('[ClickHandler] Error checking credits:', error);
    return {
      hasCredits: false,
      available: 0,
      required: 1,
      message: 'Error checking credit availability',
      canProceed: false
    };
  }
}

/**
 * Show credit exhaustion modal with upgrade options
 */
function showCreditExhaustionModal(creditInfo: CreditCheckResult): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      z-index: 10004;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      border-radius: 16px;
      padding: 32px;
      max-width: 450px;
      width: 90%;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
      color: #333;
      text-align: center;
    `;

    const icon = document.createElement('div');
    icon.style.cssText = `
      font-size: 48px;
      margin-bottom: 16px;
    `;
    icon.textContent = '💳';

    const title = document.createElement('h2');
    title.textContent = 'Credits Required';
    title.style.cssText = 'margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #1f2937;';

    const message = document.createElement('p');
    message.innerHTML = `
      You need <strong>${creditInfo.required} credit${creditInfo.required > 1 ? 's' : ''}</strong> to generate an AI response.<br>
      You currently have <strong>${creditInfo.available} credit${creditInfo.available !== 1 ? 's' : ''}</strong> available.
    `;
    message.style.cssText = 'margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #6b7280;';

    const upgradeInfo = document.createElement('div');
    upgradeInfo.style.cssText = `
      background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
      text-align: left;
    `;
    upgradeInfo.innerHTML = `
      <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #374151;">🚀 Upgrade Options:</h3>
      <ul style="margin: 0; padding-left: 20px; color: #6b7280; font-size: 14px; line-height: 1.6;">
        <li><strong>Starter Plan:</strong> 100 credits/month + bulk processing</li>
        <li><strong>Professional Plan:</strong> 500 credits/month + advanced features</li>
        <li><strong>Free Plan:</strong> 10 credits/month (resets monthly)</li>
      </ul>
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 12px; justify-content: center; margin-top: 24px;';

    const upgradeButton = document.createElement('button');
    upgradeButton.textContent = '⬆️ Upgrade Plan';
    upgradeButton.style.cssText = `
      padding: 12px 24px;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    `;
    upgradeButton.onmouseover = () => upgradeButton.style.transform = 'scale(1.05)';
    upgradeButton.onmouseout = () => upgradeButton.style.transform = 'scale(1)';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      padding: 12px 24px;
      background: #f9fafb;
      color: #374151;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    `;

    const cleanup = () => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    };

    upgradeButton.onclick = () => {
      cleanup();
      // Open extension popup for upgrade
      chrome.runtime.sendMessage({ action: 'openUpgradeFlow' });
      resolve(false);
    };

    cancelButton.onclick = () => {
      cleanup();
      resolve(false);
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    };

    buttonContainer.appendChild(upgradeButton);
    buttonContainer.appendChild(cancelButton);
    modal.appendChild(icon);
    modal.appendChild(title);
    modal.appendChild(message);
    modal.appendChild(upgradeInfo);
    modal.appendChild(buttonContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

export async function handleAIButtonClick(config: SiteRule) {
  console.log('[ClickHandler] 🚀 Starting AI response generation...');
  console.log('[ClickHandler] AI button clicked for rule:', config.id || 'Unknown');
  
  // Find the button that was clicked to update its state
  const aiButton = document.querySelector('.ai-inject-button') as HTMLElement;
  updateButtonState(aiButton, 'loading');
  
  try {
    // STEP 1: Check credit availability first
    console.log('[ClickHandler] Checking credit availability before generating response...');
    const creditCheck = await checkCreditAvailability();
    
    if (!creditCheck.canProceed) {
      console.log('[ClickHandler] Insufficient credits:', creditCheck);
      updateButtonState(aiButton, 'error');
      
      // Show credit exhaustion modal
      await showCreditExhaustionModal(creditCheck);
      return;
    }

    console.log('[ClickHandler] Credit check passed, proceeding with AI generation...');
    
    // STEP 2: Extract review data from the page
    const reviewData = extractReviewData();
    
    // Log the extracted data
    console.log('📝 Review Data Extracted:');
    console.log('👤 Reviewer Name:', reviewData.reviewerName || 'Not found');
    console.log('⭐ Rating:', reviewData.rating || 'Not found');
    console.log('💬 Review Content:', reviewData.reviewContent || 'Not found');
    console.log('[ClickHandler] Raw review data:', reviewData);
    
    // Parse the rating to a number
    const numericRating = parseRating(reviewData.rating);
    console.log('[ClickHandler] Parsed rating:', numericRating);
    
    // Validate that we have the minimum required data
    if (!reviewData.reviewerName && !reviewData.reviewContent) {
      console.error('[ClickHandler] ❌ Insufficient review data extracted');
      showNotification('Could not extract review data. Please try again.', 'error');
      updateButtonState(aiButton, 'error');
      return;
    }
    
    // STEP 3: Prepare data for background script (matching the expected format)
    const backgroundRequestData = {
      reviewData: {
        id: `review-${Date.now()}`,
        reviewer: reviewData.reviewerName || 'Anonymous',
        rating: numericRating,
        text: reviewData.reviewContent || `${numericRating}-star review without text`
      }
    };
    
    console.log('[ClickHandler] 📤 Sending to background script:', backgroundRequestData);
    
    // STEP 4: Send request to background script to generate AI response (this will consume credits)
    const response = await chrome.runtime.sendMessage({
      action: 'generateResponse',
      data: backgroundRequestData
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to generate AI response');
    }
    
    console.log('[ClickHandler] ✅ AI response generated successfully');
    console.log('[ClickHandler] Response:', response.data.responseText);
    
    // STEP 5: Handle the response with trust mode
    const reviewDataForTrustMode = {
      reviewerName: reviewData.reviewerName,
      rating: reviewData.rating,
      reviewContent: reviewData.reviewContent
    };
    await handleTrustModeResponse(reviewDataForTrustMode, response);
    
    // Update button state and show success notification
    updateButtonState(aiButton, 'success');
    showNotification(`AI response generated successfully! (${creditCheck.available - 1} credits remaining)`, 'success');
    
  } catch (error) {
    console.error('[ClickHandler] ❌ Error during AI response generation:', error);
    
    // Check if it's a credit-related error
    if (error instanceof Error && error.message.includes('credit')) {
      showNotification('Credit error: ' + error.message, 'error');
      // Re-check credits to get updated status
      const updatedCreditCheck = await checkCreditAvailability();
      if (!updatedCreditCheck.canProceed) {
        await showCreditExhaustionModal(updatedCreditCheck);
      }
    } else {
      showNotification('Error generating AI response. Please try again.', 'error');
    }
    
    updateButtonState(aiButton, 'error');
  }
} 