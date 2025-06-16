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

export interface FirestoreUserProfile extends Omit<UserProfile, 'createdAt' | 'lastLoginAt'> {
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  updatedAt: Timestamp;
}

export class UserService {
  // Create a new user document in Firestore
  static async createUserDocument(user: User): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      // Check if user document already exists
      const userDocSnapshot = await getDoc(userDocRef);
      
      if (!userDocSnapshot.exists()) {
        const userData: Omit<FirestoreUserProfile, 'updatedAt'> = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          createdAt: serverTimestamp() as Timestamp,
          lastLoginAt: serverTimestamp() as Timestamp,
        };

        await setDoc(userDocRef, {
          ...userData,
          updatedAt: serverTimestamp() as Timestamp
        });
        
        console.log(`Created user document for: ${user.email}`);
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
        return {
          uid: data.uid,
          email: data.email,
          displayName: data.displayName,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastLoginAt: data.lastLoginAt?.toDate() || new Date()
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
      } else {
        // Update last login if it exists
        await this.updateLastLogin(user);
      }
    } catch (error) {
      console.error('Error ensuring user document:', error);
      // Don't throw error to prevent login failures
    }
  }
} 