import { useAuth } from '../contexts/AuthContext';

export function AuthenticatedApp() {
  const { user, signOut } = useAuth();

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with user info and sign out */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                AI Review Responder
              </h1>
              <p className="text-sm text-gray-600">
                Welcome, {user?.displayName || user?.email}
              </p>
            </div>
            
            <button
              onClick={handleSignOut}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                🎉 Authentication Successful!
              </h2>
              <p className="text-gray-600 mb-6">
                You are now signed in and your data will be synced to the cloud.
              </p>
              
              {/* User info card */}
              <div className="bg-white rounded-lg shadow p-6 max-w-md mx-auto">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Account Information
                </h3>
                <div className="space-y-2 text-left">
                  <p className="text-sm">
                    <span className="font-medium text-gray-700">Email:</span>{' '}
                    <span className="text-gray-900">{user?.email}</span>
                  </p>
                  <p className="text-sm">
                    <span className="font-medium text-gray-700">Display Name:</span>{' '}
                    <span className="text-gray-900">
                      {user?.displayName || 'Not set'}
                    </span>
                  </p>
                  <p className="text-sm">
                    <span className="font-medium text-gray-700">Account Created:</span>{' '}
                    <span className="text-gray-900">
                      {user?.metadata.creationTime 
                        ? new Date(user.metadata.creationTime).toLocaleDateString()
                        : 'N/A'
                      }
                    </span>
                  </p>
                  <p className="text-sm">
                    <span className="font-medium text-gray-700">Last Sign In:</span>{' '}
                    <span className="text-gray-900">
                      {user?.metadata.lastSignInTime 
                        ? new Date(user.metadata.lastSignInTime).toLocaleDateString()
                        : 'N/A'
                      }
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-8">
                <p className="text-sm text-gray-500">
                  This is where your main extension functionality will go.
                  <br />
                  You can now implement your review response features!
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 