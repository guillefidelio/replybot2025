// TypeScript interfaces for prompt management system

// Prompt Categories
export type PromptCategory = 'positive' | 'neutral' | 'negative' | 'custom';

// Review Content Types
export type ReviewContentType = 'with-text' | 'rating-only';

// Prompt Template Interface
export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  category: PromptCategory;
  targetRating: number; // 1-5 stars
  hasText: boolean; // Whether this prompt is for reviews with text
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
  description?: string;
  tags?: string[];
}

// Prompt Collection Interface
export interface PromptCollection {
  [id: string]: PromptTemplate;
}

// Prompt CRUD Operations Response
export interface PromptOperationResult {
  success: boolean;
  error?: string;
  prompt?: PromptTemplate;
}

// Bulk Prompt Operations
export interface BulkPromptResult {
  success: number;
  failed: number;
  errors: string[];
}

// Prompt Validation Result
export interface PromptValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Prompt Filter Options
export interface PromptFilter {
  category?: PromptCategory;
  rating?: number;
  hasText?: boolean;
  isDefault?: boolean;
}

// Prompt Search Options
export interface PromptSearchOptions {
  query: string;
  filter?: PromptFilter;
  sortBy?: 'name' | 'rating' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

// Default Prompt Configuration
export interface DefaultPromptConfig {
  rating: number;
  category: PromptCategory;
  template: string;
  hasText: boolean;
}

// Prompt Usage Statistics
export interface PromptUsageStats {
  promptId: string;
  usageCount: number;
  lastUsed: string;
  successRate: number;
  averageRating: number;
}

export interface PromptSettings {
  templates: Record<string, PromptTemplate>;
  defaultPrompts: {
    [key: string]: string; // rating_hasText as key
  };
}

export type PromptType = 
  | '1_true'  // 1 star with text
  | '1_false' // 1 star without text
  | '2_true'  // 2 star with text
  | '2_false' // 2 star without text
  | '3_true'  // 3 star with text
  | '3_false' // 3 star without text
  | '4_true'  // 4 star with text
  | '4_false' // 4 star without text
  | '5_true'  // 5 star with text
  | '5_false' // 5 star without text
  | 'default'; // fallback prompt 