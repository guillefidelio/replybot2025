import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export function PopupAuthWrapper() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { signIn, signUp } = useAuth();

  const toggleAuthMode = () => {
    setIsLoginMode(!isLoginMode);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (!isLoginMode) {
      if (!confirmPassword) {
        setError('Please confirm your password');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long');
        return;
      }
    }

    try {
      setError('');
      setIsLoading(true);
      
      if (isLoginMode) {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="extension-popup">
      {/* Compact Header */}
      <div className="gradient-ai-primary text-white p-4">
        <h1 className="text-xl font-bold">AI Review Responder</h1>
        <p className="text-sm opacity-90">Sign in to sync your data</p>
      </div>

      {/* Compact Auth Form */}
      <div className="p-4">
        <div className="mb-4 text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            {isLoginMode ? 'Sign In' : 'Create Account'}
          </h2>
        </div>
        
        {error && (
          <div className="mb-3 p-2 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              required
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              required
            />
          </div>
          
          {!isLoginMode && (
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                required
                minLength={6}
              />
            </div>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 rounded-md text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading 
              ? (isLoginMode ? 'Signing In...' : 'Creating Account...') 
              : (isLoginMode ? 'Sign In' : 'Create Account')
            }
          </button>
        </form>
        
        <div className="mt-4 text-center">
          <p className="text-sm text-slate-600">
            {isLoginMode ? "Don't have an account?" : "Already have an account?"}{' '}
            <button
              onClick={toggleAuthMode}
              className="text-violet-600 hover:text-violet-500 font-medium"
            >
              {isLoginMode ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
        
        <div className="mt-4 p-3 bg-slate-50 rounded-md">
          <p className="text-xs text-slate-600 text-center">
            Your account syncs your AI response templates and settings across devices.
          </p>
        </div>
      </div>
    </div>
  );
} 