// Firebase-related TypeScript types
import type { User } from 'firebase/auth';

export interface AuthUser extends User {
  // Add any additional user properties you might store
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: Date;
  lastLoginAt: Date;
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