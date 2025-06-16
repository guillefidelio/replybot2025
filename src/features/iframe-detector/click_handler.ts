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

export function handleAIButtonClick(config: SiteRule | any) {
  console.log('[ClickHandler] 🚀 Starting AI response generation...');
  console.log('[ClickHandler] AI button clicked for rule:', config.id || config.overlayMessage || 'Unknown');
  
  // Find the button that was clicked to update its state
  const aiButton = document.querySelector('.ai-inject-button') as HTMLElement;
  updateButtonState(aiButton, 'loading');
  
  // Extract review data from the page
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
  
  // Prepare data for background script (matching the expected format)
  const backgroundRequestData = {
    reviewData: {
      id: `review-${Date.now()}`,
      reviewer: reviewData.reviewerName || 'Anonymous',
      rating: numericRating,
      text: reviewData.reviewContent || `${numericRating}-star review without text`
    }
  };
  
  console.log('[ClickHandler] 📤 Sending to background script:', backgroundRequestData);
  
  // Send message to background script for AI response generation
  chrome.runtime.sendMessage(
    {
      type: 'GENERATE_RESPONSE',
      ...backgroundRequestData
    },
    async (response: BackgroundResponse) => {
      console.log('[ClickHandler] 📥 Background script response:', response);
      
      if (chrome.runtime.lastError) {
        console.error('[ClickHandler] Chrome runtime error:', chrome.runtime.lastError);
        showNotification('Extension communication error. Please try again.', 'error');
        updateButtonState(aiButton, 'error');
        return;
      }
      
      if (!response) {
        console.error('[ClickHandler] No response from background script');
        showNotification('No response from AI service. Please try again.', 'error');
        updateButtonState(aiButton, 'error');
        return;
      }
      
      if (!response.success) {
        console.error('[ClickHandler] Background script error:', response.error);
        showNotification(`AI Error: ${response.error || 'Unknown error'}`, 'error');
        updateButtonState(aiButton, 'error');
        return;
      }
      
      if (!response.data?.responseText) {
        console.error('[ClickHandler] No response text in successful response');
        showNotification('AI generated empty response. Please try again.', 'error');
        updateButtonState(aiButton, 'error');
        return;
      }
      
      // Success! Delegate to trust mode handler
      console.log('[ClickHandler] 🎉 AI Response Generated - delegating to trust mode handler');
      updateButtonState(aiButton, 'success');
      
      try {
        await handleTrustModeResponse(reviewData, response);
      } catch (error) {
        console.error('[ClickHandler] Error in trust mode handler:', error);
        showNotification('Error processing response. Please try again.', 'error');
        updateButtonState(aiButton, 'error');
      }
    }
  );
} 