// Service for detecting and parsing review elements on Google My Business pages
// Uses the actual DOM selectors from GMB review pages

import { GMB_SELECTORS, safeQuerySelector, safeQuerySelectorAll, getTextContent, extractRatingFromElement, hasExistingResponse } from '../utils/dom-utils';

export interface ReviewData {
  id: string;
  reviewerName: string;
  rating: number;
  content: string;
  hasResponse: boolean;
  element: HTMLElement;
  timestamp: number;
}

export interface ReviewStats {
  total: number;
  withResponses: number;
  withoutResponses: number;
  byRating: Record<number, number>;
  avgRating: number;
}

export class ReviewDetectorService {
  private processedReviews = new Set<string>();
  private reviewsCache = new Map<string, ReviewData>();
  
  /**
   * Check if current page is a Google My Business review page
   */
  isGMBReviewPage(): boolean {
    const url = window.location.href;
    return url.includes('business.google.com/reviews') || 
           (url.includes('business.google.com/groups/') && url.includes('/reviews'));
  }

  /**
   * Scan the page for review elements
   */
  scanForReviews(): ReviewData[] {
    if (!this.isGMBReviewPage()) {
      console.warn('Not on a GMB review page, skipping scan');
      return [];
    }

    console.log('Scanning for reviews on GMB page...');
    
    // Find all review containers using the provided selectors
    const reviewElements = safeQuerySelectorAll(document, GMB_SELECTORS.reviewElement);
    
    console.log(`Found ${reviewElements.length} review elements`);
    
    const reviews: ReviewData[] = [];
    
    reviewElements.forEach((reviewElement, index) => {
      const reviewData = this.extractReviewData(reviewElement, index);
      if (reviewData) {
        const existingReview = this.reviewsCache.get(reviewData.id);
        if (!existingReview) {
          this.reviewsCache.set(reviewData.id, reviewData);
          reviews.push(reviewData);
          console.log(`New review detected: ${reviewData.reviewerName}, ${reviewData.rating} stars`);
        } else {
          reviews.push(existingReview);
        }
      }
    });

    return reviews;
  }

  /**
   * Extract review data from a DOM element
   */
  private extractReviewData(reviewElement: HTMLElement, index: number): ReviewData | null {
    try {
      // Check if review already has a response
      const hasResponse = hasExistingResponse(reviewElement);

      // Extract reviewer name
      const nameElement = safeQuerySelector(reviewElement, GMB_SELECTORS.reviewerName);
      const reviewerName = getTextContent(nameElement) || 'Anonymous';

      // Extract rating
      const ratingElement = safeQuerySelector(reviewElement, GMB_SELECTORS.rating);
      const rating = extractRatingFromElement(ratingElement!);

      // Extract review content
      const contentElement = safeQuerySelector(reviewElement, GMB_SELECTORS.content);
      const content = getTextContent(contentElement);

      // Generate unique ID based on content and reviewer name
      const id = this.generateReviewId(reviewerName, content, index);

      return {
        id,
        reviewerName,
        rating,
        content,
        hasResponse,
        element: reviewElement,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error extracting review data:', error);
      return null;
    }
  }

  /**
   * Generate a unique ID for a review
   */
  private generateReviewId(reviewerName: string, content: string, index: number): string {
    const cleanName = reviewerName.replace(/\s+/g, '').substring(0, 10);
    const cleanContent = content.replace(/\s+/g, '').substring(0, 15);
    const timestamp = Date.now().toString().slice(-6);
    return `review-${cleanName}-${cleanContent}-${index}-${timestamp}`;
  }

  /**
   * Get review statistics
   */
  getReviewStats(reviews: ReviewData[]): ReviewStats {
    const stats: ReviewStats = {
      total: reviews.length,
      withResponses: 0,
      withoutResponses: 0,
      byRating: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      avgRating: 0
    };

    let totalRating = 0;

    reviews.forEach(review => {
      if (review.hasResponse) {
        stats.withResponses++;
      } else {
        stats.withoutResponses++;
      }

      stats.byRating[review.rating] = (stats.byRating[review.rating] || 0) + 1;
      totalRating += review.rating;
    });

    stats.avgRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    return stats;
  }

  /**
   * Filter reviews based on criteria
   */
  filterReviews(reviews: ReviewData[], criteria: {
    hasResponse?: boolean;
    minRating?: number;
    maxRating?: number;
    hasContent?: boolean;
  }): ReviewData[] {
    return reviews.filter(review => {
      if (criteria.hasResponse !== undefined && review.hasResponse !== criteria.hasResponse) {
        return false;
      }
      
      if (criteria.minRating !== undefined && review.rating < criteria.minRating) {
        return false;
      }
      
      if (criteria.maxRating !== undefined && review.rating > criteria.maxRating) {
        return false;
      }
      
      if (criteria.hasContent !== undefined) {
        const hasContent = review.content.length > 0;
        if (hasContent !== criteria.hasContent) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Find review by ID
   */
  findReviewById(id: string): ReviewData | null {
    return this.reviewsCache.get(id) || null;
  }

  /**
   * Get all unanswered reviews
   */
  getUnansweredReviews(reviews: ReviewData[]): ReviewData[] {
    return this.filterReviews(reviews, { hasResponse: false });
  }

  /**
   * Get positive reviews (4-5 stars)
   */
  getPositiveReviews(reviews: ReviewData[]): ReviewData[] {
    return this.filterReviews(reviews, { minRating: 4 });
  }

  /**
   * Get unanswered positive reviews (for trust mode)
   */
  getUnansweredPositiveReviews(reviews: ReviewData[]): ReviewData[] {
    return this.filterReviews(reviews, { hasResponse: false, minRating: 4 });
  }

  /**
   * Check if a review element is still valid in the DOM
   */
  isReviewElementValid(review: ReviewData): boolean {
    try {
      return document.contains(review.element);
    } catch {
      return false;
    }
  }

  /**
   * Clear processed reviews cache
   */
  clearCache(): void {
    this.processedReviews.clear();
    this.reviewsCache.clear();
  }

  /**
   * Get response button container for a review
   */
  getResponseButtonContainer(review: ReviewData): HTMLElement | null {
    return safeQuerySelector(review.element, GMB_SELECTORS.responseButtonContainer);
  }

  /**
   * Check if review already has an AI button injected
   */
  hasAIButton(review: ReviewData): boolean {
    const container = this.getResponseButtonContainer(review);
    return container ? safeQuerySelector(container, '.ai-response-button') !== null : false;
  }
} 