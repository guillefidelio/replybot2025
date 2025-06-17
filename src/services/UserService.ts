import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../types/firebase';
// Removed unused SubscriptionPlan from this import:
import { DEFAULT_FREE_PLAN /*, type SubscriptionPlan*/ } from '../types/payment';

export interface FirestoreUserProfile extends Omit<UserProfile, 'createdAt' | 'lastLoginAt' | 'nextBillingDate' | 'cancellationDate'> {
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  updatedAt: Timestamp;
  nextBillingDate?: Timestamp;
  cancellationDate?: Timestamp;
}


export class UserService {
  static async createUserDocument(user: User): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnapshot = await getDoc(userDocRef);

      if (!userDocSnapshot.exists()) {
        const newUserProfileData: Omit<UserProfile, 'createdAt' | 'lastLoginAt' | 'updatedAt' | 'nextBillingDate' | 'cancellationDate' | 'uid'> & { uid: string; createdAt: any; lastLoginAt: any; updatedAt: any; nextBillingDate?: any; cancellationDate?: any } = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          credits: DEFAULT_FREE_PLAN.credits,
          subscriptionId: DEFAULT_FREE_PLAN.id,
          subscriptionStatus: 'active',
          activeFeatures: DEFAULT_FREE_PLAN.features,
          paddleCustomerId: undefined,
          nextBillingDate: undefined,
          cancellationDate: undefined,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        await setDoc(userDocRef, newUserProfileData);
        console.log(`Created user document for: ${user.email} with default free plan.`);
      } else {
        console.log(`User document already exists for: ${user.email}`);
      }
    } catch (error) {
      console.error('Error creating user document:', error);
      throw new Error('Failed to create user profile with payment details');
    }
  }

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
        const data = userDocSnapshot.data() as FirestoreUserProfile;
        return {
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastLoginAt: data.lastLoginAt?.toDate() || new Date(),
          nextBillingDate: data.nextBillingDate?.toDate(),
          cancellationDate: data.cancellationDate?.toDate(),
        } as UserProfile;
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

  static async updateUserSubscription(
    userId: string,
    subscriptionData: Partial<Pick<UserProfile, 'subscriptionId' | 'subscriptionStatus' | 'activeFeatures' | 'paddleCustomerId' | 'nextBillingDate' | 'cancellationDate'>>
  ): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', userId);

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
        await this.createUserDocument(user);
      } else {
        await this.updateLastLogin(user);
        const userData = userDocSnapshot.data() as UserProfile;
        if (typeof userData.credits === 'undefined') {
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