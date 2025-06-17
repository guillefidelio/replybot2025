// Firebase-related TypeScript types
import type { User } from 'firebase/auth';
import type { UserPaymentProfile } from '../types/payment'; // Added import

export interface AuthUser extends User {
  // Add any additional user properties you might store
}

// Extended UserProfile with UserPaymentProfile fields
export interface UserProfile extends UserPaymentProfile { // Extended here
  uid: string;
  email: string;
  displayName?: string;
  createdAt: Date; // Keep existing fields
  lastLoginAt: Date; // Keep existing fields
  // UserPaymentProfile fields will be merged here
  // e.g. subscriptionId?: string;
  //      credits: number;
  //      activeFeatures: string[];
  //      etc.
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