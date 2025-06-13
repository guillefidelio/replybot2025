import React, { useState, useEffect } from 'react';

interface StorageQuotaProps {
  className?: string;
}

interface StorageInfo {
  used: number;
  quota: number;
  available: number;
  usagePercentage: number;
}

// Utility function to send messages to background script
const sendMessage = (message: any): Promise<any> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
};

// Format bytes to human readable format
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const StorageQuota: React.FC<StorageQuotaProps> = ({ className = '' }) => {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ cleaned: number; errors: string[] } | null>(null);

  useEffect(() => {
    loadStorageInfo();
    
    // Refresh storage info every 30 seconds
    const interval = setInterval(loadStorageInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStorageInfo = async () => {
    try {
      // Get storage info using chrome.storage.local.getBytesInUse
      const used = await new Promise<number>((resolve) => {
        chrome.storage.local.getBytesInUse(null, resolve);
      });
      
      const quota = chrome.storage.local.QUOTA_BYTES;
      const available = quota - used;
      const usagePercentage = (used / quota) * 100;

      setStorageInfo({
        used,
        quota,
        available,
        usagePercentage
      });
    } catch (error) {
      console.error('Failed to get storage info:', error);
      // Fallback values
      setStorageInfo({
        used: 0,
        quota: 5242880, // 5MB default
        available: 5242880,
        usagePercentage: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    setCleanupResult(null);
    
    try {
      const response = await sendMessage({ type: 'CLEANUP_STORAGE' });
      if (response.success) {
        setCleanupResult(response.data);
        // Refresh storage info after cleanup
        await loadStorageInfo();
      } else {
        setCleanupResult({
          cleaned: 0,
          errors: [response.error || 'Cleanup failed']
        });
      }
    } catch (error) {
      setCleanupResult({
        cleaned: 0,
        errors: ['Failed to perform cleanup: ' + (error instanceof Error ? error.message : String(error))]
      });
    } finally {
      setIsCleaning(false);
    }
  };

  const getStorageStatus = (): { color: string; message: string; urgency: 'low' | 'medium' | 'high' } => {
    if (!storageInfo) return { color: 'gray', message: 'Unknown', urgency: 'low' };
    
    const usage = storageInfo.usagePercentage;
    
    if (usage < 50) {
      return { color: 'green', message: 'Plenty of space', urgency: 'low' };
    } else if (usage < 80) {
      return { color: 'yellow', message: 'Moderate usage', urgency: 'medium' };
    } else if (usage < 95) {
      return { color: 'orange', message: 'High usage', urgency: 'high' };
    } else {
      return { color: 'red', message: 'Critical - nearly full', urgency: 'high' };
    }
  };

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded mb-2"></div>
        <div className="h-2 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!storageInfo) {
    return (
      <div className={`text-red-600 text-sm ${className}`}>
        Failed to load storage information
      </div>
    );
  }

  const status = getStorageStatus();

  return (
    <div className={`border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-800">💾 Storage Usage</h3>
        <button
          onClick={loadStorageInfo}
          className="text-xs text-gray-500 hover:text-gray-700"
          title="Refresh storage info"
        >
          🔄
        </button>
      </div>

      {/* Storage Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{formatBytes(storageInfo.used)} used</span>
          <span>{formatBytes(storageInfo.available)} available</span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              status.color === 'green' ? 'bg-green-500' :
              status.color === 'yellow' ? 'bg-yellow-500' :
              status.color === 'orange' ? 'bg-orange-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(storageInfo.usagePercentage, 100)}%` }}
          ></div>
        </div>
        
        <div className="flex justify-between text-xs mt-1">
          <span className={`font-medium ${
            status.color === 'green' ? 'text-green-600' :
            status.color === 'yellow' ? 'text-yellow-600' :
            status.color === 'orange' ? 'text-orange-600' : 'text-red-600'
          }`}>
            {storageInfo.usagePercentage.toFixed(1)}% • {status.message}
          </span>
          <span className="text-gray-500">
            {formatBytes(storageInfo.quota)} total
          </span>
        </div>
      </div>

      {/* Warnings and Actions */}
      {status.urgency === 'high' && (
        <div className={`p-3 rounded-md mb-3 ${
          status.color === 'orange' ? 'bg-orange-50 border border-orange-200' : 'bg-red-50 border border-red-200'
        }`}>
          <p className={`text-sm font-medium ${
            status.color === 'orange' ? 'text-orange-800' : 'text-red-800'
          }`}>
            ⚠️ Storage Alert
          </p>
          <p className={`text-xs mt-1 ${
            status.color === 'orange' ? 'text-orange-700' : 'text-red-700'
          }`}>
            {status.color === 'red' 
              ? 'Storage is nearly full. New data may not be saved properly.'
              : 'Storage usage is high. Consider cleaning up old data.'
            }
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        {status.urgency !== 'low' && (
          <button
            onClick={handleCleanup}
            disabled={isCleaning}
            className={`w-full text-sm font-medium py-2 px-3 rounded-md transition-colors duration-200 ${
              status.urgency === 'high'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
            } disabled:bg-gray-400`}
          >
            {isCleaning ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                Cleaning...
              </span>
            ) : (
              '🧹 Clean Up Storage'
            )}
          </button>
        )}
        
        {/* Cleanup Results */}
        {cleanupResult && (
          <div className={`p-2 rounded-md text-xs ${
            cleanupResult.errors.length === 0
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {cleanupResult.errors.length === 0 ? (
              <p>✅ Cleanup completed: {cleanupResult.cleaned} items removed</p>
            ) : (
              <div>
                <p>❌ Cleanup failed:</p>
                <ul className="mt-1 space-y-1">
                  {cleanupResult.errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Storage Tips */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-600 mb-2">💡 Storage Tips:</p>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• Export data regularly for backup</li>
          <li>• Remove unused custom prompts</li>
          <li>• Clear old usage statistics</li>
          {status.urgency === 'high' && (
            <li className="text-red-600 font-medium">• Immediate action recommended</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default StorageQuota; 