// DOM utility functions for Chrome extension content scripts
// Focused on Google My Business review page manipulation

export interface ElementSelector {
  selector: string;
  description: string;
}

export const GMB_SELECTORS = {
  // Review container selectors
  reviewsContainer: '.w9BB5b',
  reviewElement: '.w9BB5b > div.GYpYWe',
  
  // Review data selectors (relative to review element)
  reviewerName: '.XnNQm .k4kupc span a',
  rating: '.XnNQm .k4kupc > div > div',
  content: '.XnNQm .k4kupc blockquote span',
  
  // Action selectors
  responseButtonContainer: '.lGXsGc',
  responseButton: '.lGXsGc button',
  textArea: '.WTNfzf .MKv3Ve div',
  publishButton: '.SiZwV button.VfPpkd-LgbsSe',
  
  // State selectors
  alreadyResponded: '.Rhj72c .BNyFuc'
} as const;

/**
 * Safely query for an element with error handling
 */
export function safeQuerySelector(
  parent: Element | Document,
  selector: string
): HTMLElement | null {
  try {
    return parent.querySelector(selector) as HTMLElement;
  } catch (error) {
    console.warn(`Error querying selector "${selector}":`, error);
    return null;
  }
}

/**
 * Safely query for multiple elements with error handling
 */
export function safeQuerySelectorAll(
  parent: Element | Document,
  selector: string
): HTMLElement[] {
  try {
    return Array.from(parent.querySelectorAll(selector)) as HTMLElement[];
  } catch (error) {
    console.warn(`Error querying selector "${selector}":`, error);
    return [];
  }
}

/**
 * Check if an element exists in the DOM
 */
export function elementExists(
  parent: Element | Document,
  selector: string
): boolean {
  return safeQuerySelector(parent, selector) !== null;
}

/**
 * Wait for an element to appear in the DOM
 */
