// Chrome extension content script for Google My Business review pages
// Detects reviews and injects "Respond with AI" buttons

interface ReviewData {
  id: string;
  reviewer: string;
  rating: number;
  text: string;
  hasResponse: boolean;
  element: HTMLElement;
}

interface ExtensionSettings {
  trustModes: {
    individual: boolean;
    bulkPositive: boolean;
    bulkFull: boolean;
  };
  rateLimit: number;
  maxPages: number;
}

class ReviewDetector {
  private observer: MutationObserver | null = null;
  private processedReviews = new Set<string>();
  private settings: ExtensionSettings | null = null;
  private isProcessingBulk = false;

  constructor() {
    this.loadSettings();
    this.init();
    this.setupAuthListener();
  }

  private async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      this.settings = result.settings || {
        trustModes: { individual: false, bulkPositive: false, bulkFull: false },
        rateLimit: 15,
        maxPages: 3
      };
    } catch (error) {
      console.error('Error loading settings:', error);
      this.settings = {
        trustModes: { individual: false, bulkPositive: false, bulkFull: false },
        rateLimit: 15,
        maxPages: 3
      };
    }
  }

  private async checkAuthentication(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(['authUser']);
      const isAuthenticated = !!result.authUser;
      console.log('Authentication check:', isAuthenticated ? 'User authenticated' : 'User not authenticated');
      return isAuthenticated;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }

  private setupAuthListener() {
    // Listen for changes in authentication state
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.authUser) {
        const wasAuthenticated = !!changes.authUser.oldValue;
        const isAuthenticated = !!changes.authUser.newValue;
        
        console.log('Auth state changed:', { wasAuthenticated, isAuthenticated });
        
        if (wasAuthenticated && !isAuthenticated) {
          // User logged out - remove all AI buttons and bulk controls
          this.removeAllAIButtons();
          this.removeBulkControls();
          console.log('User logged out - removed all AI buttons and bulk controls');
        } else if (!wasAuthenticated && isAuthenticated) {
          // User logged in - rescan for reviews and add bulk controls
          console.log('User logged in - rescanning for reviews and adding bulk controls');
          setTimeout(() => {
            this.scanForReviews();
            this.addBulkProcessingControls();
          }, 1000);
        }
      }
    });
  }

  private removeAllAIButtons() {
    const aiButtons = document.querySelectorAll('.ai-response-button');
    aiButtons.forEach(button => {
      button.remove();
    });
    console.log(`Removed ${aiButtons.length} AI buttons`);
  }

  private removeBulkControls() {
    const bulkControls = document.querySelector('.bulk-processing-controls');
    if (bulkControls) {
      bulkControls.remove();
      console.log('Removed bulk processing controls');
    }
  }

  private init() {
    // Check if we're on a GMB review page
    if (!this.isGMBReviewPage()) {
      return;
    }

    console.log('AI Review Responder initialized on GMB review page');

    // Initial scan with delay to allow page to load
    setTimeout(() => this.scanForReviews(), 2000);

    // Set up observer for dynamically loaded content
    this.setupObserver();

    // Add bulk processing controls
    setTimeout(async () => await this.addBulkProcessingControls(), 3000);
  }

  private isGMBReviewPage(): boolean {
    const url = window.location.href;
    return url.includes('business.google.com/reviews') || 
           (url.includes('business.google.com/groups/') && url.includes('/reviews'));
  }

  private setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      
      mutations.forEach((mutation) => {
        // Check if new review elements were added - using previous working selector
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            if (element.matches('.GYpYWe') || element.querySelector('.GYpYWe')) {
              shouldScan = true;
            }
          }
        });
      });

      if (shouldScan) {
        setTimeout(() => this.scanForReviews(), 500);
      }
    });

    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private scanForReviews() {
    console.log('Scanning for reviews...');
    
    // First check if we're on the correct reviews page
    const reviewsContainer = document.querySelector('.uT1ck');
    if (!reviewsContainer) {
      console.log('Reviews container not found - may not be on reviews page yet');
      return;
    }
    
    // Use previous working selector for finding review elements
    const reviewElements = document.querySelectorAll('.GYpYWe');
    
    console.log(`Found ${reviewElements.length} review elements`);
    
    reviewElements.forEach((reviewElement, index) => {
      const reviewData = this.extractReviewData(reviewElement as HTMLElement, index);
      if (reviewData && !this.processedReviews.has(reviewData.id)) {
        this.processedReviews.add(reviewData.id);
        this.injectAIButton(reviewData);
      }
    });
  }

  private extractReviewData(reviewElement: HTMLElement, index: number): ReviewData | null {
    try {
      // Check if review already has a response using actual selector: .Rhj72c .BNyFuc
      const hasResponse = reviewElement.querySelector('.Rhj72c .BNyFuc') !== null;

      // Extract reviewer name using actual selector: .XnNQm .k4kupc span a
      const nameElement = reviewElement.querySelector('.XnNQm .k4kupc span a');
      const reviewer = nameElement?.textContent?.trim() || 'Anonymous';

      // Extract rating using actual selector: .XnNQm .k4kupc > div > div
      const ratingContainer = reviewElement.querySelector('.XnNQm .k4kupc > div > div');
      const rating = this.extractRating(ratingContainer as HTMLElement);

      // Extract review content using actual selector: .XnNQm .k4kupc blockquote span
      const contentElement = reviewElement.querySelector('.XnNQm .k4kupc blockquote span');
      const text = contentElement?.textContent?.trim() || '';

      // Generate unique ID based on content and name
      const id = `review-${reviewer.replace(/\s+/g, '')}-${text.substring(0, 20).replace(/\s+/g, '')}-${index}`;

      console.log(`Extracted review data: ${reviewer}, ${rating} stars, hasResponse: ${hasResponse}`);

      return {
        id,
        reviewer,
        rating,
        text,
        hasResponse,
        element: reviewElement
      };
    } catch (error) {
      console.error('Error extracting review data:', error);
      return null;
    }
  }

  private extractRating(ratingContainer: HTMLElement): number {
    if (!ratingContainer) return 0;
    
    // Try to find aria-label on the rating container first
    const ariaLabel = ratingContainer.getAttribute('aria-label');
    if (ariaLabel) {
      const match = ariaLabel.match(/(\d+)\s*star/i);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    // Count filled stars using the actual class structure
    // Filled stars have class 'z3FsAc', empty stars have class 'l4gDZe'
    const filledStars = ratingContainer.querySelectorAll('.DPvwYc.L12a3c.z3FsAc');
    if (filledStars.length > 0) {
      console.log(`Found ${filledStars.length} filled stars`);
      return filledStars.length;
    }

    // Fallback: count all star elements and check their classes
    const allStars = ratingContainer.querySelectorAll('.DPvwYc.L12a3c');
    let rating = 0;
    allStars.forEach((star) => {
      // Check if this star is filled (has z3FsAc class)
      if (star.classList.contains('z3FsAc')) {
        rating++;
      }
    });

    if (rating > 0) {
      console.log(`Counted ${rating} filled stars from ${allStars.length} total stars`);
      return rating;
    }

    // Last fallback: check for numeric text in the container
    const starText = ratingContainer.textContent || '';
    const starMatch = starText.match(/(\d+)/);
    if (starMatch) {
      const rating = parseInt(starMatch[1], 10);
      if (rating >= 1 && rating <= 5) {
        console.log(`Extracted rating ${rating} from text: ${starText}`);
        return rating;
      }
    }

    console.warn('Could not determine rating, defaulting to 5');
    return 5; // Default to 5 if we can't determine
  }

  private async injectAIButton(reviewData: ReviewData) {
    // Don't inject button if review already has a response
    if (reviewData.hasResponse) {
      console.log(`Skipping review ${reviewData.id} - already has response`);
      return;
    }

    // Check if user is authenticated before injecting buttons
    const isAuthenticated = await this.checkAuthentication();
    if (!isAuthenticated) {
      console.log(`Skipping review ${reviewData.id} - user not authenticated`);
      return;
    }

    // Find the original reply button using the previous working selector
    const originalReplyButton = reviewData.element.querySelector('button[jsname="rhPddf"]');
    if (!originalReplyButton) {
      console.log(`No reply button found for review ${reviewData.id}`);
      return;
    }

    // Check if AI button already exists
    if (reviewData.element.querySelector('.ai-response-button')) {
      return;
    }

    // Create AI response button
    const aiButton = this.createAIButton(reviewData);
    
    // Insert the AI button next to the original reply button (previous working approach)
    if (originalReplyButton.parentNode) {
      originalReplyButton.parentNode.insertBefore(aiButton, originalReplyButton.nextSibling);
    }

    console.log(`AI button injected for review ${reviewData.id}`);
  }

  private createAIButton(reviewData: ReviewData): HTMLElement {
    const button = document.createElement('button');
    button.className = 'ai-response-button';
    button.style.cssText = `
      margin-left: 8px;
      background-color: #1a73e8;
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      padding: 10px 16px;
      transition: background-color 0.2s;
      z-index: 10000;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
    `;

    const icon = document.createElement('span');
    icon.textContent = '🤖';
    
    const text = document.createElement('span');
    text.textContent = 'Respond with AI';

    button.appendChild(icon);
    button.appendChild(text);

    // Add hover effect
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#1557b0';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#1a73e8';
    });

    // Add click handler
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleAIButtonClick(reviewData, button);
    });

    return button;
  }

  private async handleAIButtonClick(reviewData: ReviewData, button: HTMLElement) {
    console.log('AI button clicked for review:', reviewData.id);
    console.log('Review data being sent:', reviewData);
    
    // Update button state to loading
    const textSpan = button.querySelector('span:last-child');
    const iconSpan = button.querySelector('span:first-child');
    
    if (textSpan && iconSpan) {
      iconSpan.textContent = '⏳';
      textSpan.textContent = 'Generating...';
    }
    button.setAttribute('disabled', 'true');
    button.style.opacity = '0.7';

    try {
      // Use new generateAIResponse function
      const aiReview: OpenAIReview = {
        author: reviewData.reviewer,
        score: reviewData.rating,
        content: reviewData.text
      };
      const response = await generateAIResponse(aiReview);
      log('Background script response:', response);
      if (!response.success) {
        throw new Error(response.error);
      }
      const responseText = response.data.responseText;
      console.log('Generated AI response:', responseText);
      
      // Check if trust mode is enabled
      const trustModeEnabled = this.settings?.trustModes?.individual || false;
      
      if (trustModeEnabled) {
        // Trust mode: auto-fill and auto-submit
        await this.fillResponseAndSubmit(reviewData, responseText, true);
        this.showNotification('AI response generated and posted automatically!', 'success');
      } else {
        // Preview mode: just fill the response for user review
        await this.fillResponseAndSubmit(reviewData, responseText, false);
        this.showNotification('AI response generated! Please review and post manually.', 'info');
      }
    } catch (error) {
      console.error('Error generating AI response:', error);
      this.showNotification('Error generating AI response. Please try again.', 'error');
    } finally {
      // Reset button state
      if (textSpan && iconSpan) {
        iconSpan.textContent = '🤖';
        textSpan.textContent = 'Respond with AI';
      }
      button.removeAttribute('disabled');
      button.style.opacity = '1';
    }
  }

  private async fillResponseAndSubmit(reviewData: ReviewData, responseText: string, autoSubmit = false) {
    try {
      console.log('Filling response for review:', reviewData.id);
      
      // First, click the reply button to open the response interface
      const replyButton = reviewData.element.querySelector('button[aria-label="Reply"]') || 
                         reviewData.element.querySelector('button[jsname="rhPddf"]');
      
      if (replyButton) {
        (replyButton as HTMLElement).click();
        console.log('Reply button clicked for review:', reviewData.id);
        
        // Wait for the response interface to appear
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to find the textarea within the specific review element first
        let responseTextarea = reviewData.element.querySelector('.WTNfzf .MKv3Ve div[contenteditable="true"]') ||
                              reviewData.element.querySelector('.WTNfzf .MKv3Ve textarea') ||
                              reviewData.element.querySelector('.WTNfzf textarea') ||
                              reviewData.element.querySelector('[contenteditable="true"]');
        
        // If not found within the review element, look for the most recently opened one
        if (!responseTextarea) {
          console.log('Textarea not found within review element, searching globally...');
          
          // Get all possible textareas and find the one that's visible and not already filled
          const allTextareas = document.querySelectorAll('.WTNfzf .MKv3Ve div[contenteditable="true"], .WTNfzf .MKv3Ve textarea, .WTNfzf textarea, [contenteditable="true"]');
          
          for (const textarea of allTextareas) {
            const element = textarea as HTMLElement;
            // Check if the textarea is visible and empty (or nearly empty)
            const rect = element.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            const isEmpty = element.textContent?.trim().length === 0 || 
                           (element as HTMLTextAreaElement).value?.trim().length === 0;
            
            if (isVisible && isEmpty) {
              responseTextarea = element;
              console.log('Found empty, visible textarea');
              break;
            }
          }
          
          // If still not found, use the last one (most recently opened)
          if (!responseTextarea && allTextareas.length > 0) {
            responseTextarea = allTextareas[allTextareas.length - 1] as HTMLElement;
            console.log('Using last available textarea');
          }
        }
        
        if (responseTextarea) {
          console.log('Found textarea, filling with response for review:', reviewData.id);
          
          // Fill the response
          if (responseTextarea.tagName === 'TEXTAREA') {
            (responseTextarea as HTMLTextAreaElement).value = responseText;
            responseTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            // For contenteditable div
            responseTextarea.textContent = responseText;
            responseTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          console.log('Response filled successfully for review:', reviewData.id);
          
          // Auto-submit if trust mode is enabled
          if (autoSubmit) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for UI to update
            
            // Use the specific selector provided by the user
            const submitButton = document.querySelector('#yDmH0d > c-wiz > div.J3lyQe.LXe1W.IpMi9 > div.Ld2ZLc > c-wiz > div > div.KkQJac > div.w9BB5b > div:nth-child(1) > div.GYpYWe > div > div > div.WTNfzf > div > div.SiZwV > button.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-k8QpJ.nCP5yc.AjY5Oe.DuMIQc.LQeN7 > div.VfPpkd-Jh9lGc') ||
                               document.querySelector('.SiZwV button') || 
                               document.querySelector('button[aria-label="Post"]') ||
                               document.querySelector('button[aria-label="Publicar respuesta"]');
            
            if (submitButton) {
              (submitButton as HTMLElement).click();
              console.log('Response submitted automatically for review:', reviewData.id);
            } else {
              console.warn('Submit button not found for auto-submission');
              this.showNotification('Response filled, but submit button not found. Please post manually.', 'info');
            }
          }
          
        } else {
          console.warn('Could not find response textarea for review:', reviewData.id);
          this.showNotification('Response generated but could not be auto-filled. Please copy and paste manually.', 'info');
        }
      } else {
        console.warn('Could not find reply button for review:', reviewData.id);
      }
    } catch (error) {
      console.error('Error filling response for review:', reviewData.id, error);
    }
  }

  private showNotification(message: string, type: 'success' | 'error' | 'info') {
    // Create notification element
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
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      background-color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 4000);
  }

  private async addBulkProcessingControls() {
    // Check if controls already exist
    if (document.querySelector('.bulk-processing-controls')) {
      return;
    }

    // Check if user is authenticated before showing bulk controls
    const isAuthenticated = await this.checkAuthentication();
    if (!isAuthenticated) {
      console.log('Skipping bulk controls - user not authenticated');
      return;
    }

    // Create bulk processing controls container
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'bulk-processing-controls';
    controlsContainer.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      z-index: 10002;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      min-width: 250px;
    `;

    // Title
    const title = document.createElement('h3');
    title.textContent = '🚀 Bulk AI Responses';
    title.style.cssText = `
      color: white;
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 600;
    `;

    // Positive reviews button (4-5 stars)
    const positiveButton = document.createElement('button');
    positiveButton.textContent = '✨ Process Positive Reviews (4-5★)';
    positiveButton.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-bottom: 8px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    `;
    positiveButton.onmouseenter = () => { positiveButton.style.background = '#059669'; };
    positiveButton.onmouseleave = () => { positiveButton.style.background = '#10b981'; };

    // All reviews button
    const allButton = document.createElement('button');
    allButton.textContent = '🎯 Process All Reviews';
    allButton.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-bottom: 8px;
      background: #f59e0b;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    `;
    allButton.onmouseenter = () => { allButton.style.background = '#d97706'; };
    allButton.onmouseleave = () => { allButton.style.background = '#f59e0b'; };

    // Stop button
    const stopButton = document.createElement('button');
    stopButton.textContent = '⏹️ Stop Processing';
    stopButton.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-bottom: 12px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: none;
    `;
    stopButton.onmouseenter = () => { stopButton.style.background = '#dc2626'; };
    stopButton.onmouseleave = () => { stopButton.style.background = '#ef4444'; };

    // Page selector
    const pageSelector = document.createElement('div');
    pageSelector.style.cssText = `
      margin-bottom: 12px;
    `;
    
    const pageLabel = document.createElement('label');
    pageLabel.textContent = 'Pages to process:';
    pageLabel.style.cssText = `
      display: block;
      color: white;
      font-size: 12px;
      margin-bottom: 4px;
    `;
    
    const pageInput = document.createElement('select');
    pageInput.style.cssText = `
      width: 100%;
      padding: 6px;
      border-radius: 6px;
      border: none;
      background: rgba(255,255,255,0.9);
      font-size: 12px;
    `;
    
    // Add page options
    for (let i = 1; i <= 10; i++) {
      const option = document.createElement('option');
      option.value = i.toString();
      option.textContent = i === 1 ? '1 page (current)' : `${i} pages`;
      if (i === (this.settings?.maxPages || 3)) {
        option.selected = true;
      }
      pageInput.appendChild(option);
    }

    pageSelector.appendChild(pageLabel);
    pageSelector.appendChild(pageInput);

    // Progress display
    const progressDisplay = document.createElement('div');
    progressDisplay.style.cssText = `
      color: white;
      font-size: 12px;
      text-align: center;
      display: none;
    `;

    // Event handlers
    positiveButton.addEventListener('click', () => {
      const pages = parseInt(pageInput.value);
      this.startBulkProcessing('positive', pages);
    });
    allButton.addEventListener('click', () => {
      const pages = parseInt(pageInput.value);
      this.startBulkProcessing('all', pages);
    });
    stopButton.addEventListener('click', () => this.stopBulkProcessing());

    // Assemble the controls
    controlsContainer.appendChild(title);
    controlsContainer.appendChild(pageSelector);
    controlsContainer.appendChild(positiveButton);
    controlsContainer.appendChild(allButton);
    controlsContainer.appendChild(stopButton);
    controlsContainer.appendChild(progressDisplay);

    document.body.appendChild(controlsContainer);
  }

  private async startBulkProcessing(mode: 'positive' | 'all', maxPages = 1) {
    if (this.isProcessingBulk) {
      this.showNotification('Bulk processing already in progress!', 'info');
      return;
    }

    // Check if trust modes are enabled
    const trustModeEnabled = mode === 'positive' 
      ? this.settings?.trustModes?.bulkPositive 
      : this.settings?.trustModes?.bulkFull;

    if (!trustModeEnabled) {
      this.showNotification(`Please enable ${mode === 'positive' ? 'Positive Trust Mode' : 'Full Trust Mode'} in settings first!`, 'error');
      return;
    }

        // Confirm the action
    const confirmMessage = mode === 'positive' 
      ? `Process all 4-5 star reviews on ${maxPages} page(s) automatically?` 
      : `Process ALL unanswered reviews on ${maxPages} page(s) automatically?`;
    
    if (!confirm(confirmMessage + '\n\nThis will generate and post AI responses without your review.')) {
      return;
    }

    this.isProcessingBulk = true;
    this.updateBulkControls(true);

    let totalProcessed = 0;
    let currentPage = 1;

    // Process multiple pages
    while (currentPage <= maxPages && this.isProcessingBulk) {
      console.log(`Processing page ${currentPage}/${maxPages}`);
      this.updateProgress(currentPage, maxPages, 'page');

      // Get all unprocessed reviews on current page
      const reviewElements = document.querySelectorAll('.GYpYWe');
      const targetReviews: ReviewData[] = [];

      reviewElements.forEach((reviewElement, index) => {
        const reviewData = this.extractReviewData(reviewElement as HTMLElement, index);
        if (reviewData && !reviewData.hasResponse) {
          // Filter by rating if positive mode
          if (mode === 'positive' && reviewData.rating < 4) {
            return;
          }
          targetReviews.push(reviewData);
        }
      });

      if (targetReviews.length === 0) {
        console.log(`No reviews found on page ${currentPage}`);
      } else {
        this.showNotification(`Processing ${targetReviews.length} reviews on page ${currentPage}/${maxPages}...`, 'info');
        
        // Process reviews one by one with rate limiting
        for (let i = 0; i < targetReviews.length && this.isProcessingBulk; i++) {
          const review = targetReviews[i];
          this.updateProgress(i + 1, targetReviews.length, 'review', currentPage, maxPages);
          
          try {
            console.log(`Processing review ${i + 1}/${targetReviews.length} on page ${currentPage}:`, review.id);
            
            // Generate AI response
            const aiReview = {
              author: review.reviewer,
              score: review.rating,
              content: review.text
            };
            
            const response = await generateAIResponse(aiReview);
            if (!response.success) {
              throw new Error(response.error);
            }

            // Fill and submit response automatically
            await this.fillResponseAndSubmit(review, response.data.responseText, true);
            totalProcessed++;
            
            // Wait for rate limit (except for last review on last page)
            const isLastReviewOnLastPage = (i === targetReviews.length - 1) && (currentPage === maxPages);
            if (!isLastReviewOnLastPage) {
              const delayMs = this.settings?.rateLimit || 15000; // Default 15 seconds in milliseconds
              const delaySeconds = Math.round(delayMs / 1000);
              console.log(`Waiting ${delaySeconds} seconds before next review...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
          } catch (error) {
            console.error(`Error processing review ${review.id}:`, error);
            this.showNotification(`Error processing review: ${error}`, 'error');
          }
        }
      }

      // Move to next page if not the last page
      if (currentPage < maxPages && this.isProcessingBulk) {
        const nextPageSuccess = await this.navigateToNextPage();
        if (!nextPageSuccess) {
          console.log('No more pages available or navigation failed');
          break;
        }
        currentPage++;
        
        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        break;
      }
    }

    this.showNotification(`Bulk processing completed! Processed ${totalProcessed} reviews across ${currentPage} page(s).`, 'success');
    this.stopBulkProcessing();
  }

  private stopBulkProcessing() {
    this.isProcessingBulk = false;
    this.updateBulkControls(false);
    this.updateProgress(0, 0);
  }

  private updateBulkControls(isProcessing: boolean) {
    const controls = document.querySelector('.bulk-processing-controls');
    if (!controls) return;

    const positiveButton = controls.querySelector('button:nth-of-type(1)') as HTMLElement;
    const allButton = controls.querySelector('button:nth-of-type(2)') as HTMLElement;
    const stopButton = controls.querySelector('button:nth-of-type(3)') as HTMLElement;

    if (isProcessing) {
      positiveButton.style.display = 'none';
      allButton.style.display = 'none';
      stopButton.style.display = 'block';
    } else {
      positiveButton.style.display = 'block';
      allButton.style.display = 'block';
      stopButton.style.display = 'none';
    }
  }

  private updateProgress(current: number, total: number, type: 'page' | 'review' = 'review', currentPage?: number, maxPages?: number) {
    const controls = document.querySelector('.bulk-processing-controls');
    if (!controls) return;

    const progressDisplay = controls.querySelector('div:last-child') as HTMLElement;
    
    if (current === 0 && total === 0) {
      progressDisplay.style.display = 'none';
      progressDisplay.textContent = '';
    } else {
      progressDisplay.style.display = 'block';
      
      if (type === 'page') {
        progressDisplay.textContent = `Page: ${current}/${total}`;
      } else if (currentPage && maxPages) {
        progressDisplay.textContent = `Page ${currentPage}/${maxPages} - Review: ${current}/${total}`;
      } else {
        progressDisplay.textContent = `Processing: ${current}/${total}`;
      }
    }
  }

  private async navigateToNextPage(): Promise<boolean> {
    try {
      // Check if pagination exists
      const paginationContainer = document.querySelector('#yDmH0d > c-wiz > div.J3lyQe.LXe1W.IpMi9 > div.Ld2ZLc > c-wiz > div > div.KkQJac > div.yrbiod');
      if (!paginationContainer) {
        console.log('Pagination container not found');
        return false;
      }

      // Find the next page button
      const nextButton = document.querySelector('#yDmH0d > c-wiz > div.J3lyQe.LXe1W.IpMi9 > div.Ld2ZLc > c-wiz > div > div.KkQJac > div.yrbiod > div > div.q1OlHe > button.VfPpkd-Bz112c-LgbsSe.yHy1rc.eT1oJ.QDwDD.mN1ivc.vX5N7b') as HTMLElement;
      
      if (!nextButton) {
        console.log('Next page button not found');
        return false;
      }

      // Check if the button is disabled (no more pages)
      if (nextButton.hasAttribute('disabled') || nextButton.getAttribute('aria-disabled') === 'true') {
        console.log('Next page button is disabled - no more pages');
        return false;
      }

      console.log('Clicking next page button...');
      nextButton.click();
      
      // Wait a bit for the navigation to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
    } catch (error) {
      console.error('Error navigating to next page:', error);
      return false;
    }
  }

  public destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.processedReviews.clear();
  }
}

