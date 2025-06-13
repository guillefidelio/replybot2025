// TypeScript interfaces for review data structures

export interface ReviewData {
  id?: string;
  text: string;
  rating: number;
  reviewerName?: string;
  reviewerAvatar?: string;
  timestamp: number;
  element?: Element;
  hasResponse?: boolean;
  businessResponse?: string;
}

export interface ReviewFilter {
  minRating?: number;
  maxRating?: number;
  hasText?: boolean;
  hasResponse?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface ReviewStats {
  total: number;
  responded: number;
  pending: number;
  byRating: Record<number, number>;
} 