import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';

export function AuthWrapper() {
  const [isLoginMode, setIsLoginMode] = useState(true);

  function toggleAuthMode() {
    setIsLoginMode(!isLoginMode);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
            AI Review Responder
          </h1>
          <p className="text-sm text-gray-600">
            Sign in to sync your responses across devices
          </p>
        </div>
        
        {isLoginMode ? (
          <LoginForm onToggleMode={toggleAuthMode} />
        ) : (
          <SignupForm onToggleMode={toggleAuthMode} />
        )}
      </div>
    </div>
  );
} 