// Initialize the review detector
let reviewDetector: ReviewDetector | null = null;

// Function to initialize or reinitialize the detector
function initializeDetector() {
  if (reviewDetector) {
    reviewDetector.destroy();
  }
  reviewDetector = new ReviewDetector();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDetector);
} else {
  initializeDetector();
}

// Reinitialize on page visibility change (handles tab switching and page refresh)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && window.location.href.includes('business.google.com/reviews')) {
    // Small delay to ensure page is fully loaded
    setTimeout(() => {
      if (!reviewDetector || !chrome.runtime?.id) {
        console.log('Reinitializing review detector...');
        initializeDetector();
      }
    }, 1000);
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (reviewDetector) {
    reviewDetector.destroy();
  }
});

// Background response types
interface BackgroundResponseSuccess {
  success: true;
  data: { responseText: string; reviewId: string; rating: number };
}
interface BackgroundResponseError {
  success: false;
  error: string;
}
type BackgroundResponse = BackgroundResponseSuccess | BackgroundResponseError;

// Modify generateAIResponse return type
type GenerateResponsePromise = Promise<BackgroundResponse>;

// Update log utility type
const log = (message: string, data?: unknown) => {
  if (data !== undefined) {
    console.log(`[Content] ${message}`, data);
  } else {
    console.log(`[Content] ${message}`);
  }
};

