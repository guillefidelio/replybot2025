export interface IframeConfig {
  [key: string]: {
    urlPattern: string;
    host: string;
    excludePattern?: string;
    overlayMessage?: string;
    priority: number; // Higher number means higher priority
    // Properties for button injection
    containerSelector?: string;
    referenceButtonSelector?: string;
    injectButton?: boolean; // A flag to control if a button should be injected
    buttonText?: string; // Text to display on the button
  };
}

export const IFRAME_CONFIG: IframeConfig = {
  // === Configuration for business.google.com ===
  BUSINESS_SINGLE_REVIEW: {
    urlPattern: '/customers/reviews/reply',
    host: 'business.google.com',
    priority: 10,
  },
  BUSINESS_MULTIPLE_REVIEWS: {
    urlPattern: '/customers/reviews',
    excludePattern: '/reply', // This will be used to differentiate from single reviews
    host: 'business.google.com',
    priority: 5,
  },

  // === Configuration for google.com ===
  GOOGLE_SINGLE_REVIEW: {
    urlPattern: '/customers/reviews/reply',
    host: 'google.com',
    overlayMessage: 'Google Single Review Detected',
    priority: 20,
    injectButton: true,
    containerSelector: 'div.FkJOzc', // Container for the reply form
    referenceButtonSelector: 'button[jsname="hrGhad"]', // The "Send" button
  },
  GOOGLE_MULTIPLE_REVIEWS: {
    urlPattern: '/customers/reviews',
    excludePattern: '/reply',
    host: 'google.com',
    overlayMessage: 'Google Multiple Reviews Detected',
    priority: 10,
    injectButton: false, // We don't inject on this view yet
  },
  GOOGLE_REVIEWS_SEARCH: {
    urlPattern: 'google.com/search?q=',
    host: 'google.com',
    overlayMessage: 'Google Search Page Detected',
    priority: 1,
    injectButton: false,
  },
  // We may not need a single review config for google.com, but we can add it later.
}; 