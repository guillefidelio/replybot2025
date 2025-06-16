// src/features/iframe-detector/site_rules.ts

export interface SiteRule {
  id: string; // A unique ID for each rule
  urlPattern: string;
  host: string;
  excludePattern?: string;
  priority: number;
  // Properties for button injection
  injectButton?: boolean;
  containerSelector?: string;
  referenceButtonSelector?: string;
  buttonText?: string;
}

export const RULES: SiteRule[] = [
  {
    id: 'GOOGLE_SINGLE_REVIEW',
    urlPattern: '/customers/reviews/reply',
    host: 'google.com',
    priority: 20, // Priority can be used for sorting
    injectButton: true,
    containerSelector: 'div.FkJOzc',
    referenceButtonSelector: 'button[jsname="hrGhad"]', // The "Send" button
    buttonText: 'Respond with AI',
  },
  {
    id: 'GOOGLE_MULTIPLE_REVIEWS',
    urlPattern: '/customers/reviews',
    host: 'google.com',
    excludePattern: '/reply',
    priority: 10,
    injectButton: false,
  },
  // ... other rules can be added here
].sort((a, b) => b.priority - a.priority); // Sort by priority descending 