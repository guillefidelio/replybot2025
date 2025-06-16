import { handleAIButtonClick } from './click_handler';
import { type IframeConfig } from './central_config';

type ConfigEntry = IframeConfig[keyof IframeConfig];

const AI_BUTTON_CLASS = 'ai-inject-button';
let currentInjectionController: AbortController | null = null;

/**
 * Creates the AI button element.
 * It uses a combination of custom and Google's classes to match the UI.
 */
function createAIButton(config: ConfigEntry, iframeType: string): HTMLElement {
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
 * Core logic for injecting the button. This assumes the script is running INSIDE the target iframe.
 * It returns 'true' on success or if the button already exists, and 'false' on failure.
 */
function injectButton(config: ConfigEntry, iframeType: string): boolean {
  // The 'document' object IS the iframe's document because of "all_frames": true.
  
  // 1. Find the container for the entire reply section.
  if (!config.containerSelector) {
    console.log('[Injector] No container selector provided.');
    return false;
  }
  const container = document.querySelector(config.containerSelector);
  if (!container) {
    console.log('[Injector] Prerequisite failed: Container not found yet.');
    return false;
  }

  // 2. Check if our button has already been injected in this container.
  const existingButton = container.querySelector(`.${AI_BUTTON_CLASS}[data-iframe-type="${iframeType}"]`);
  if (existingButton) {
    console.log('[Injector] Skipped: Button already exists.');
    return true; // Success, as the button is already there.
  }

  // 3. Find the stable reference element (e.g., the "Send" button) to position our button.
  if (!config.referenceButtonSelector) {
    console.log('[Injector] No reference button selector provided.');
    return false;
  }
  const referenceButton = container.querySelector(config.referenceButtonSelector) as HTMLElement;
  if (!referenceButton || !referenceButton.parentNode) {
    console.log('[Injector] Prerequisite failed: Reference button not found yet.');
    return false;
  }

  // If all checks pass, create and inject the button.
  console.log('[Injector] All prerequisites met. Injecting button...');
  const newButton = createAIButton(config, iframeType);
  // Inject our button immediately AFTER the reference button.
  referenceButton.parentNode.insertBefore(newButton, referenceButton.nextSibling);
  console.log('[Injector] Button injected successfully!');
  
  return true; // Signal success.
}

/**
 * Cancellable delay function that respects AbortController
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);
    
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Operation cancelled'));
      });
    }
  });
}

/**
 * Attempts to inject the AI button with a retry mechanism to handle dynamic UIs.
 * This version supports cancellation to prevent lingering retry attempts.
 */
export async function injectButtonWithRetry(config: ConfigEntry, iframeType: string): Promise<void> {
  // Cancel any existing injection process
  if (currentInjectionController) {
    console.log('[Injector] Cancelling previous injection process.');
    currentInjectionController.abort();
  }

  // Create a new controller for this injection process
  currentInjectionController = new AbortController();
  const signal = currentInjectionController.signal;

  const maxRetries = 5;
  const delayMs = 1000; // 1 second
  let injectionSuccessful = false; // Add a flag to track success

  console.log(`[Injector] Starting injection attempt for rule: ${config.overlayMessage}`);

  try {
    for (let i = 0; i < maxRetries; i++) {
      // Check if we've been cancelled
      if (signal.aborted) {
        console.log('[Injector] Injection process was cancelled.');
        return;
      }

      // Before each injection attempt, check if button already exists globally
      const existingButton = document.querySelector(`.${AI_BUTTON_CLASS}[data-iframe-type="${iframeType}"]`);
      if (existingButton) {
        console.log('[Injector] Button already exists globally. Stopping retry.');
        injectionSuccessful = true;
        break;
      }

      console.log(`[Injector] Injection attempt #${i + 1}`);
      if (injectButton(config, iframeType)) {
        console.log('[Injector] Injection process successful.');
        injectionSuccessful = true; // Set flag to true
        break; // *** CRITICAL CHANGE: Explicitly break the loop ***
      }
      
      console.log(`[Injector] Attempt #${i + 1} failed. Retrying in ${delayMs}ms...`);
      
      // Use cancellable delay
      await delay(delayMs, signal);
    }

    if (!injectionSuccessful) {
      console.error(`[Injector] Failed to inject button after ${maxRetries} attempts. Could not meet prerequisites.`);
    }

  } catch (error) {
    if (error instanceof Error && error.message === 'Operation cancelled') {
      console.log('[Injector] Injection process was cancelled during retry.');
    } else {
      console.error('[Injector] Unexpected error during injection:', error);
    }
  } finally {
    // The finally block will run after the loop is broken or finishes.
    currentInjectionController = null; // Always clear the controller
  }
}

/**
 * Removes the AI button from the page if it exists.
 */
export function removeAIButton(): void {
  // Find all injected buttons, as there might be instances from different contexts.
  const buttons = document.querySelectorAll(`.${AI_BUTTON_CLASS}`);
  if (buttons.length > 0) {
    buttons.forEach(button => button.remove());
    console.log(`[Injector] Removed ${buttons.length} AI button(s).`);
  }
} 