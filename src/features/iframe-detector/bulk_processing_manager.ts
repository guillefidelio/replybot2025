/**
 * Bulk Processing Manager for iframe view
 * Handles bulk operations and trust mode integration
 * Note: Iframe view is primarily for single reviews, but this provides
 * foundation for future bulk features and trust mode management
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

interface BulkProcessingState {
  isActive: boolean;
  totalReviews: number;
  processedReviews: number;
  successCount: number;
  errorCount: number;
  mode: 'positive' | 'full' | 'individual';
}

class BulkProcessingManager {
  private state: BulkProcessingState = {
    isActive: false,
    totalReviews: 0,
    processedReviews: 0,
    successCount: 0,
    errorCount: 0,
    mode: 'individual'
  };

  private settings: ExtensionSettings | null = null;

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
      console.log('[BulkProcessingManager] Settings loaded:', this.settings);
    } catch (error) {
      console.error('[BulkProcessingManager] Error loading settings:', error);
      this.settings = {
        trustModes: { individual: false, bulkPositive: false, bulkFull: false },
        rateLimit: 15000,
        maxPages: 3
      };
    }
  }

  /**
   * Set up listener for authentication state changes
   */
  private setupAuthListener(): void {
    if (!chrome.runtime?.id) return;
    
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.authUser) {
        const wasAuthenticated = !!changes.authUser.oldValue;
        const isAuthenticated = !!changes.authUser.newValue;
        
        if (wasAuthenticated && !isAuthenticated) {
          // User logged out - stop any bulk processing
          this.stopBulkProcessing();
          console.log('[BulkProcessingManager] User logged out - stopped bulk processing');
        }
      }
      
      // Reload settings when they change
      if (namespace === 'local' && changes.settings) {
        this.loadSettings();
      }
    });
  }

  /**
   * Check if a specific trust mode is enabled
   */
  public isTrustModeEnabled(mode: 'individual' | 'bulkPositive' | 'bulkFull'): boolean {
    return this.settings?.trustModes[mode] || false;
  }

  /**
   * Get current rate limit setting
   */
  public getRateLimit(): number {
    return this.settings?.rateLimit || 15000;
  }

  /**
   * Check if user is authenticated
   */
  private async checkAuthentication(): Promise<boolean> {
    if (!chrome.runtime?.id) return false;
    try {
      const result = await chrome.storage.local.get(['authUser']);
      return !!result.authUser;
    } catch (error) {
      console.error('[BulkProcessingManager] Error checking authentication:', error);
      return false;
    }
  }

  /**
   * Start bulk processing (placeholder for future implementation)
   * Currently iframe view handles single reviews, but this provides foundation
   */
  public async startBulkProcessing(mode: 'positive' | 'full'): Promise<boolean> {
    console.log('[BulkProcessingManager] 🚀 Bulk processing requested for mode:', mode);
    
    // Check authentication
    const isAuthenticated = await this.checkAuthentication();
    if (!isAuthenticated) {
      console.log('[BulkProcessingManager] 🚫 User not authenticated - cannot start bulk processing');
      this.showNotification('Please sign in to use bulk processing features', 'error');
      return false;
    }

    // Check if appropriate trust mode is enabled
    const trustModeKey = mode === 'positive' ? 'bulkPositive' : 'bulkFull';
    if (!this.isTrustModeEnabled(trustModeKey)) {
      const modeName = mode === 'positive' ? 'Positive Trust Mode' : 'Full Trust Mode';
      this.showNotification(`Please enable ${modeName} in settings first!`, 'error');
      return false;
    }

    // For iframe view (single review), we don't actually do bulk processing
    // But we can show a message about the trust mode being active
    this.showNotification(`${mode === 'positive' ? 'Positive' : 'Full'} Trust Mode is active for individual reviews`, 'info');
    return true;
  }

  /**
   * Stop bulk processing
   */
  public stopBulkProcessing(): void {
    if (this.state.isActive) {
      this.state.isActive = false;
      console.log('[BulkProcessingManager] 🛑 Bulk processing stopped');
      this.showNotification('Bulk processing stopped', 'info');
    }
  }

  /**
   * Get current processing state
   */
  public getState(): BulkProcessingState {
    return { ...this.state };
  }

  /**
   * Update processing progress (for future bulk implementations)
   */
  public updateProgress(processed: number, total: number, success: boolean): void {
    this.state.processedReviews = processed;
    this.state.totalReviews = total;
    
    if (success) {
      this.state.successCount++;
    } else {
      this.state.errorCount++;
    }

    console.log('[BulkProcessingManager] Progress updated:', {
      processed,
      total,
      success: this.state.successCount,
      errors: this.state.errorCount
    });
  }

  /**
   * Show notification to user
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
      animation: slideIn 0.3s ease-out;
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

  /**
   * Destroy the manager and clean up
   */
  public destroy(): void {
    this.stopBulkProcessing();
    console.log('[BulkProcessingManager] Destroyed');
  }
}

// Export singleton instance
export const bulkProcessingManager = new BulkProcessingManager(); 