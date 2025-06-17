import { useAuth } from './contexts/AuthContext';
import { AuthWrapper } from './components/Auth/AuthWrapper';
import { AuthenticatedApp } from './components/AuthenticatedApp';
import './App.css';

import { NotificationProvider } from './contexts/NotificationContext'; // Adjust path

function App() {
  const { user, loading } = useAuth();

  // Show loading spinner while checking authentication state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Conditional rendering based on authentication state
  return (
    <NotificationProvider>
      <div className="App">
        {user ? (
          // User is authenticated - show the main app
          <AuthenticatedApp />
        ) : (
          // User is not authenticated - show login/signup forms
          <AuthWrapper />
        )}
      </div>
    </NotificationProvider>
  );
}

export default App;