export function waitForElement(
  selector: string,
  parent: Element | Document = document,
  timeout: number = 5000
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element "${selector}" not found within ${timeout}ms`));
    }, timeout);

    // Check if element already exists
    const existingElement = safeQuerySelector(parent, selector);
    if (existingElement) {
      clearTimeout(timeoutId);
      resolve(existingElement);
      return;
    }

    // Set up observer to watch for the element
    const observer = new MutationObserver(() => {
      const element = safeQuerySelector(parent, selector);
      if (element) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(parent as Element, {
      childList: true,
      subtree: true
    });
  });
}

/**
 * Create a button element with Google's Material Design styling
 */
export function createGoogleStyleButton(
  text: string,
  icon?: string,
  variant: 'primary' | 'secondary' = 'primary'
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-k8QpJ nCP5yc AjY5Oe DuMIQc LQeN7';
  
  const baseStyles = `
    margin-left: 8px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    padding: 8px 16px;
    transition: background-color 0.2s;
    z-index: 10000;
    font-family: inherit;
  `;
  
  const variantStyles = variant === 'primary' 
    ? 'background-color: #1a73e8; color: white;'
    : 'background-color: #f8f9fa; color: #3c4043; border: 1px solid #dadce0;';
  
  button.style.cssText = baseStyles + variantStyles;

  const buttonContent = document.createElement('div');
  buttonContent.className = 'VfPpkd-Jh9lGc';
  buttonContent.textContent = icon ? `${icon} ${text}` : text;

  button.appendChild(buttonContent);

  // Add hover effects
  if (variant === 'primary') {
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#1557b0';
    });
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#1a73e8';
    });
  } else {
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#f1f3f4';
    });
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#f8f9fa';
    });
  }

  return button;
}

/**
 * Inject an element safely next to another element
 */
export function injectElementAfter(
  targetElement: HTMLElement,
  newElement: HTMLElement
): boolean {
  try {
    if (targetElement.parentNode) {
      targetElement.parentNode.insertBefore(newElement, targetElement.nextSibling);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error injecting element:', error);
    return false;
  }
}

/**
 * Remove an element safely from the DOM
 */
export function removeElement(element: HTMLElement): boolean {
  try {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error removing element:', error);
    return false;
  }
}

/**
 * Get text content safely from an element
 */
export function getTextContent(element: Element | null): string {
  if (!element) return '';
  try {
    return element.textContent?.trim() || '';
  } catch (error) {
    console.warn('Error getting text content:', error);
    return '';
  }
}

/**
 * Extract rating from various Google rating elements
 */
export function extractRatingFromElement(element: HTMLElement): number {
  if (!element) return 0;

  // Try aria-label first
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    const match = ariaLabel.match(/(\d+)\s*star/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // Try counting star images
  const stars = element.querySelectorAll('[role="img"]');
  let rating = 0;
  stars.forEach((star) => {
    const starLabel = star.getAttribute('aria-label') || '';
    if (starLabel.includes('star') && !starLabel.includes('empty')) {
      rating++;
    }
  });

  if (rating > 0) return rating;

  // Fallback: look for numeric content
  const textContent = getTextContent(element);
  const numericMatch = textContent.match(/(\d+)/);
  if (numericMatch) {
    const num = parseInt(numericMatch[1], 10);
    if (num >= 1 && num <= 5) {
      return num;
    }
  }

  return 5; // Default to 5 if unable to determine
}

/**
 * Check if a review already has a response
 */
export function hasExistingResponse(reviewElement: HTMLElement): boolean {
  return elementExists(reviewElement, GMB_SELECTORS.alreadyResponded);
}

/**
 * Create a notification element
 */
export function createNotification(
  message: string,
  type: 'success' | 'error' | 'info' = 'info',
  duration: number = 3000
): HTMLElement {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    z-index: 10001;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    background-color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    font-family: inherit;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Auto-remove after duration
  setTimeout(() => {
    removeElement(notification);
  }, duration);

  return notification;
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): T {
  let timeout: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(null, args), wait);
  }) as T;
}

/**
 * Extract a stable business identifier from the current page
 * This is used for business-level free trial enforcement
 */
export function extractBusinessId(): string | null {
  try {
    const url = window.location.href;
    
    // Method 1: Extract from Business Dashboard URLs  
    if (url.includes('business.google.com')) {
      console.log('[BusinessId] Detected business dashboard page');
      
      // Look for patterns like /businesses/123456789 or /groups/123456789
      const businessMatch = url.match(/\/(?:businesses|groups)\/([^\/\?#]+)/);
      if (businessMatch && businessMatch[1]) {
        console.log('[BusinessId] Found business path:', businessMatch[1]);
        return businessMatch[1];
      }
      
      // Look for account ID in URL parameters
      const accountMatch = url.match(/[?&]account=([^&]+)/);
      if (accountMatch && accountMatch[1]) {
        console.log('[BusinessId] Found account parameter:', accountMatch[1]);
        return accountMatch[1];
      }
    }
    
    // Method 2: Look for data-lid attributes in the DOM (primary method for Google search)
    // Google uses data-lid for location identifiers in search results
    const elementWithLid = document.querySelector('[data-lid]');
    if (elementWithLid) {
      const lid = elementWithLid.getAttribute('data-lid');
      if (lid && lid.length > 0) {
        console.log('[BusinessId] Found data-lid:', lid);
        return lid;
      }
    }
    
    // Method 3: Extract from meta tags or other DOM elements
    const metaElements = document.querySelectorAll('meta[name*="business"], meta[name*="location"]');
    for (const meta of metaElements) {
      const content = meta.getAttribute('content');
      if (content && content.length > 5) {
        return content;
      }
    }
    
    // Method 4: Look for business info in scripts or other elements
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const scriptContent = script.textContent || '';
      
      // Look for patterns like "businessId":"123456" or "locationId":"123456"
      const businessIdMatch = scriptContent.match(/["\'](?:businessId|locationId|placeId)["\']:\s*["\']([^"\']+)["\']/) ;
      if (businessIdMatch && businessIdMatch[1]) {
        return businessIdMatch[1];
      }
    }
    
    // Method 5: Fallback - create a hash from the business name and URL
    const businessNameElement = document.querySelector('h1, [role="heading"], .business-name');
    if (businessNameElement) {
      const businessName = getTextContent(businessNameElement);
      if (businessName && businessName.length > 0) {
        // Create a stable hash from business name + hostname
        const combined = `${businessName.trim().toLowerCase()}_${window.location.hostname}`;
        return btoa(combined).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
      }
    }
    
    // Method 6: Ultimate fallback - use URL path hash
    const pathHash = btoa(window.location.pathname).replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
    if (pathHash.length > 5) {
      return pathHash;
    }
    
    console.warn('[BusinessId] Could not extract business identifier from page');
    return null;
    
  } catch (error) {
    console.error('[BusinessId] Error extracting business ID:', error);
    return null;
  }
} 