// Type for review object sent to OpenAI
interface OpenAIReview {
  author: string;
  score: number;
  content: string;
}

// Helper to decide if review content is meaningful
const isMeaningfulContent = (text: string): boolean => {
  if (!text) return false;
  const placeholders = [
    'no escribió',
    'wrote no',
    'no opinion',
    'no review',
    'sin comentario',
    'without text',
    'solo dejó una calificación'
  ];
  const lower = text.toLowerCase();
  return !placeholders.some(p => lower.includes(p));
};

// Generate AI response using prompt selection and background messaging
const generateAIResponse = async (review: OpenAIReview): GenerateResponsePromise => {
  log('Generating AI response');
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['prompts',
      'positivePrompt5WithText',
      'positivePrompt5WithoutText',
      'positivePrompt4WithText',
      'positivePrompt4WithoutText',
      'neutralPrompt3WithText',
      'neutralPrompt3WithoutText',
      'negativePrompt1_2WithText',
      'negativePrompt1_2WithoutText'
    ], (result) => {
      log('Retrieved prompts from storage', result);
      let prompt: string | undefined;

      const textHasContent = isMeaningfulContent(review.content);

      // 1) Try individual keys first (user may have customised these via options page)
      if (!prompt) {
        if (review.score === 5) {
          prompt = textHasContent ? result.positivePrompt5WithText : result.positivePrompt5WithoutText;
        } else if (review.score === 4) {
          prompt = textHasContent ? result.positivePrompt4WithText : result.positivePrompt4WithoutText;
        } else if (review.score === 3) {
          prompt = textHasContent ? result.neutralPrompt3WithText : result.neutralPrompt3WithoutText;
        } else if (review.score <= 2) {
          prompt = textHasContent ? result.negativePrompt1_2WithText : result.negativePrompt1_2WithoutText;
        }
      }

      // 2) Fallback to unified prompts object if still not found
      if (!prompt) {
        const storedPrompts = (result.prompts || {}) as Record<string, string>;
        if (Object.keys(storedPrompts).length > 0) {
          const keyBase = review.score.toString();
          const variant = textHasContent ? 'text' : 'no_text';
          const altVariant = textHasContent ? 'text' : 'no_text';
          const possibleKeys = [`${keyBase}_${variant}`, `${keyBase}_${altVariant}`];
          for (const k of possibleKeys) {
            if (storedPrompts[k]) {
              prompt = storedPrompts[k];
              log('Found prompt in unified prompts object', { key: k, prompt });
              break;
            }
          }
        }
      }

      if (!prompt) {
        log('No matching prompt found, using default');
        prompt = 'Please provide a polite and helpful response to this review.';
      }

      log('Using prompt for AI response', { prompt, review });
      chrome.runtime.sendMessage(
        {
          action: 'generateResponse',
          review: {
            author: review.author,
            score: review.score,
            content: review.content || `[${review.score}-star review without text]`
          },
          prompt
        },
        (response) => {
          if (response && response.error) {
            log('Error generating AI response', response.error);
            reject(new Error(response.error));
          } else if (response) {
            log('AI response generated successfully');
            resolve(response as BackgroundResponse);
          } else {
            log('No response from background script');
            reject(new Error('No response from background script'));
          }
        }
      );
    });
  });
}; 