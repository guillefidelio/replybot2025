// src/features/iframe-detector/page_manager.ts

import { detectIframeType } from './detector';
import { attemptInjectButton, removeAllAIButtons } from './simple_injector';
import { bulkProcessingManager } from './bulk_processing_manager';
import { iframeBulkProcessor } from './iframe_bulk_processor';

/**
 * Page manager that uses MutationObserver to detect DOM changes
 * and automatically handles button injection retries.
 */

class PageManager {
  private observer: MutationObserver | null = null;
  private currentIframeType: string | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.isInitialized) return;
    
    console.log('[PageManager] Initializing...');
    this.setupAuthListener();
    this.handleUrlChange();
    this.setupMutationObserver();
    this.isInitialized = true;
  }

  /**
   * Set up listener for authentication state changes
   */
  private setupAuthListener(): void {
    if (!chrome.runtime?.id) return;
    
    // Listen for changes in authentication state
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.authUser) {
        const wasAuthenticated = !!changes.authUser.oldValue;
        const isAuthenticated = !!changes.authUser.newValue;
        
        console.log('[PageManager] Auth state changed:', { wasAuthenticated, isAuthenticated });
        
        if (wasAuthenticated && !isAuthenticated) {
          // User logged out - remove all AI buttons
          removeAllAIButtons();
          console.log('[PageManager] User logged out - removed all AI buttons');
        } else if (!wasAuthenticated && isAuthenticated) {
          // User logged in - attempt to inject button if we're on a valid page
          console.log('[PageManager] User logged in - checking for button injection');
          setTimeout(() => {
            this.handleUrlChange();
          }, 1000);
        }
      }
    });
  }

  private handleUrlChange(): void {
    const currentUrl = window.location.href;
    console.log('[PageManager] Handling URL change:', currentUrl);

    const detectionResult = detectIframeType(currentUrl);
    
    if (detectionResult) {
      const { key, config } = detectionResult;
      this.currentIframeType = key;
      
      console.log(`[PageManager] Detected iframe type: ${key}`);
      
      if (config.injectButton) {
        // Attempt initial injection
        this.attemptButtonInjection(config, key);
      }
    } else {
      // No valid iframe detected, remove any existing buttons
      this.currentIframeType = null;
      removeAllAIButtons();
    }
  }

  private async attemptButtonInjection(config: any, iframeType: string): Promise<void> {
    try {
      const success = await attemptInjectButton(config, iframeType);
      if (success) {
        console.log(`[PageManager] Button injection successful for ${iframeType}`);
      } else {
        console.log(`[PageManager] Button injection failed for ${iframeType} - will retry on DOM changes`);
      }
    } catch (error) {
      console.error('[PageManager] Error during button injection:', error);
    }
  }

  private setupMutationObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      // Only process if we have a current iframe type that should have a button
      if (!this.currentIframeType) return;

      let shouldRetryInjection = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check if any nodes were added that might affect our injection
          if (mutation.addedNodes.length > 0) {
            shouldRetryInjection = true;
            break;
          }
        }
      }

      if (shouldRetryInjection) {
        // Debounce the retry attempts
        this.debounceRetryInjection();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[PageManager] MutationObserver set up');
  }

  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  private debounceRetryInjection(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    this.retryTimeout = setTimeout(async () => {
      if (this.currentIframeType) {
        const detectionResult = detectIframeType(window.location.href);
        if (detectionResult && detectionResult.config.injectButton) {
          console.log('[PageManager] Retrying button injection due to DOM changes');
          await this.attemptButtonInjection(detectionResult.config, this.currentIframeType);
        }
      }
    }, 500); // 500ms debounce
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    
    // Clean up bulk processing managers
    bulkProcessingManager.destroy();
    iframeBulkProcessor.destroy();
    
    removeAllAIButtons();
    this.isInitialized = false;
    console.log('[PageManager] Destroyed');
  }
}

// Export a singleton instance
export const pageManager = new PageManager(); 