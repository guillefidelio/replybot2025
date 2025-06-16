/**
 * Iframe Bulk Processor
 * Handles auto-cascade bulk processing for iframe view
 * Leverages automatic iframe updates after each review submission
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

interface BulkProcessingState {
  isActive: boolean;
  mode: 'positive' | 'full';
  totalReviews: number;
  currentReview: number;
  processedCount: number;
  skippedCount: number;
  errorCount: number;
  startTime: number;
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

class IframeBulkProcessor {
  private state: BulkProcessingState = {
    isActive: false,
    mode: 'positive',
    totalReviews: 0,
    currentReview: 0,
    processedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    startTime: 0
  };

  private settings: ExtensionSettings | null = null;
  private iframeObserver: MutationObserver | null = null;
  private processingTimeout: ReturnType<typeof setTimeout> | null = null;
  private bulkControlsElement: HTMLElement | null = null;

  constructor() {
    this.loadSettings();
    this.setupAuthListener();
  }

  /**
   * Load extension settings from Chrome storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['settings']);
      this.settings = result.settings || {
        trustModes: { individual: false, bulkPositive: false, bulkFull: false },
        rateLimit: 15000,
        maxPages: 3
      };
    } catch (error) {
      console.error('[IframeBulkProcessor] Error loading settings:', error);
      this.settings = {
        trustModes: { individual: false, bulkPositive: false, bulkFull: false },
        rateLimit: 15000,
        maxPages: 3
      };
    }
  }

  /**
   * Set up listener for authentication and settings changes
   */
  private setupAuthListener(): void {
    if (!chrome.runtime?.id) return;
    
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local') {
        if (changes.authUser) {
          const wasAuthenticated = !!changes.authUser.oldValue;
          const isAuthenticated = !!changes.authUser.newValue;
          
          if (wasAuthenticated && !isAuthenticated) {
            // User logged out - stop bulk processing
            this.stopBulkProcessing();
          }
        }
        
        if (changes.settings) {
          this.loadSettings();
        }
      }
    });
  }

  /**
   * Extract progress information from the page
   */
  private extractProgressInfo(): { current: number; total: number } | null {
    try {
      // Find the progress element: <div class="LTHHeb JhRJje">1 de 15&nbsp;opiniones</div>
      const progressElement = document.querySelector('.LTHHeb.JhRJje');
      
      if (!progressElement) {
        console.log('[IframeBulkProcessor] Progress element not found');
        return null;
      }
      
      const progressText = progressElement.textContent || '';
      console.log('[IframeBulkProcessor] Progress text:', progressText);
      
      // Parse patterns like "1 de 15 opiniones" or "1 of 15 reviews"
      const patterns = [
        /(\d+)\s*de\s*(\d+)/i,  // Spanish: "1 de 15"
        /(\d+)\s*of\s*(\d+)/i,  // English: "1 of 15"
        /(\d+)\s*\/\s*(\d+)/i   // Alternative: "1/15"
      ];
      
      for (const pattern of patterns) {
        const match = progressText.match(pattern);
        if (match) {
          const current = parseInt(match[1], 10);
          const total = parseInt(match[2], 10);
          console.log('[IframeBulkProcessor] Parsed progress:', { current, total });
          return { current, total };
        }
      }
      
      console.log('[IframeBulkProcessor] Could not parse progress from:', progressText);
      return null;
    } catch (error) {
      console.error('[IframeBulkProcessor] Error extracting progress:', error);
      return null;
    }
  }

  /**
   * Extract current review data
   */
  private extractReviewData(): ReviewData {
    const reviewerNameElement = document.querySelector('.N0c6q.JhRJje');
    const reviewerName = reviewerNameElement?.textContent?.trim() || null;

    const ratingElement = document.querySelector('.DYizzd[aria-label][role="img"]');
    const rating = ratingElement?.getAttribute('aria-label') || null;

    const contentElement = document.querySelector('.gyKkFe.JhRJje.Fv38Af');
    const reviewContent = contentElement?.textContent?.trim() || null;

    return { reviewerName, rating, reviewContent };
  }

  /**
   * Parse rating string to numeric value
   */
  private parseRating(ratingString: string | null): number {
    if (!ratingString) return 5;
    
    const patterns = [
      /(\d+)\s*de\s*5/i,
      /(\d+)\s*out\s*of\s*5/i,
      /(\d+)\/5/i,
      /(\d+)\s*star/i,
      /(\d+)/
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
    
    return 5;
  }

  /**
   * Check if current review matches processing criteria
   */
  private shouldProcessCurrentReview(reviewData: ReviewData): boolean {
    const numericRating = this.parseRating(reviewData.rating);
    
    if (this.state.mode === 'positive') {
      return numericRating >= 4; // 4-5 star reviews only
    } else {
      return true; // Process all reviews in full mode
    }
  }

  /**
   * Start bulk processing
   */
  public async startBulkProcessing(mode: 'positive' | 'full'): Promise<boolean> {
    console.log('[IframeBulkProcessor] 🚀 Starting bulk processing in mode:', mode);

    // Check authentication
    if (!await this.checkAuthentication()) {
      this.showNotification('Please sign in to use bulk processing', 'error');
      return false;
    }

    // Check trust mode settings
    const trustModeKey = mode === 'positive' ? 'bulkPositive' : 'bulkFull';
    if (!this.settings?.trustModes[trustModeKey]) {
      const modeName = mode === 'positive' ? 'Positive Trust Mode' : 'Full Trust Mode';
      this.showNotification(`Please enable ${modeName} in settings first!`, 'error');
      return false;
    }

    // Get initial progress
    const progressInfo = this.extractProgressInfo();
    if (!progressInfo) {
      this.showNotification('Could not detect review progress. Please try again.', 'error');
      return false;
    }

    // Confirm bulk processing with custom modal (iframe-safe)
    const modeText = mode === 'positive' ? 'positive (4-5 star)' : 'all';
    const shouldProceed = await this.showConfirmationModal(
      `Start bulk processing of ${modeText} reviews?`,
      `Found ${progressInfo.total} total reviews. Currently on review ${progressInfo.current}.`
    );
    
    if (!shouldProceed) {
      return false;
    }

    // Initialize state
    this.state = {
      isActive: true,
      mode,
      totalReviews: progressInfo.total,
      currentReview: progressInfo.current,
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      startTime: Date.now()
    };

    // Show bulk controls
    this.showBulkControls();
    
    // Start processing
    this.processCurrentReview();
    
    return true;
  }

  /**
   * Process the current review
   */
  private async processCurrentReview(): Promise<void> {
    if (!this.state.isActive) return;

    console.log('[IframeBulkProcessor] 🔍 Processing current review...');
    
    // Update progress display
    this.updateProgressDisplay();

    // Extract current review data
    const reviewData = this.extractReviewData();
    console.log('[IframeBulkProcessor] Current review data:', reviewData);

    // Check if we should process this review
    if (!this.shouldProcessCurrentReview(reviewData)) {
      console.log('[IframeBulkProcessor] ⏭️ Skipping review (does not match criteria)');
      this.state.skippedCount++;
      this.waitForNextReview();
      return;
    }

    // Check if review already has a response (look for response textarea)
    const textarea = document.querySelector('textarea[jsname="YPqjbf"]') as HTMLTextAreaElement;
    if (textarea && textarea.value.trim().length > 0) {
      console.log('[IframeBulkProcessor] ⏭️ Skipping review (already has response)');
      this.state.skippedCount++;
      this.waitForNextReview();
      return;
    }

    try {
      // Generate AI response
      const numericRating = this.parseRating(reviewData.rating);
      const backgroundRequestData = {
        reviewData: {
          id: `bulk-review-${Date.now()}`,
          reviewer: reviewData.reviewerName || 'Anonymous',
          rating: numericRating,
          text: reviewData.reviewContent || `${numericRating}-star review without text`
        }
      };

      console.log('[IframeBulkProcessor] 📤 Generating AI response...');
      
      chrome.runtime.sendMessage(
        {
          type: 'GENERATE_RESPONSE',
          ...backgroundRequestData
        },
        async (response: BackgroundResponse) => {
          if (!this.state.isActive) return; // Check if still active

          if (chrome.runtime.lastError || !response || !response.success) {
            console.error('[IframeBulkProcessor] ❌ Error generating response:', response?.error);
            this.state.errorCount++;
            this.waitForNextReview();
            return;
          }

          // Fill and submit response
          await this.fillAndSubmitResponse(response.data!.responseText);
        }
      );

    } catch (error) {
      console.error('[IframeBulkProcessor] ❌ Error processing review:', error);
      this.state.errorCount++;
      this.waitForNextReview();
    }
  }

  /**
   * Fill textarea and submit response
   */
  private async fillAndSubmitResponse(responseText: string): Promise<void> {
    try {
      // Fill textarea
      const textarea = document.querySelector('textarea[jsname="YPqjbf"]') as HTMLTextAreaElement;
      if (!textarea) {
        console.error('[IframeBulkProcessor] ❌ Textarea not found');
        this.state.errorCount++;
        this.waitForNextReview();
        return;
      }

      textarea.value = responseText;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      console.log('[IframeBulkProcessor] ✅ Response filled, submitting...');

      // Wait a moment then submit
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Find and click submit button
      const submitButtonContainer = document.querySelector('div.VfPpkd-RLmnJb');
      let submitButton: HTMLElement | null = null;

      if (submitButtonContainer) {
        submitButton = submitButtonContainer.closest('button') as HTMLElement;
      }

      if (!submitButton) {
        submitButton = document.querySelector('button[jsname="hrGhad"]') as HTMLElement;
      }

      if (submitButton) {
        submitButton.click();
        console.log('[IframeBulkProcessor] ✅ Response submitted, waiting for next review...');
        this.state.processedCount++;
        
        // Wait for iframe to update with next review
        this.waitForIframeUpdate();
      } else {
        console.error('[IframeBulkProcessor] ❌ Submit button not found');
        this.state.errorCount++;
        this.waitForNextReview();
      }

    } catch (error) {
      console.error('[IframeBulkProcessor] ❌ Error filling/submitting response:', error);
      this.state.errorCount++;
      this.waitForNextReview();
    }
  }

  /**
   * Wait for iframe to update with next review
   */
  private waitForIframeUpdate(): void {
    console.log('[IframeBulkProcessor] ⏳ Waiting for iframe to update...');

    let updateDetected = false;
    const maxWaitTime = 10000; // 10 seconds max wait

    // Set up observer to detect iframe content changes
    if (this.iframeObserver) {
      this.iframeObserver.disconnect();
    }

    this.iframeObserver = new MutationObserver((_mutations) => {
      if (updateDetected || !this.state.isActive) return;

      // Check if progress indicator changed (indicating new review loaded)
      const currentProgress = this.extractProgressInfo();
      if (currentProgress && currentProgress.current !== this.state.currentReview) {
        updateDetected = true;
        this.state.currentReview = currentProgress.current;
        
        console.log('[IframeBulkProcessor] 🔄 Iframe updated, new review detected');
        
        if (this.iframeObserver) {
          this.iframeObserver.disconnect();
        }

        // Continue processing after a short delay
        setTimeout(() => {
          if (this.state.isActive) {
            this.processCurrentReview();
          }
        }, 2000);
      }
    });

    this.iframeObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Timeout fallback
    setTimeout(() => {
      if (!updateDetected && this.state.isActive) {
        console.log('[IframeBulkProcessor] ⏰ Timeout waiting for iframe update');
        if (this.iframeObserver) {
          this.iframeObserver.disconnect();
        }
        this.checkIfProcessingComplete();
      }
    }, maxWaitTime);
  }

  /**
   * Wait for next review (when skipping)
   */
  private waitForNextReview(): void {
    // For skipped reviews, we need to manually navigate or wait
    // This is a placeholder - in practice, user might need to manually navigate
    setTimeout(() => {
      if (this.state.isActive) {
        this.checkIfProcessingComplete();
      }
    }, 3000);
  }

  /**
   * Check if bulk processing is complete
   */
  private checkIfProcessingComplete(): void {
    const currentProgress = this.extractProgressInfo();
    
    if (!currentProgress || currentProgress.current >= currentProgress.total) {
      // Reached end of reviews
      this.completeBulkProcessing();
    } else if (this.state.processedCount + this.state.skippedCount + this.state.errorCount > 20) {
      // Safety limit reached
      this.showNotification('Bulk processing paused after 20 attempts. Click continue to resume.', 'info');
      this.state.isActive = false;
    } else {
      // Continue processing
      this.processCurrentReview();
    }
  }

  /**
   * Complete bulk processing
   */
  private completeBulkProcessing(): void {
    const duration = Math.round((Date.now() - this.state.startTime) / 1000);
    
    console.log('[IframeBulkProcessor] 🎉 Bulk processing completed:', this.state);
    
    // Show completion modal instead of alert (iframe-safe)
    this.showCompletionModal(duration);
    
    this.stopBulkProcessing();
  }

  /**
   * Stop bulk processing
   */
  public stopBulkProcessing(): void {
    console.log('[IframeBulkProcessor] 🛑 Stopping bulk processing');
    
    this.state.isActive = false;
    
    if (this.iframeObserver) {
      this.iframeObserver.disconnect();
      this.iframeObserver = null;
    }
    
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }
    
    this.hideBulkControls();
    this.showNotification('Bulk processing stopped', 'info');
  }

  /**
   * Show bulk processing controls
   */
  private showBulkControls(): void {
    if (this.bulkControlsElement) {
      this.hideBulkControls();
    }

    this.bulkControlsElement = document.createElement('div');
    this.bulkControlsElement.className = 'iframe-bulk-controls';
    this.bulkControlsElement.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 10002;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
      min-width: 280px;
    `;

    const title = document.createElement('h3');
    title.textContent = '🚀 Bulk Processing Active';
    title.style.cssText = 'margin: 0 0 12px 0; font-size: 16px; font-weight: 600;';

    const progressDiv = document.createElement('div');
    progressDiv.className = 'bulk-progress';
    progressDiv.style.cssText = 'margin-bottom: 12px; font-size: 14px;';

    const stopButton = document.createElement('button');
    stopButton.textContent = '⏹️ Stop Processing';
    stopButton.style.cssText = `
      width: 100%;
      padding: 8px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    `;
    stopButton.onclick = () => this.stopBulkProcessing();

    this.bulkControlsElement.appendChild(title);
    this.bulkControlsElement.appendChild(progressDiv);
    this.bulkControlsElement.appendChild(stopButton);

    document.body.appendChild(this.bulkControlsElement);
    this.updateProgressDisplay();
  }

  /**
   * Update progress display
   */
  private updateProgressDisplay(): void {
    if (!this.bulkControlsElement) return;

    const progressDiv = this.bulkControlsElement.querySelector('.bulk-progress');
    if (!progressDiv) return;

    const modeText = this.state.mode === 'positive' ? 'Positive (4-5★)' : 'All Reviews';
    progressDiv.innerHTML = `
      <div><strong>Mode:</strong> ${modeText}</div>
      <div><strong>Current:</strong> ${this.state.currentReview} / ${this.state.totalReviews}</div>
      <div><strong>Processed:</strong> ${this.state.processedCount}</div>
      <div><strong>Skipped:</strong> ${this.state.skippedCount}</div>
      <div><strong>Errors:</strong> ${this.state.errorCount}</div>
    `;
  }

  /**
   * Hide bulk processing controls
   */
  private hideBulkControls(): void {
    if (this.bulkControlsElement && this.bulkControlsElement.parentNode) {
      this.bulkControlsElement.parentNode.removeChild(this.bulkControlsElement);
      this.bulkControlsElement = null;
    }
  }

  /**
   * Check authentication
   */
  private async checkAuthentication(): Promise<boolean> {
    if (!chrome.runtime?.id) return false;
    try {
      const result = await chrome.storage.local.get(['authUser']);
      return !!result.authUser;
    } catch (error) {
      return false;
    }
  }

  /**
   * Show custom confirmation modal (iframe-safe)
   */
  private showConfirmationModal(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10003;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      // Create modal content
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        color: #333;
      `;

      const titleElement = document.createElement('h3');
      titleElement.textContent = title;
      titleElement.style.cssText = 'margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #1f2937;';

      const messageElement = document.createElement('p');
      messageElement.textContent = message;
      messageElement.style.cssText = 'margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; color: #6b7280;';

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end;';

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.style.cssText = `
        padding: 8px 16px;
        border: 1px solid #d1d5db;
        background: white;
        color: #374151;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      `;

      const confirmButton = document.createElement('button');
      confirmButton.textContent = 'Start Processing';
      confirmButton.style.cssText = `
        padding: 8px 16px;
        border: none;
        background: #4f46e5;
        color: white;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      `;

      // Event handlers
      const cleanup = () => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      };

      cancelButton.onclick = () => {
        cleanup();
        resolve(false);
      };

      confirmButton.onclick = () => {
        cleanup();
        resolve(true);
      };

      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      };

      // Assemble modal
      buttonContainer.appendChild(cancelButton);
      buttonContainer.appendChild(confirmButton);
      modal.appendChild(titleElement);
      modal.appendChild(messageElement);
      modal.appendChild(buttonContainer);
      overlay.appendChild(modal);

      // Show modal
      document.body.appendChild(overlay);
      
      // Focus confirm button
      setTimeout(() => confirmButton.focus(), 100);
    });
  }

  /**
   * Show completion modal (iframe-safe)
   */
  private showCompletionModal(duration: number): void {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10003;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      color: #333;
    `;

    const titleElement = document.createElement('h3');
    titleElement.innerHTML = '🎉 Bulk Processing Completed!';
    titleElement.style.cssText = 'margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #059669; text-align: center;';

    const statsContainer = document.createElement('div');
    statsContainer.style.cssText = 'margin-bottom: 20px;';

    const stats = [
      { label: 'Processed', value: this.state.processedCount, color: '#059669' },
      { label: 'Skipped', value: this.state.skippedCount, color: '#d97706' },
      { label: 'Errors', value: this.state.errorCount, color: '#dc2626' },
      { label: 'Duration', value: `${duration}s`, color: '#4f46e5' }
    ];

    stats.forEach(stat => {
      const statRow = document.createElement('div');
      statRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;';
      
      const label = document.createElement('span');
      label.textContent = `${stat.label}:`;
      label.style.cssText = 'color: #6b7280;';
      
      const value = document.createElement('span');
      value.textContent = String(stat.value);
      value.style.cssText = `color: ${stat.color}; font-weight: 600;`;
      
      statRow.appendChild(label);
      statRow.appendChild(value);
      statsContainer.appendChild(statRow);
    });

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.cssText = `
      width: 100%;
      padding: 10px;
      border: none;
      background: #4f46e5;
      color: white;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    `;

    // Event handlers
    const cleanup = () => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    };

    closeButton.onclick = cleanup;
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
      }
    };

    // Assemble modal
    modal.appendChild(titleElement);
    modal.appendChild(statsContainer);
    modal.appendChild(closeButton);
    overlay.appendChild(modal);

    // Show modal
    document.body.appendChild(overlay);
    
    // Focus close button
    setTimeout(() => closeButton.focus(), 100);
    
    // Also show success notification
    this.showNotification('Bulk processing completed!', 'success');
  }

  /**
   * Show notification
   */
  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
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
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 4000);
  }

  /**
   * Get current state
   */
  public getState(): BulkProcessingState {
    return { ...this.state };
  }

  /**
   * Destroy processor
   */
  public destroy(): void {
    this.stopBulkProcessing();
    console.log('[IframeBulkProcessor] Destroyed');
  }
}

// Export singleton instance
export const iframeBulkProcessor = new IframeBulkProcessor(); 