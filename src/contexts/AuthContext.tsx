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

  // Sign out function
  async function signOut(): Promise<void> {
    try {
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

  // Set up auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
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