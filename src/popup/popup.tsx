import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { PopupAuthWrapper } from '../components/Auth/PopupAuthWrapper';
import { PromptSyncService } from '../services/PromptSyncService';
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

interface ValidationError {
  field: string;
  message: string;
}

type TabType = 'dashboard' | 'prompts' | 'settings' | 'help';

// Types for message communication
interface BackgroundMessage {
  type?: string;
  action?: string;
  data?: unknown;
}

interface BackgroundResponse {
  success: boolean;
  error?: string;
  data?: unknown;
  settings?: ExtensionSettings;
}

// Utility function to send messages to background script
const sendMessage = (message: BackgroundMessage): Promise<BackgroundResponse> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
};

// Header Component with Authentication
const PopupHeader: React.FC = () => {
  return (
    <div className="header text-white p-4" style={{ backgroundColor: 'oklch(0.546 0.246 262.9)' }}>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">AI Review Responder</h1>
          <p className="text-xs opacity-90">OpenAI-Powered Response Generation via Secure Cloud Backend</p>
        </div>
      </div>
    </div>
  );
};

// Tab Icon Components
const DashboardIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6a2 2 0 01-2 2H10a2 2 0 01-2-2V5z" />
  </svg>
);

const PromptsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const SettingsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const HelpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// Tab Navigation Component
const TabNavigation: React.FC<{
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: DashboardIcon },
    { id: 'prompts' as TabType, label: 'Prompts', icon: PromptsIcon },
    { id: 'settings' as TabType, label: 'Settings', icon: SettingsIcon },
    { id: 'help' as TabType, label: 'Help', icon: HelpIcon }
  ];

  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-2 px-2 text-sm font-medium leading-none text-center transition-all duration-200 focus-ai rounded-t-md mx-0.5 ${
              isActive
                ? 'tab-active bg-blue-50 dark:bg-slate-800 border-b-2 border-blue-500 dark:border-blue-400'
                : 'tab-inactive hover:bg-slate-100 dark:hover:bg-slate-700 border-b-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <Icon className={`w-5 h-5 ${isActive ? 'tab-icon-active' : 'tab-icon-inactive'}`} />
              <span>{tab.label}</span>
            </div>
          </button>
        );
      })}
    </nav>
  );
};

