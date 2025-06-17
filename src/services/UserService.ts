import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  serverTimestamp,
  Timestamp // Changed from "type Timestamp"
} from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../types/firebase'; // UserProfile now includes payment fields
import { DEFAULT_FREE_PLAN, type SubscriptionPlan } from '../types/payment'; // Import default plan

// Ensure FirestoreUserProfile is defined or imported if it's a separate local type
// For this example, assuming UserProfile from ../types/firebase is the one stored in Firestore directly
// after being extended. If FirestoreUserProfile was meant to be the DB structure, adjust accordingly.

// Let's assume UserProfile is the type being written to Firestore.
// If you have a separate FirestoreUserProfile, ensure it also includes the new fields.
export interface FirestoreUserProfile extends Omit<UserProfile, 'createdAt' | 'lastLoginAt' | 'nextBillingDate' | 'cancellationDate'> {
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  updatedAt: Timestamp;
  // Optional payment fields that might have specific Firestore types (e.g. Timestamp for dates)
  nextBillingDate?: Timestamp;
  cancellationDate?: Timestamp;
}


export class UserService {
  static async createUserDocument(user: User): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnapshot = await getDoc(userDocRef);

      if (!userDocSnapshot.exists()) {
        // Initialize with default free plan settings
        const newUserProfileData: Omit<UserProfile, 'createdAt' | 'lastLoginAt' | 'updatedAt' | 'nextBillingDate' | 'cancellationDate' | 'uid'> & { uid: string; createdAt: any; lastLoginAt: any; updatedAt: any; nextBillingDate?: any; cancellationDate?: any } = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          // Free plan defaults
          credits: DEFAULT_FREE_PLAN.credits,
          subscriptionId: DEFAULT_FREE_PLAN.id,
          subscriptionStatus: 'active', // Default to active for new free users
          activeFeatures: DEFAULT_FREE_PLAN.features,
          paddleCustomerId: undefined, // No Paddle ID initially
          nextBillingDate: undefined, // No next billing date for free plan
          cancellationDate: undefined,
          // Timestamps
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        await setDoc(userDocRef, newUserProfileData);
        console.log(`Created user document for: ${user.email} with default free plan.`);
      } else {
        console.log(`User document already exists for: ${user.email}`);
        // Optionally, update last login or ensure default plan fields if missing
        // For simplicity, current issue only asks for initialization.
      }
    } catch (error) {
      console.error('Error creating user document:', error);
      throw new Error('Failed to create user profile with payment details');
    }
  }

  // Update user's last login time
  static async updateLastLogin(user: User): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        email: user.email || '',
        displayName: user.displayName || ''
      });
      console.log(`Updated last login for: ${user.email}`);
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  }

  static async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDocSnapshot = await getDoc(userDocRef);

      if (userDocSnapshot.exists()) {
        const data = userDocSnapshot.data() as FirestoreUserProfile; // Use FirestoreUserProfile for raw data
        // Convert Firestore Timestamps to JS Dates for UserProfile consistency
        return {
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastLoginAt: data.lastLoginAt?.toDate() || new Date(),
          nextBillingDate: data.nextBillingDate?.toDate(),
          cancellationDate: data.cancellationDate?.toDate(),
        } as UserProfile; // Cast to UserProfile after conversion
      }
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  static async updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, 'email' | 'displayName'>>
  ): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
      console.log(`Updated user profile for: ${userId}`);
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw new Error('Failed to update user profile');
    }
  }

  /**
   * Updates a user's subscription and related payment information.
   * @param userId The ID of the user to update.
   * @param subscriptionData Partial data of UserPaymentProfile fields to update.
   *                         e.g., { subscriptionId: 'premium', activeFeatures: ['feat1', 'feat2'] }
   */
  static async updateUserSubscription(
    userId: string,
    subscriptionData: Partial<Pick<UserProfile, 'subscriptionId' | 'subscriptionStatus' | 'activeFeatures' | 'paddleCustomerId' | 'nextBillingDate' | 'cancellationDate'>>
  ): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', userId);

      // Prepare updates, converting Dates to Timestamps if necessary
      const updates: { [key: string]: any } = { ...subscriptionData };
      if (subscriptionData.nextBillingDate) {
        updates.nextBillingDate = Timestamp.fromDate(subscriptionData.nextBillingDate);
      }
      if (subscriptionData.cancellationDate) {
        updates.cancellationDate = Timestamp.fromDate(subscriptionData.cancellationDate);
      }
      updates.updatedAt = serverTimestamp();

      await updateDoc(userDocRef, updates);
      console.log(`Updated subscription details for user: ${userId}`);
    } catch (error) {
      console.error('Error updating user subscription:', error);
      throw new Error('Failed to update user subscription');
    }
  }

  static async ensureUserDocument(user: User): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnapshot = await getDoc(userDocRef);
      
      if (!userDocSnapshot.exists()) {
        await this.createUserDocument(user); // Will now include payment defaults
      } else {
        await this.updateLastLogin(user);
        // Optionally, add logic here to check if existing users have the new payment fields
        // and add them if missing (though a separate migration script is planned for bulk updates)
        const userData = userDocSnapshot.data() as UserProfile;
        if (typeof userData.credits === 'undefined') {
            // A simple way to add defaults if missing for an existing user during ensureUserDocument
            // More complex migrations should use the dedicated script.
            await updateDoc(userDocRef, {
                credits: DEFAULT_FREE_PLAN.credits,
                subscriptionId: DEFAULT_FREE_PLAN.id,
                subscriptionStatus: 'active',
                activeFeatures: DEFAULT_FREE_PLAN.features,
                updatedAt: serverTimestamp()
            });
            console.log(`Initialized missing payment fields for existing user: ${user.uid}`);
        }
      }
    } catch (error) {
      console.error('Error ensuring user document:', error);
    }
  }
}