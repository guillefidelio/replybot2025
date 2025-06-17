import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  serverTimestamp,
  type Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../types/firebase';
import type { 
  SubscriptionInfo, 
  CreditInfo, 
  FeatureAccess, 
  UserPreferences 
} from '../types/payment';
import { 
  DEFAULT_USER_SUBSCRIPTION, 
  DEFAULT_USER_CREDITS, 
  DEFAULT_USER_FEATURES, 
  DEFAULT_USER_PREFERENCES 
} from '../types/payment';

export interface FirestoreUserProfile extends Omit<UserProfile, 'createdAt' | 'lastLoginAt' | 'subscription' | 'credits'> {
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  updatedAt: Timestamp;
  
  // Payment-related fields with Firestore Timestamp objects
  subscription?: SubscriptionInfo;
  credits?: CreditInfo;
  features?: FeatureAccess;
  preferences?: UserPreferences;
}

export class UserService {
  // Create a new user document in Firestore
  static async createUserDocument(user: User): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      // Check if user document already exists
      const userDocSnapshot = await getDoc(userDocRef);
      
      if (!userDocSnapshot.exists()) {
        // Create default subscription with proper Timestamp conversion
        const defaultSubscription: SubscriptionInfo = {
          ...DEFAULT_USER_SUBSCRIPTION,
          currentPeriodStart: serverTimestamp() as Timestamp,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) as any,
        };

        // Create default credits with proper Timestamp conversion
        const defaultCredits: CreditInfo = {
          ...DEFAULT_USER_CREDITS,
          resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) as any,
        };

        const userData: Omit<FirestoreUserProfile, 'updatedAt'> = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          createdAt: serverTimestamp() as Timestamp,
          lastLoginAt: serverTimestamp() as Timestamp,
          
          // Payment-related fields with defaults
          subscription: defaultSubscription,
          credits: defaultCredits,
          features: DEFAULT_USER_FEATURES,
          preferences: DEFAULT_USER_PREFERENCES,
        };

        await setDoc(userDocRef, {
          ...userData,
          updatedAt: serverTimestamp() as Timestamp
        });
        
        console.log(`Created user document with payment defaults for: ${user.email}`);
      } else {
        console.log(`User document already exists for: ${user.email}`);
      }
    } catch (error) {
      console.error('Error creating user document:', error);
      throw new Error('Failed to create user profile');
    }
  }

  // Update user's last login time
  static async updateLastLogin(user: User): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      await updateDoc(userDocRef, {
        lastLoginAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
        // Also update email and displayName in case they changed
        email: user.email || '',
        displayName: user.displayName || ''
      });
      
      console.log(`Updated last login for: ${user.email}`);
    } catch (error) {
      console.error('Error updating last login:', error);
      // Don't throw error here as login should still succeed
    }
  }

  // Get user profile from Firestore
  static async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDocSnapshot = await getDoc(userDocRef);
      
      if (userDocSnapshot.exists()) {
        const data = userDocSnapshot.data() as FirestoreUserProfile;
        
        // Keep payment fields as-is since interfaces now support both Date and Timestamp
        const subscription = data.subscription;
        const credits = data.credits;

        return {
          uid: data.uid,
          email: data.email,
          displayName: data.displayName,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastLoginAt: data.lastLoginAt?.toDate() || new Date(),
          
          // Payment-related fields
          subscription,
          credits,
          features: data.features,
          preferences: data.preferences,
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // Update user profile information
  static async updateUserProfile(
    userId: string, 
    updates: Partial<Pick<UserProfile, 'email' | 'displayName'>>
  ): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        ...updates,
        updatedAt: serverTimestamp() as Timestamp
      });
      
      console.log(`Updated user profile for: ${userId}`);
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw new Error('Failed to update user profile');
    }
  }

  // Ensure user document exists (for existing users who might not have a document)
  static async ensureUserDocument(user: User): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnapshot = await getDoc(userDocRef);
      
      if (!userDocSnapshot.exists()) {
        // Create the document if it doesn't exist
        await this.createUserDocument(user);
        console.log(`Created new user document with payment defaults for: ${user.email}`);
      } else {
        // Update last login if it exists
        await this.updateLastLogin(user);
        
        // Check if the existing document has all required payment fields
        const userData = userDocSnapshot.data();
        const needsPaymentFields = !userData.subscription || !userData.credits || !userData.features || !userData.preferences;
        
        if (needsPaymentFields) {
          console.log(`Existing user ${user.email} needs payment field migration - will be handled by UserMigrationService`);
        }
      }
    } catch (error) {
      console.error('Error ensuring user document:', error);
      // Don't throw error to prevent login failures
    }
  }
} 