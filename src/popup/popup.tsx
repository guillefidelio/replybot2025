import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { PopupAuthWrapper } from '../components/Auth/PopupAuthWrapper';
import { PromptSyncService } from '../services/PromptSyncService';
import DataManager from '../components/DataManager';
import StorageQuota from '../components/StorageQuota';
import { CreditDisplay } from '../components/CreditDisplay';
import { UpgradeModal } from '../components/UpgradeModal';
import '../index.css';


// Types
interface ExtensionSettings {
  prompts: { [key: string]: string };
  trustModes: {
    individual: boolean;
    bulkPositive: boolean;
    bulkFull: boolean;
  };
  rateLimit: number;
  model: string;
  temperature: number;
  maxTokens: number;
  maxPages: number;
}

interface ApiStatus {
  isConnected: boolean;
  lastCheck?: Date;
  error?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

type TabType = 'dashboard' | 'prompts' | 'settings' | 'help';

// Utility function to send messages to background script
const sendMessage = (message: any): Promise<any> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
};

// Header Component with Authentication
const PopupHeader: React.FC = () => {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  return (
    <div className="header bg-gradient-to-r from-violet-600 to-blue-600 text-white p-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">AI Review Responder</h1>
          <p className="text-sm opacity-90">OpenAI-Powered Response Generation via Secure Cloud Backend</p>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs opacity-90">Signed in as:</p>
              <p className="text-sm font-medium">{user.displayName || user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition-colors"
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Tab Navigation Component
const TabNavigation: React.FC<{
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: '📊' },
    { id: 'prompts' as TabType, label: 'Prompts', icon: '📝' },
    { id: 'settings' as TabType, label: 'Settings', icon: '⚙️' },
    { id: 'help' as TabType, label: 'Help', icon: '❓' }
  ];

  return (
    <nav className="flex">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-2 px-3 text-sm font-medium leading-none text-center transition-colors duration-200 focus-ai ${
            activeTab === tab.id
              ? 'tab-active bg-violet-50 dark:bg-slate-800'
              : 'tab-inactive hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="block text-sm">{tab.icon}</span>
          <span className="block">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

// Dashboard Tab Component
const DashboardTab: React.FC<{
  settings: ExtensionSettings | null;
  apiStatus: ApiStatus;
  onTestConnection: () => void;
  onUpdateSettings: (settings: ExtensionSettings) => void;
  onShowUpgrade: () => void;
}> = ({ settings, apiStatus, onTestConnection, onUpdateSettings, onShowUpgrade }) => {
  return (
    <div className="space-y-6">
      {/* Credit Management Section */}
      <div className="card p-6 border border-violet-200 dark:border-violet-700">
        <h2 className="text-2xl font-semibold leading-tight text-violet-700 dark:text-violet-300 mb-6">💳 Credit Management</h2>
        <CreditDisplay onUpgradeClick={onShowUpgrade} />
      </div>

      <div className="card p-6 border border-violet-200 dark:border-violet-700">
        <h2 className="text-2xl font-semibold leading-tight text-violet-700 dark:text-violet-300 mb-6">🚀 Extension Status</h2>
        <div className="grid grid-cols-2 gap-4 text-sm font-normal leading-relaxed">
          <div>
            <p className="text-slate-600 dark:text-slate-400">Extension:</p>
            <p className="font-medium text-emerald-600 dark:text-emerald-400">Active</p>
          </div>
          <div>
            <p className="text-slate-600 dark:text-slate-400">Cloud Function:</p>
            <p className={`font-medium ${apiStatus.isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {apiStatus.isConnected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
          <div>
            <p className="text-slate-600 dark:text-slate-400">Prompts Configured:</p>
            <p className="font-medium text-violet-600 dark:text-violet-400">
              {settings?.prompts ? Object.keys(settings.prompts).length : 0}/5
            </p>
          </div>
          <div>
            <p className="text-slate-600 dark:text-slate-400">Trust Modes:</p>
            <p className="font-medium text-violet-600 dark:text-violet-400">
              {settings?.trustModes ? Object.values(settings.trustModes).filter(Boolean).length : 0}/3
            </p>
          </div>
        </div>
        <button
          onClick={onTestConnection}
          className="mt-6 w-full btn-primary"
        >
          Test API Connection
        </button>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-medium leading-snug text-violet-700 dark:text-violet-300 mb-4">🔑 Secure Backend Configuration</h3>
        <ul className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300 space-y-3">
          <li className="flex items-start gap-2"><span>•</span><span>Secure Google Cloud Function proxy</span></li>
          <li className="flex items-start gap-2"><span>•</span><span>OpenAI API key stored securely in cloud</span></li>
          <li className="flex items-start gap-2"><span>•</span><span>No API key required from users</span></li>
          <li className="flex items-start gap-2"><span>•</span><span>Professional-grade AI responses</span></li>
        </ul>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-medium leading-snug text-violet-700 dark:text-violet-300 mb-4">⚡ Quick Actions</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300">Individual Trust Mode</span>
            <input
              type="checkbox"
              checked={settings?.trustModes?.individual || false}
              onChange={(e) => {
                if (settings) {
                  onUpdateSettings({
                    ...settings,
                    trustModes: {
                      ...settings.trustModes,
                      individual: e.target.checked
                    }
                  });
                }
              }}
              className="rounded text-violet-600 focus-ai cursor-pointer"
              aria-label="Individual Trust Mode"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300">Bulk Positive (4-5★)</span>
            <input
              type="checkbox"
              checked={settings?.trustModes?.bulkPositive || false}
              onChange={(e) => {
                if (settings) {
                  onUpdateSettings({
                    ...settings,
                    trustModes: {
                      ...settings.trustModes,
                      bulkPositive: e.target.checked
                    }
                  });
                }
              }}
              className="rounded text-violet-600 focus-ai cursor-pointer"
              aria-label="Bulk Positive Reviews Trust Mode"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300">Bulk All Reviews</span>
            <input
              type="checkbox"
              checked={settings?.trustModes?.bulkFull || false}
              onChange={(e) => {
                if (settings) {
                  onUpdateSettings({
                    ...settings,
                    trustModes: {
                      ...settings.trustModes,
                      bulkFull: e.target.checked
                    }
                  });
                }
              }}
              className="rounded text-violet-600 focus-ai cursor-pointer"
              aria-label="Bulk All Reviews Trust Mode"
            />
          </div>
        </div>
      </div>

      {apiStatus.error && (
        <div className="card p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <h3 className="text-lg font-medium leading-snug text-red-800 dark:text-red-300 mb-2">⚠️ Connection Error</h3>
          <p className="text-sm font-normal leading-relaxed text-red-700 dark:text-red-400">{apiStatus.error}</p>
        </div>
      )}
    </div>
  );
};

// Prompts Tab Component
const PromptsTab: React.FC<{
  settings: ExtensionSettings | null;
  onUpdateSettings: (settings: ExtensionSettings) => void;
  validationErrors: ValidationError[];
  onShowDataManager: () => void;
}> = ({ settings, onUpdateSettings, validationErrors, onShowDataManager }) => {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<{ [key: string]: string }>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState(PromptSyncService.getSyncStatus());

  useEffect(() => {
    // Subscribe to sync status changes
    const unsubscribe = PromptSyncService.onSyncStatusChange(setSyncStatus);
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Load effective prompts (local or defaults)
    const loadPrompts = async () => {
      try {
        const effectivePrompts = await PromptSyncService.getEffectivePrompts();
        setPrompts(effectivePrompts);
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Error loading prompts:', error);
        // Fallback to settings prompts if available
        if (settings?.prompts) {
          setPrompts(settings.prompts);
        }
      }
    };

    loadPrompts();
  }, [settings, user]);

  const handlePromptChange = (rating: string, value: string) => {
    const newPrompts = { ...prompts, [rating]: value };
    setPrompts(newPrompts);
    setHasUnsavedChanges(true);
  };

  const handleSavePrompts = async () => {
    if (!user) {
      console.error('User not authenticated');
      return;
    }
    
    setIsSaving(true);
    try {
      // Use the prompt sync service for authenticated users
      await PromptSyncService.savePrompts(user, prompts);
      setHasUnsavedChanges(false);
      
      // Also update legacy settings for backward compatibility
      if (settings) {
        await onUpdateSettings({
          ...settings,
          prompts
        });
      }
    } catch (error) {
      console.error('Failed to save prompts:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const ratingLabels = {
    '5_text': '⭐⭐⭐⭐⭐ 5-Star Reviews (with text)',
    '5_no_text': '⭐⭐⭐⭐⭐ 5-Star Reviews (no text)',
    '4_text': '⭐⭐⭐⭐ 4-Star Reviews (with text)',
    '4_no_text': '⭐⭐⭐⭐ 4-Star Reviews (no text)',
    '3_text': '⭐⭐⭐ 3-Star Reviews (with text)',
    '3_no_text': '⭐⭐⭐ 3-Star Reviews (no text)',
    '2_text': '⭐⭐ 1-2 Star Reviews (with text)',
    '2_no_text': '⭐⭐ 1-2 Star Reviews (no text)'
  };

  const getError = (field: string) => validationErrors.find(e => e.field === field);

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-2xl font-semibold leading-tight text-violet-700 dark:text-violet-300 mb-4">📝 Response Templates</h2>
        <p className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300 mb-6">
          Customize your response templates for different star ratings and review types. The AI will use these as guidelines.
        </p>
        
        {/* Sync Status Indicator */}
        {user && (
          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {syncStatus.isSyncing ? (
                  <>
                    <div className="loading-spinner h-4 w-4"></div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">Syncing to cloud...</span>
                  </>
                ) : syncStatus.error ? (
                  <>
                    <span className="text-red-500">⚠️</span>
                    <span className="text-sm text-red-600 dark:text-red-400">Sync error</span>
                  </>
                ) : syncStatus.hasUnsavedChanges ? (
                  <>
                    <span className="text-yellow-500">●</span>
                    <span className="text-sm text-yellow-600 dark:text-yellow-400">Unsaved changes</span>
                  </>
                ) : (
                  <>
                    <span className="text-green-500">✓</span>
                    <span className="text-sm text-green-600 dark:text-green-400">Synced to cloud</span>
                  </>
                )}
              </div>
              {syncStatus.lastSync && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {syncStatus.lastSync.toLocaleTimeString()}
                </span>
              )}
            </div>
            {syncStatus.error && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{syncStatus.error}</p>
            )}
          </div>
        )}

        <div className="flex gap-4 mb-6">
          <button
            onClick={handleSavePrompts}
            disabled={!hasUnsavedChanges || isSaving || !user}
            className={`btn-primary ${
              hasUnsavedChanges && !isSaving && user
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? 'Saving & Syncing...' : !user ? 'Sign in to save' : hasUnsavedChanges ? 'Save & Sync' : 'Saved'}
          </button>
          <button
            onClick={onShowDataManager}
            className="btn-secondary"
          >
            Import/Export
          </button>
        </div>
        
        {hasUnsavedChanges && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <p className="text-sm font-medium leading-relaxed text-amber-700 dark:text-amber-300">
              ⚠️ You have unsaved changes. Click "Save Prompts" to apply them.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {Object.entries(ratingLabels).map(([rating, label]) => {
            const error = getError(`prompt_${rating}`);
            return (
              <div key={rating} className="space-y-3">
                <label className="block text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300">
                  {label}
                </label>
                <textarea
                  value={prompts[rating] || ''}
                  onChange={(e) => handlePromptChange(rating, e.target.value)}
                  placeholder={`Enter your response template for ${label.toLowerCase()}...`}
                  className={`input-field resize-y text-sm font-normal leading-relaxed min-h-20 ${
                    error ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20' : ''
                  }`}
                  rows={3}
                  maxLength={5500}
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-normal leading-normal text-slate-500 dark:text-slate-400">
                    {(prompts[rating] || '').length}/5500 characters
                  </span>
                  {error && (
                    <span className="text-xs font-normal leading-normal text-red-600 dark:text-red-400">{error.message}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-6 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700">
        <h3 className="text-lg font-medium leading-snug text-violet-700 dark:text-violet-300 mb-4">💡 Template Tips</h3>
        <ul className="space-y-3 text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300">
          <li className="flex items-start space-x-3">
            <span className="text-violet-500 dark:text-violet-400 mt-0.5">•</span>
            <span>The AI uses these as guidelines and personalizes each response</span>
          </li>
          <li className="flex items-start space-x-3">
            <span className="text-violet-500 dark:text-violet-400 mt-0.5">•</span>
            <span><strong>"With text"</strong> prompts are for reviews that include written feedback</span>
          </li>
          <li className="flex items-start space-x-3">
            <span className="text-violet-500 dark:text-violet-400 mt-0.5">•</span>
            <span><strong>"No text"</strong> prompts are for reviews with only star ratings</span>
          </li>
          <li className="flex items-start space-x-3">
            <span className="text-violet-500 dark:text-violet-400 mt-0.5">•</span>
            <span>Keep templates concise - the AI will expand and personalize them</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

// Settings Tab Component
const SettingsTab: React.FC<{
  settings: ExtensionSettings | null;
  onUpdateSettings: (settings: ExtensionSettings) => void;
}> = ({ settings, onUpdateSettings }) => {
  if (!settings) {
    return (
        <div className="flex items-center justify-center h-full">
            <div className="loading-spinner h-8 w-8"></div>
        </div>
    );
  }

  const handleSettingChange = (key: string, value: any) => {
    onUpdateSettings({
      ...settings,
      [key]: value
    });
  };

  const handleTrustModeChange = (mode: string, checked: boolean) => {
    onUpdateSettings({
      ...settings,
      trustModes: {
        ...settings.trustModes,
        [mode]: checked
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Trust Modes Section */}
      <div className="card p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <h2 className="text-xl font-semibold leading-snug text-violet-700 dark:text-violet-300 mb-3">🛡️ Trust Modes</h2>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              id="individual"
              checked={settings.trustModes.individual}
              onChange={(e) => handleTrustModeChange('individual', e.target.checked)}
              className="mt-1 rounded text-violet-600 focus-ai"
              aria-label="Individual Trust Mode"
            />
            <div>
              <label htmlFor="individual" className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300">
                Individual Trust Mode
              </label>
              <p className="text-xs font-normal leading-normal text-slate-600 dark:text-slate-400">
                Manually approve each AI-generated response before posting
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              id="bulkPositive"
              checked={settings.trustModes.bulkPositive}
              onChange={(e) => handleTrustModeChange('bulkPositive', e.target.checked)}
              className="mt-1 rounded text-violet-600 focus-ai"
              aria-label="Bulk Positive Reviews Trust Mode"
            />
            <div>
              <label htmlFor="bulkPositive" className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300">
                Bulk Positive (4-5 Stars)
              </label>
              <p className="text-xs font-normal leading-normal text-slate-600 dark:text-slate-400">
                Automatically respond to positive reviews. Safe for most businesses.
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              id="bulkFull"
              checked={settings.trustModes.bulkFull}
              onChange={(e) => handleTrustModeChange('bulkFull', e.target.checked)}
              className="mt-1 rounded text-violet-600 focus-ai"
              aria-label="Bulk All Reviews Trust Mode"
            />
            <div>
              <label htmlFor="bulkFull" className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300">
                Bulk All Reviews
              </label>
              <p className="text-xs font-normal leading-normal text-slate-600 dark:text-slate-400">
                Automatically post responses to all reviews (use with caution)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Response Settings */}
      <div className="card p-4">
        <h2 className="text-xl font-semibold leading-snug text-violet-700 dark:text-violet-300 mb-3">🤖 AI Response Settings</h2>
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">🔒 Secure Cloud Backend</h4>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              Your extension uses OpenAI gpt-4o-mini via our secure Google Cloud Function. 
              No API key required from you - everything is managed securely in the cloud.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300 mb-2">
              Response Creativity: {settings.temperature}
            </label>
            <input
              type="range"
              min="0" max="1" step="0.1"
              value={settings.temperature}
              onChange={(e) => handleSettingChange('temperature', parseFloat(e.target.value))}
              className="w-full accent-violet-600 focus-ai"
              aria-label="Response Creativity Level"
            />
            <div className="flex justify-between text-xs font-normal leading-normal text-slate-500 dark:text-slate-400 mt-1">
              <span>Conservative</span>
              <span>Balanced</span>
              <span>Creative</span>
            </div>
            <p className="text-xs font-normal leading-normal text-slate-600 dark:text-slate-400 mt-2">
              Higher values make responses more creative and varied, lower values make them more focused and consistent.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300 mb-2">
              Max Response Length: {settings.maxTokens} tokens
            </label>
            <input
              type="range"
              min="100" max="1000" step="50"
              value={settings.maxTokens}
              onChange={(e) => handleSettingChange('maxTokens', parseInt(e.target.value))}
              className="w-full accent-violet-600 focus-ai"
              aria-label="Maximum Response Length"
            />
            <div className="flex justify-between text-xs font-normal leading-normal text-slate-500 dark:text-slate-400 mt-1">
              <span>Short</span>
              <span>Medium</span>
              <span>Long</span>
            </div>
            <p className="text-xs font-normal leading-normal text-slate-600 dark:text-slate-400 mt-2">
              Longer responses provide more detail but may be less concise. Most businesses prefer 200-400 tokens.
            </p>
          </div>
        </div>
      </div>

            {/* Bulk Processing Settings */}
      <div className="card p-4">
        <h2 className="text-xl font-semibold leading-snug text-violet-700 dark:text-violet-300 mb-3">🚀 Bulk Processing Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300 mb-2">
              Delay Between Requests: {Math.round(settings.rateLimit / 1000)}s
            </label>
            <input
              type="range"
              min="5" max="30" step="1"
              value={Math.round(settings.rateLimit / 1000)}
              onChange={(e) => handleSettingChange('rateLimit', parseInt(e.target.value) * 1000)}
              className="w-full accent-violet-600 focus-ai"
              aria-label="Rate Limiting Delay"
            />
            <div className="flex justify-between text-xs font-normal leading-normal text-slate-500 dark:text-slate-400 mt-1">
              <span>5s</span>
              <span>15s</span>
              <span>30s</span>
            </div>
            <p className="text-xs font-normal leading-normal text-slate-700 dark:text-slate-300 mt-2">
              Prevents overwhelming Google's servers and reduces risk of rate limiting
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300 mb-2">
              Default Pages to Process: {settings.maxPages}
            </label>
            <input
              type="range"
              min="1" max="10" step="1"
              value={settings.maxPages}
              onChange={(e) => handleSettingChange('maxPages', parseInt(e.target.value))}
              className="w-full accent-violet-600 focus-ai"
              aria-label="Default Pages to Process"
            />
            <div className="flex justify-between text-xs font-normal leading-normal text-slate-500 dark:text-slate-400 mt-1">
              <span>1 page</span>
              <span>5 pages</span>
              <span>10 pages</span>
            </div>
            <p className="text-xs font-normal leading-normal text-slate-700 dark:text-slate-300 mt-2">
              Default number of review pages to process in bulk operations. You can override this in the bulk controls.
            </p>
          </div>
        </div>
      </div>

      {/* Storage Quota */}
      <StorageQuota />
    </div>
  );
};

// Help Tab Component
const HelpTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-2xl font-semibold leading-tight text-violet-700 dark:text-violet-300 mb-6">🚀 Getting Started</h2>
        <ol className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300 space-y-4 list-decimal list-inside">
          <li>Navigate to your Google My Business reviews page</li>
          <li>The extension will automatically detect reviews</li>
          <li>Click the "Generate AI Response" button on any review</li>
          <li>Review and edit the generated response if needed</li>
          <li>Click "Post Response" to publish your reply</li>
        </ol>
      </div>

      <div className="card p-6">
        <h2 className="text-2xl font-semibold leading-tight text-violet-700 dark:text-violet-300 mb-6">🤖 AI Features</h2>
        <ul className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300 space-y-4 list-disc list-inside">
          <li>Pre-configured with professional API key</li>
          <li>Google Gemini AI for high-quality responses</li>
          <li>Smart response generation based on star ratings</li>
          <li>Advanced validation and quality checks</li>
          <li>Automatic fallback responses for reliability</li>
        </ul>
      </div>

      <div className="card p-6">
        <h2 className="text-2xl font-semibold leading-tight text-violet-700 dark:text-violet-300 mb-6">🛡️ Trust Modes Explained</h2>
        <div className="space-y-6 text-sm font-normal leading-relaxed">
          <div>
            <h4 className="font-medium text-violet-600 dark:text-violet-400">Individual Trust Mode</h4>
            <p className="text-slate-700 dark:text-slate-300 mt-1">Perfect for getting started. Review each AI response before posting.</p>
          </div>
          <div>
            <h4 className="font-medium text-violet-600 dark:text-violet-400">Bulk Positive (4-5 Stars)</h4>
            <p className="text-slate-700 dark:text-slate-300 mt-1">Automatically respond to positive reviews. Safe for most businesses.</p>
          </div>
          <div>
            <h4 className="font-medium text-violet-600 dark:text-violet-400">Bulk All Reviews</h4>
            <p className="text-slate-700 dark:text-slate-300 mt-1">Full automation. Use only when you're confident in your templates.</p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-2xl font-semibold leading-tight text-violet-700 dark:text-violet-300 mb-6">💡 Best Practices</h2>
        <ul className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300 space-y-4 list-disc list-inside">
          <li>Customize your response templates for each star rating</li>
          <li>Use the reviewer's name when available for personalization</li>
          <li>Keep responses professional and empathetic</li>
          <li>Address specific concerns mentioned in negative reviews</li>
          <li>Always end on a positive, forward-looking note</li>
          <li>Monitor your responses regularly, even in bulk modes</li>
        </ul>
      </div>

      <div className="card p-6 bg-slate-50 dark:bg-slate-800">
        <h2 className="text-2xl font-semibold leading-tight text-slate-800 dark:text-slate-200 mb-6">🔧 Troubleshooting</h2>
        <div className="space-y-4 text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300">
          <p><strong>Extension not working?</strong> Try refreshing the Google My Business page.</p>
          <p><strong>No response generated?</strong> Check your internet connection and try again.</p>
          <p><strong>Response quality issues?</strong> Adjust the creativity setting in Settings.</p>
          <p><strong>Need help?</strong> Contact our support team through the SaaS dashboard.</p>
        </div>
      </div>
    </div>
  );
};

// Main Popup Component (Authenticated Content)
const AuthenticatedPopupApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ isConnected: false });
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showDataManager, setShowDataManager] = useState<boolean>(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [creditInfo, setCreditInfo] = useState<{ available: number; required: number }>({ available: 0, required: 1 });

  useEffect(() => {
    loadSettings();
    checkApiConnection();
    loadCreditInfo();
  }, []);

  const loadCreditInfo = async () => {
    try {
      const response = await sendMessage({ 
        action: 'checkCredits', 
        data: { operation: 'status_check' } 
      });
      
      if (response && response.success) {
        setCreditInfo({
          available: response.data.available || 0,
          required: response.data.required || 1
        });
      }
    } catch (error) {
      console.error('Failed to load credit info:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await sendMessage({ type: 'GET_SETTINGS' });
      if (response.success) {
        setSettings(response.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const checkApiConnection = async () => {
    try {
      setApiStatus(prev => ({ ...prev, isConnected: false, error: undefined }));
      const response = await sendMessage({ type: 'TEST_API_CONNECTION' });
      
      setApiStatus({
        isConnected: response.success,
        lastCheck: new Date(),
        error: response.success ? undefined : (response.error || 'Connection failed')
      });
    } catch (error) {
      setApiStatus({
        isConnected: false,
        lastCheck: new Date(),
        error: 'Connection test failed'
      });
    }
  };

  const updateSettings = async (newSettings: ExtensionSettings) => {
    try {
      setIsLoading(true);
      setValidationErrors([]);
      
      const response = await sendMessage({ 
        type: 'SAVE_SETTINGS', 
        data: newSettings 
      });
      
      if (response.success) {
        setSettings(newSettings);
      } else {
        console.error('Failed to save settings:', response.error);
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = () => {
    checkApiConnection();
  };

  const handleShowUpgrade = () => {
    setShowUpgradeModal(true);
  };

  const handleCloseUpgrade = () => {
    setShowUpgradeModal(false);
    // Refresh credit info after potential upgrade
    loadCreditInfo();
  };

  return (
    <div className="extension-popup">
      <PopupHeader />

      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto">

        {activeTab === 'dashboard' && (
          <DashboardTab
            settings={settings}
            apiStatus={apiStatus}
            onTestConnection={handleTestConnection}
            onUpdateSettings={updateSettings}
            onShowUpgrade={handleShowUpgrade}
          />
        )}

        {activeTab === 'prompts' && (
          <PromptsTab
            settings={settings}
            onUpdateSettings={updateSettings}
            validationErrors={validationErrors}
            onShowDataManager={() => setShowDataManager(true)}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onUpdateSettings={updateSettings}
          />
        )}

        {activeTab === 'help' && <HelpTab />}
        </div>
      </div>

      {isLoading && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="card p-6 shadow-lg">
            <div className="loading-spinner h-8 w-8 mx-auto"></div>
            <p className="mt-4 text-sm font-normal leading-relaxed text-slate-600 dark:text-slate-400">Saving settings...</p>
          </div>
        </div>
      )}

      {showDataManager && (
        <DataManager onClose={() => setShowDataManager(false)} />
      )}

      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={handleCloseUpgrade}
          currentCredits={creditInfo.available}
          requiredCredits={creditInfo.required}
          trigger="manual"
        />
      )}
    </div>
  );
};

// Main Popup Component with Authentication
const PopupApp: React.FC = () => {
  const { user, loading } = useAuth();

  // Show loading spinner while checking authentication state
  if (loading) {
    return (
      <div className="extension-popup flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Conditional rendering based on authentication state
  return user ? <AuthenticatedPopupApp /> : <PopupAuthWrapper />;
};

// Initialize the popup with AuthProvider
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <AuthProvider>
      <PopupApp />
    </AuthProvider>
  );
}