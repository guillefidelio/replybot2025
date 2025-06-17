import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { 
  type User,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { auth } from '../firebase';
import type { AuthContextType, FirebaseError } from '../types/firebase';
import { PromptSyncService } from '../services/PromptSyncService';
import { UserService } from '../services/UserService';
import { UserMigrationService } from '../services/UserMigrationService';

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Custom hook to use the auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// AuthProvider component props
interface AuthProviderProps {
  children: ReactNode;
}

// AuthProvider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Sign up function
  async function signUp(email: string, password: string): Promise<void> {
    try {
      setLoading(true);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update the user's profile and create Firestore document
      if (result.user) {
        await updateProfile(result.user, {
          displayName: email.split('@')[0] // Use part of email as display name
        });
        
        // Automatically create user document in Firestore
        await UserService.createUserDocument(result.user);
        console.log('User document created successfully on signup');
      }
    } catch (error) {
      const firebaseError = error as FirebaseError;
      console.error('Sign up error:', firebaseError.message);
      throw new Error(getErrorMessage(firebaseError.code));
    } finally {
      setLoading(false);
    }
  }

  // Sign in function
  async function signIn(email: string, password: string): Promise<void> {
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const firebaseError = error as FirebaseError;
      console.error('Sign in error:', firebaseError.message);
      throw new Error(getErrorMessage(firebaseError.code));
    } finally {
      setLoading(false);
    }
  }

  // Sign out function with prompt sync
  async function signOut(): Promise<void> {
    try {
      // Perform final sync before signing out if user exists
      if (user) {
        try {
          await PromptSyncService.syncOnLogout(user);
          console.log('Final prompt sync completed before logout');
        } catch (syncError) {
          console.error('Error during final sync on logout:', syncError);
          // Continue with logout even if sync fails
        }
      }
      
      await firebaseSignOut(auth);
    } catch (error) {
      const firebaseError = error as FirebaseError;
      console.error('Sign out error:', firebaseError.message);
      throw new Error('Failed to sign out');
    }
  }

  // Reset password function
  async function resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      const firebaseError = error as FirebaseError;
      console.error('Password reset error:', firebaseError.message);
      throw new Error(getErrorMessage(firebaseError.code));
    }
  }

  // Helper function to get user-friendly error messages
  function getErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/user-not-found':
        return 'No account found with this email address.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters long.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      default:
        return 'An error occurred. Please try again.';
    }
  }

  // Set up auth state listener with prompt sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user ? 'User signed in' : 'User signed out');
      
      if (user) {
        // User signed in - ensure user document exists and update last login
        try {
          // Ensure user document exists (handles both new and existing users)
          await UserService.ensureUserDocument(user);
          
          // Check and migrate user to new payment system if needed
          const migrationResult = await UserMigrationService.checkAndMigrateUser(user);
          if (migrationResult.migrated) {
            console.log(`User ${user.email} successfully migrated to payment system`);
          } else if (!migrationResult.success) {
            console.warn(`Migration check failed for user ${user.email}:`, migrationResult.error);
            // Continue with login even if migration fails
          }
          
          // Store user authentication state for content script access
          await chrome.storage.local.set({ 
            authUser: {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName
            }
          });
          console.log('User auth state stored in Chrome storage');
          
          await PromptSyncService.syncOnLogin(user);
          console.log('Prompts synced successfully on login');
        } catch (error) {
          console.error('Failed to handle user login:', error);
          // Continue with authentication even if user document creation, migration, or prompt sync fails
        }
      } else {
        // User signed out - clear auth state and prompts
        try {
          await chrome.storage.local.remove(['authUser']);
          console.log('User auth state cleared from Chrome storage');
        } catch (error) {
          console.error('Error clearing auth state:', error);
        }
        console.log('User signed out, prompts cleared');
      }
      
      setUser(user);
      setLoading(false);
    });

    return unsubscribe; // Cleanup subscription on unmount
  }, []);

  // Context value
  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 