// Fixed Footer Component
const PopupFooter: React.FC = () => {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-3 z-50">
      <div className="flex items-center justify-end">
        {user && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Signed in as: <span className="font-medium text-slate-700 dark:text-slate-300">{user.displayName || user.email}</span>
            </p>
            <button
              onClick={handleSignOut}
              className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 rounded transition-colors text-slate-700 dark:text-slate-300"
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

// Dashboard Tab Component
const DashboardTab: React.FC<{
  onShowUpgrade: () => void;
}> = ({ onShowUpgrade }) => {
  return (
    <div className="space-y-6">
      {/* Credit Management Section */}
      <div>
        <h3 className="text-xl font-semibold leading-tight text-slate-700 dark:text-slate-300 mb-4">Credit Management</h3>
        <CreditDisplay onUpgradeClick={onShowUpgrade} />
      </div>
    </div>
  );
};

// Prompts Tab Component
const PromptsTab: React.FC<{
  settings: ExtensionSettings | null;
  onUpdateSettings: (settings: ExtensionSettings) => void;
  validationErrors: ValidationError[];
}> = ({ settings, onUpdateSettings, validationErrors }) => {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<{ [key: string]: string }>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold leading-tight text-slate-700 dark:text-slate-300">Response Templates</h2>
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
        </div>
        <div className="card p-6">
          
          {hasUnsavedChanges && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <p className="text-sm font-medium leading-relaxed text-amber-700 dark:text-amber-300">
                Warning: You have unsaved changes. Click "Save Prompts" to apply them.
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

  const handleSettingChange = (key: string, value: string | number | boolean) => {
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
      <div>
        <h2 className="text-xl font-semibold leading-snug text-slate-700 dark:text-slate-300 mb-4">Trust Modes</h2>
        <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="individual"
                checked={settings.trustModes.individual}
                onChange={(e) => handleTrustModeChange('individual', e.target.checked)}
                className="mt-1 rounded text-blue-600 focus-ai"
                aria-label="Individual Trust Mode"
              />
              <div>
                <label htmlFor="individual" className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300">
                  Individual Trust Mode
                </label>
                <p className="text-xs font-normal leading-normal text-slate-600 dark:text-slate-400">
                  Automatically post AI-generated responses for individual reviews without preview
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="bulkPositive"
                checked={settings.trustModes.bulkPositive}
                onChange={(e) => handleTrustModeChange('bulkPositive', e.target.checked)}
                className="mt-1 rounded text-blue-600 focus-ai"
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
                className="mt-1 rounded text-blue-600 focus-ai"
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
      </div>

      {/* AI Response Settings */}
      <div>
        <h2 className="text-xl font-semibold leading-snug text-slate-700 dark:text-slate-300 mb-4">AI Response Settings</h2>
        <div className="card p-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300 mb-2">
                Response Creativity: {settings.temperature}
              </label>
              <input
                type="range"
                min="0" max="1" step="0.1"
                value={settings.temperature}
                onChange={(e) => handleSettingChange('temperature', parseFloat(e.target.value))}
                className="w-full accent-blue-500 focus-ai"
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
                className="w-full accent-blue-500 focus-ai"
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
      </div>

      {/* Bulk Processing Settings */}
      <div>
        <h2 className="text-xl font-semibold leading-snug text-slate-700 dark:text-slate-300 mb-4">Bulk Processing Settings</h2>
        <div className="card p-4">
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
                className="w-full accent-blue-500 focus-ai"
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
                className="w-full accent-blue-500 focus-ai"
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
      </div>

    </div>
  );
};

// Help Tab Component
const HelpTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold leading-tight text-slate-700 dark:text-slate-300 mb-4">Getting Started</h3>
        <div className="card p-6">
          <ol className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300 space-y-4 list-decimal list-inside">
            <li>Navigate to your Google My Business reviews page</li>
            <li>The extension will automatically detect reviews</li>
            <li>Click the "Generate AI Response" button on any review</li>
            <li>Review and edit the generated response if needed</li>
            <li>Click "Post Response" to publish your reply</li>
          </ol>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold leading-tight text-slate-700 dark:text-slate-300 mb-4">AI Features</h3>
        <div className="card p-6">
          <ul className="text-xs font-normal leading-relaxed text-slate-700 dark:text-slate-300 space-y-4 list-disc list-inside">
            <li>Pre-configured with professional API key</li>
            <li>Google Gemini AI for high-quality responses</li>
            <li>Smart response generation based on star ratings</li>
            <li>Advanced validation and quality checks</li>
            <li>Automatic fallback responses for reliability</li>
          </ul>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold leading-tight text-slate-700 dark:text-slate-300 mb-4">Trust Modes Explained</h2>
        <div className="card p-6">
          <div className="space-y-6 text-sm font-normal leading-relaxed">
            <div>
              <h4 className="font-medium text-blue-600 dark:text-blue-400">Individual Trust Mode</h4>
              <p className="text-slate-700 dark:text-slate-300 mt-1">Perfect for getting started. Review each AI response before posting.</p>
            </div>
            <div>
              <h4 className="font-medium text-blue-600 dark:text-blue-400">Bulk Positive (4-5 Stars)</h4>
              <p className="text-slate-700 dark:text-slate-300 mt-1">Automatically respond to positive reviews. Safe for most businesses.</p>
            </div>
            <div>
              <h4 className="font-medium text-blue-600 dark:text-blue-400">Bulk All Reviews</h4>
              <p className="text-slate-700 dark:text-slate-300 mt-1">Full automation. Use only when you're confident in your templates.</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold leading-tight text-slate-700 dark:text-slate-300 mb-4">Best Practices</h2>
        <div className="card p-6">
          <ul className="text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300 space-y-4 list-disc list-inside">
            <li>Customize your response templates for each star rating</li>
            <li>Use the reviewer's name when available for personalization</li>
            <li>Keep responses professional and empathetic</li>
            <li>Address specific concerns mentioned in negative reviews</li>
            <li>Always end on a positive, forward-looking note</li>
            <li>Monitor your responses regularly, even in bulk modes</li>
          </ul>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold leading-tight text-slate-800 dark:text-slate-200 mb-4">Troubleshooting</h2>
        <div className="card p-6 bg-slate-50 dark:bg-slate-800">
          <div className="space-y-4 text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300">
            <p><strong>Extension not working?</strong> Try refreshing the Google My Business page.</p>
            <p><strong>No response generated?</strong> Check your internet connection and try again.</p>
            <p><strong>Response quality issues?</strong> Adjust the creativity setting in Settings.</p>
            <p><strong>Need help?</strong> Contact our support team through the SaaS dashboard.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Popup Component (Authenticated Content)
const AuthenticatedPopupApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [creditInfo, setCreditInfo] = useState<{ available: number; required: number }>({ available: 0, required: 1 });

  useEffect(() => {
    loadSettings();
    loadCreditInfo();
  }, []);

  const loadCreditInfo = async () => {
    try {
      const response = await sendMessage({ 
        action: 'checkCredits', 
        data: { operation: 'status_check' } 
      });
      
      if (response && response.success && response.data) {
        const data = response.data as { available?: number; required?: number };
        setCreditInfo({
          available: data.available || 0,
          required: data.required || 1
        });
      }
    } catch (error) {
      console.error('Failed to load credit info:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await sendMessage({ type: 'GET_SETTINGS' });
      if (response.success && response.settings) {
        setSettings(response.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
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
        <div className="p-2">
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto pb-16 bg-slate-50 dark:bg-slate-900">

        {activeTab === 'dashboard' && (
          <DashboardTab
            onShowUpgrade={handleShowUpgrade}
          />
        )}

        {activeTab === 'prompts' && (
          <PromptsTab
            settings={settings}
            onUpdateSettings={updateSettings}
            validationErrors={validationErrors}
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

      {/* Fixed Footer */}
      <PopupFooter
      />

      {isLoading && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="card p-6 shadow-lg">
            <div className="loading-spinner h-8 w-8 mx-auto"></div>
            <p className="mt-4 text-sm font-normal leading-relaxed text-slate-600 dark:text-slate-400">Saving settings...</p>
          </div>
        </div>
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
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