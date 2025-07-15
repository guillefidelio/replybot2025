import { useState, useEffect } from 'react';

interface CreditInfo {
  available: number;
  total: number;
  used: number;
  resetDate: string;
  plan: 'free' | 'starter' | 'professional';
}

interface CreditDisplayProps {
  onUpgradeClick?: () => void;
}

export function CreditDisplay({ onUpgradeClick }: CreditDisplayProps) {
  const [creditInfo, setCreditInfo] = useState<CreditInfo>({
    available: 0,
    total: 10,
    used: 0,
    resetDate: '',
    plan: 'free'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCreditInfo();
    
    // Set up periodic refresh every 30 seconds
    const interval = setInterval(loadCreditInfo, 30000);
    
    // Listen for credit-related events from background script
    const handleMessage = (message: any) => {
      if (message.type === 'CREDIT_UPDATED' || message.action === 'creditUpdate') {
        loadCreditInfo();
      }
    };
    
    // Add message listener for real-time updates
    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const loadCreditInfo = async () => {
    try {
      setError(null);
      
      // Check if user is authenticated
      const authResult = await chrome.storage.local.get(['authUser']);
      if (!authResult.authUser) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }

      // Get credit status from background script
      const response = await chrome.runtime.sendMessage({
        action: 'checkCredits',
        data: { operation: 'status_check' }
      });

      if (response && response.success) {
        const data = response.data;
        setCreditInfo({
          available: data.available || 0,
          total: data.total || 10,
          used: (data.total || 10) - (data.available || 0),
          resetDate: data.resetDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          plan: data.plan || 'free'
        });
      } else {
        setError(response?.error || 'Failed to load credit information');
      }
    } catch (error) {
      console.error('Error loading credit info:', error);
      setError('Error loading credit information');
    } finally {
      setLoading(false);
    }
  };

  const getUsagePercentage = () => {
    if (creditInfo.total === 0) return 0;
    return Math.round((creditInfo.used / creditInfo.total) * 100);
  };

  const getUsageColor = () => {
    const percentage = getUsagePercentage();
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusMessage = () => {
    const percentage = getUsagePercentage();
    if (creditInfo.available === 0) {
      return 'No credits remaining';
    }
    if (percentage >= 90) {
      return 'Credits running low';
    }
    if (percentage >= 75) {
      return 'Consider upgrading soon';
    }
    return 'Credits available';
  };

  const formatResetDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
      });
    } catch {
      return 'Unknown';
    }
  };

  const getPlanDisplayName = (plan: string) => {
    switch (plan) {
      case 'starter': return 'Starter';
      case 'professional': return 'Professional';
      default: return 'Free';
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'starter': return 'text-blue-600 bg-blue-100';
      case 'professional': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-6 bg-gray-200 rounded w-16"></div>
          </div>
          <div className="h-2 bg-gray-200 rounded mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-32"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-4">
        <div className="flex items-center text-red-600 mb-2">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">Credit Status Unavailable</span>
        </div>
        <p className="text-sm text-gray-600 mb-3">{error}</p>
        <button
          onClick={loadCreditInfo}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">Credits</h3>
        </div>
        <div className="flex items-center">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPlanColor(creditInfo.plan)}`}>
            {getPlanDisplayName(creditInfo.plan)}
          </span>
        </div>
      </div>

      {/* Credit Count */}
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <span className="text-xl font-bold text-gray-900">{creditInfo.available}</span>
          <span className="text-sm text-gray-600 ml-1">/ {creditInfo.total}</span>
        </div>
        <span className="text-sm text-gray-600">{getUsagePercentage()}% used</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${getUsageColor()}`}
          style={{ width: `${getUsagePercentage()}%` }}
        ></div>
      </div>

      {/* Status and Reset Info */}
      <div className="flex items-center justify-between text-xs text-gray-600 mb-3">
        <span>{getStatusMessage()}</span>
        <span>Resets {formatResetDate(creditInfo.resetDate)}</span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {creditInfo.plan === 'free' && (
          <button
            onClick={onUpgradeClick}
            className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Upgrade Plan
          </button>
        )}
        
        {creditInfo.available <= 2 && creditInfo.plan !== 'professional' && (
          <button
            onClick={onUpgradeClick}
            className="flex-1 bg-orange-600 text-white py-2 px-3 rounded-md text-sm font-medium hover:bg-orange-700 transition-colors"
          >
            Get More Credits
          </button>
        )}
        
        <button
          onClick={loadCreditInfo}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          title="Refresh credit status"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Low Credit Warning with Enhanced Notifications */}
      {creditInfo.available <= 2 && (
        <div className={`mt-3 p-3 border rounded-lg text-sm ${
          creditInfo.available === 0 
            ? 'bg-red-50 border-red-200 text-red-700' 
            : creditInfo.available === 1
            ? 'bg-orange-50 border-orange-200 text-orange-700'
            : 'bg-yellow-50 border-yellow-200 text-yellow-700'
        }`}>
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1">
              <span className="font-semibold block">
                {creditInfo.available === 0 
                  ? '🚨 No credits remaining!' 
                  : creditInfo.available === 1
                  ? '⚠️ Only 1 credit left!'
                  : '💡 Running low on credits'
                }
              </span>
              <p className="mt-1 text-xs">
                {creditInfo.available === 0 
                  ? 'Upgrade your plan to continue generating AI responses.'
                  : creditInfo.available === 1
                  ? 'Upgrade now to avoid interruption in your AI response generation.'
                  : 'Consider upgrading to ensure uninterrupted service.'
                }
              </p>
              {onUpgradeClick && (
                <button
                  onClick={onUpgradeClick}
                  className={`mt-2 px-3 py-1 rounded text-xs font-medium transition-colors ${
                    creditInfo.available === 0
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : creditInfo.available === 1
                      ? 'bg-orange-600 text-white hover:bg-orange-700'
                      : 'bg-yellow-600 text-white hover:bg-yellow-700'
                  }`}
                >
                  {creditInfo.available === 0 ? 'Upgrade Now' : 'View Plans'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 