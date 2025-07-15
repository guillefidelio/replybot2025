// TypeScript interfaces for extension configuration and state

// Extension Settings Interface
export interface ExtensionSettings {
  prompts: { [key: string]: string };
  trustModes: {
    individual: boolean;
    bulkPositive: boolean;
    bulkFull: boolean;
  };
  rateLimit: number;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface TrustModeSettings {
  individual: boolean; // auto-post individual responses without preview
  bulkPositive: boolean; // auto-process 4-5 star reviews
  bulkFull: boolean; // auto-process all reviews
}

export interface NotificationSettings {
  showSuccess: boolean;
  showErrors: boolean;
  showProgress: boolean;
}

export interface BulkProcessingState {
  isActive: boolean;
  totalReviews: number;
  processedReviews: number;
  successCount: number;
  errorCount: number;
  currentRating?: number;
  mode: 'positive' | 'full';
  canCancel: boolean;
}

export interface ExtensionMessage {
  type: MessageType;
  data?: any;
  requestId?: string;
}

export type MessageType =
  | 'GENERATE_AI_RESPONSE'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'
  | 'BULK_PROCESS_START'
  | 'BULK_PROCESS_STOP'
  | 'BULK_PROCESS_STATUS'
  | 'POST_REVIEW_RESPONSE'
  | 'GET_REVIEW_DATA'
  | 'NOTIFICATION_SHOW'
;

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface GeminiAPIRequest {
  prompt: string;
  reviewData: {
    text: string;
    rating: number;
    reviewerName?: string;
  };
  maxTokens?: number;
  temperature?: number;
}

// Validation Error Interface
export interface ValidationError {
  field: string;
  message: string;
}

// Trust Mode Types
export type TrustMode = 'individual' | 'bulkPositive' | 'bulkFull';

// Settings Validation Result
export interface SettingsValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}



// Import Result Interface
export interface ImportResult {
  success: boolean;
  errors: string[];
} 