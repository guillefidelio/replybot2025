/**
 * Simple injector that attempts to inject a button once without retry logic.
 * This is the "dumb" injector - it just tries once and reports success/failure.
 * The MutationObserver in page_manager.ts handles retries automatically.
 */

import { type SiteRule } from './site_rules';
import { handleAIButtonClick } from './click_handler';
import { iframeBulkProcessor } from './iframe_bulk_processor';

const AI_BUTTON_CLASS = 'ai-inject-button';
const BULK_CONTROLS_CLASS = 'ai-bulk-controls';

/**
 * Check if user is authenticated by looking for authUser in Chrome storage
 */
async function checkAuthentication(): Promise<boolean> {
  if (!chrome.runtime?.id) {
    console.log('[SimpleInjector] 🚫 Chrome runtime not available');
    return false;
  }
  
  try {
    const result = await chrome.storage.local.get(['authUser']);
    const isAuthenticated = !!result.authUser;
    
    if (isAuthenticated) {
      console.log('[SimpleInjector] ✅ User authenticated:', {
        uid: result.authUser.uid,
        email: result.authUser.email
      });
    } else {
      console.log('[SimpleInjector] 🔒 User not authenticated - buttons will not be injected');
    }
    
    return isAuthenticated;
  } catch (error) {
    console.error('[SimpleInjector] ❌ Error checking authentication:', error);
    return false;
  }
}

/**
 * Creates the AI button element.
 * It uses a combination of custom and Google's classes to match the UI.
 */
function createAIButton(config: SiteRule, iframeType: string): HTMLElement {
  const button = document.createElement('button');
  // Use the same classes as Google's buttons for consistent styling.
  button.className = `${AI_BUTTON_CLASS} VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-k8QpJ VfPpkd-LgbsSe-OWXEXe-dgl2Hf nCP5yc AjY5Oe LQeN7 TUT4y`;
  button.innerHTML = `
    <div class="VfPpkd-Jh9lGc"></div>
    <div class="VfPpkd-J1Ukfc-LhBDec"></div>
    <div class="VfPpkd-RLmnJb"></div>
    <span class="VfPpkd-vQzf8d">${config.buttonText || 'Respond with AI'}</span>
  `;
  // Use a data attribute to identify the button and its context.
  button.setAttribute('data-iframe-type', iframeType);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleAIButtonClick(config);
  });

  return button;
}

/**
 * Creates bulk processing controls for iframe view
 */
function createBulkControls(): HTMLElement {
  const controlsContainer = document.createElement('div');
  controlsContainer.className = BULK_CONTROLS_CLASS;
  controlsContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10001;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: white;
    min-width: 200px;
  `;

  const title = document.createElement('h3');
  title.textContent = '🚀 Bulk Processing';
  title.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: 600;';

  const positiveButton = document.createElement('button');
  positiveButton.textContent = '⭐ Process Positive (4-5★)';
  positiveButton.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    margin-bottom: 8px;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  `;
  positiveButton.onclick = () => iframeBulkProcessor.startBulkProcessing('positive');

  const fullButton = document.createElement('button');
  fullButton.textContent = '📝 Process All Reviews';
  fullButton.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    background: #f59e0b;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  `;
  fullButton.onclick = () => iframeBulkProcessor.startBulkProcessing('full');

  controlsContainer.appendChild(title);
  controlsContainer.appendChild(positiveButton);
  controlsContainer.appendChild(fullButton);

  return controlsContainer;
}

/**
 * Attempts to inject the AI button once. Returns true if successful, false otherwise.
 * This function does NOT retry - that's handled by the MutationObserver.
 */
export async function attemptInjectButton(config: SiteRule, iframeType: string): Promise<boolean> {
  console.log('[SimpleInjector] 🔍 Attempting to inject button for:', iframeType);

  // Check if user is authenticated before injecting button
  const isAuthenticated = await checkAuthentication();
  if (!isAuthenticated) {
    console.log('[SimpleInjector] 🚫 Skipping button injection - user not authenticated');
    return false;
  }

  // Check if button already exists
  if (document.querySelector(`.${AI_BUTTON_CLASS}`)) {
    console.log('[SimpleInjector] ✅ Button already exists, skipping injection');
    return true; // Consider this a success since the button is there
  }

  // Validate required selectors
  if (!config.containerSelector || !config.referenceButtonSelector) {
    console.log('[SimpleInjector] ❌ Missing required selectors for button injection');
    return false;
  }

  // Find the container
  const container = document.querySelector(config.containerSelector);
  if (!container) {
    console.log('[SimpleInjector] ❌ Container not found:', config.containerSelector);
    return false;
  }

  // Find the reference button
  const referenceButton = container.querySelector(config.referenceButtonSelector);
  if (!referenceButton) {
    console.log('[SimpleInjector] ❌ Reference button not found:', config.referenceButtonSelector);
    return false;
  }

  // Create and inject the AI button
  const aiButton = createAIButton(config, iframeType);
  
  try {
    // Insert the button after the reference button
    if (referenceButton.parentNode) {
      referenceButton.parentNode.insertBefore(aiButton, referenceButton.nextSibling);
      console.log('[SimpleInjector] 🎉 Button injected successfully');
      
      // Also inject bulk processing controls if not already present
      if (!document.querySelector(`.${BULK_CONTROLS_CLASS}`)) {
        const bulkControls = createBulkControls();
        document.body.appendChild(bulkControls);
        console.log('[SimpleInjector] 🎉 Bulk controls injected successfully');
      }
      
      return true;
    } else {
      console.log('[SimpleInjector] ❌ Reference button has no parent node');
      return false;
    }
  } catch (error) {
    console.error('[SimpleInjector] ❌ Error injecting button:', error);
    return false;
  }
}

/**
 * Removes all AI buttons and bulk controls from the page
 */
export function removeAllAIButtons(): void {
  // Remove AI buttons
  const buttons = document.querySelectorAll(`.${AI_BUTTON_CLASS}`);
  buttons.forEach(button => {
    try {
      if (button.parentNode) {
        button.parentNode.removeChild(button);
      }
    } catch (error) {
      console.error('[SimpleInjector] Error removing button:', error);
    }
  });
  
  // Remove bulk controls
  const bulkControls = document.querySelectorAll(`.${BULK_CONTROLS_CLASS}`);
  bulkControls.forEach(control => {
    try {
      if (control.parentNode) {
        control.parentNode.removeChild(control);
      }
    } catch (error) {
      console.error('[SimpleInjector] Error removing bulk controls:', error);
    }
  });
  
  // Stop any active bulk processing
  iframeBulkProcessor.stopBulkProcessing();
  
  const totalRemoved = buttons.length + bulkControls.length;
  if (totalRemoved > 0) {
    console.log(`[SimpleInjector] 🗑️ Removed ${buttons.length} AI button(s) and ${bulkControls.length} bulk control(s) due to authentication change`);
  }
} 