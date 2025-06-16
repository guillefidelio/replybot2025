export interface IframeConfig {
  urlPart: string;
  buttonText: string;
  containerSelector: string; // Main container for the reply section
  referenceButtonSelector: string; // Existing button to insert AI button next to
  textAreaSelector?: string; // Selector for the text area
  textAreaJsName?: string; // jsname for the text area, if available
  reviewTextSelector?: string; // Selector for the review text itself
  reviewerNameSelector?: string; // Selector for the reviewer's name
  starRatingSelector?: string; // Selector for the star rating
  // Add other selectors as needed
}

export const IFRAME_TYPES: { [key: string]: IframeConfig } = {
  SINGLEREVIEW: { // For business.google.com
    urlPart: '/customers/reviews/reply', // As per the guide
    buttonText: 'Respond with AI',
    containerSelector: 'div.FkJOzc.lgfhc.LW6Hp', // From guide
    referenceButtonSelector: 'button[jsname="hrGhad"]', // From guide
    textAreaJsName: 'YPqjbf', // From guide
    // Placeholders - these might need to be verified or use existing selectors from content.ts
    reviewTextSelector: '.gyKkFe.JhRJje', // From guide's SELECTORS
    reviewerNameSelector: 'a[jsname="xs1xe"], .N0c6q.JhRJje a', // From guide's SELECTORS
    starRatingSelector: '.DYizzd', // From guide's SELECTORS
  },
  GOOGLE_COM_REVIEWS: { // For the new google.com iframe
    urlPart: '/customers/reviews/reply', // Same as SINGLEREVIEW
    buttonText: 'Respond with AI (New)', // Keep button text distinct for now for testing
    containerSelector: 'div.FkJOzc.lgfhc.LW6Hp', // Same as SINGLEREVIEW
    referenceButtonSelector: 'button[jsname="hrGhad"]', // Same as SINGLEREVIEW
    textAreaJsName: 'YPqjbf', // Same as SINGLEREVIEW
    reviewTextSelector: '.gyKkFe.JhRJje', // Same as SINGLEREVIEW
    reviewerNameSelector: 'a[jsname="xs1xe"], .N0c6q.JhRJje a', // Same as SINGLEREVIEW
    starRatingSelector: '.DYizzd', // Same as SINGLEREVIEW
  },
  // Potentially other iframe types can be added here
};

// It might also be useful to have a shared SELECTORS object if some selectors are common
// or fallbacks, but the guide puts them within each IFRAME_TYPE.
// For now, specific selectors are within each config.

export const CONFIG = {
  WAIT: {
    DEBOUNCE: 300, // ms
    RETRY_DELAY: 1000, // ms
    MAX_RETRIES: 5,
  },
  // ... other shared configurations
};
