/**
 * This content script is dedicated to running on google.com pages.
 * Its sole purpose is to initialize the page manager and handle business ID extraction.
 */
import { pageManager } from '../features/iframe-detector/page_manager';

console.log('[ContentScript-Google] Loaded. Page manager initialized automatically.');

// The page manager initializes itself in its constructor, so no need to call initialize()
// Just ensure it's imported and the singleton is created

/**
 * Extract business ID from data-lid attribute (simplified version for Google search)
 */
function extractBusinessIdFromGoogle(): string | null {
  try {
    // Look for data-lid attributes in the DOM (primary method for Google search)
    // Google uses data-lid for location identifiers in search results
    const elementWithLid = document.querySelector('[data-lid]');
    if (elementWithLid) {
      const lid = elementWithLid.getAttribute('data-lid');
      if (lid && lid.length > 0) {
        console.log('[BusinessId] Found data-lid:', lid);
        return lid;
      }
    }
    
    console.log('[BusinessId] No data-lid found on Google search page');
    return null;
  } catch (error) {
    console.error('[BusinessId] Error extracting business ID:', error);
    return null;
  }
}

// Business ID test button removed - no longer needed since extraction is working properly

// Setup message listener for business ID requests
if (chrome.runtime?.id) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_BUSINESS_ID') {
      const businessId = extractBusinessIdFromGoogle();
      console.log('[DEBUG] Business ID extraction requested');
      console.log('[DEBUG] Current URL:', window.location.href);
      console.log('[DEBUG] Extracted Business ID:', businessId);
      
      sendResponse({ businessId });
      return true; // Keep the message channel open for async response
    }
  });
}

// Business ID test button functionality removed - no longer needed

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  pageManager.destroy();
}); 