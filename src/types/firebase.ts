// Firebase-related TypeScript types
import type { User } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';
import type { 
  SubscriptionInfo, 
  CreditInfo, 
  FeatureAccess, 
  UserPreferences 
} from './payment';

export interface AuthUser extends User {
  // Add any additional user properties you might store
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: Date | Timestamp;
  lastLoginAt: Date | Timestamp;
  
  // Payment-related fields (optional for backward compatibility)
  subscription?: SubscriptionInfo;
  credits?: CreditInfo;
  features?: FeatureAccess;
  preferences?: UserPreferences;
}

// Raw Firestore document interface (before conversion)
export interface UserProfileFirestore {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  
  // Payment-related fields (optional for backward compatibility)
  subscription?: SubscriptionInfo;
  credits?: CreditInfo;
  features?: FeatureAccess;
  preferences?: UserPreferences;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

export interface FirebaseError {
  code: string;
  message: string;
} 