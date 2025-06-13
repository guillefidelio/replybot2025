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
      
      // Optionally update the user's profile
      if (result.user) {
        await updateProfile(result.user, {
          displayName: email.split('@')[0] // Use part of email as display name
        });
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
        // User signed in - store auth state and sync prompts from cloud
        try {
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
          console.error('Failed to sync prompts on login:', error);
          // Continue with authentication even if prompt sync fails
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