import { useState } from 'react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCredits: number;
  requiredCredits: number;
  trigger?: 'credit_exhaustion' | 'bulk_access' | 'feature_limit' | 'manual';
}

interface PlanFeature {
  name: string;
  free: boolean | string;
  starter: boolean | string;
  professional: boolean | string;
}

const PLAN_FEATURES: PlanFeature[] = [
  {
    name: 'Monthly Credits',
    free: '10',
    starter: '100',
    professional: '500'
  },
  {
    name: 'Individual Responses',
    free: true,
    starter: true,
    professional: true
  },
  {
    name: 'Bulk Processing (Positive Reviews)',
    free: false,
    starter: true,
    professional: true
  },
  {
    name: 'Bulk Processing (All Reviews)',
    free: false,
    starter: false,
    professional: true
  },
  {
    name: 'Custom Prompts',
    free: false,
    starter: '5',
    professional: 'Unlimited'
  },
  {
    name: 'Analytics & Insights',
    free: false,
    starter: '3 months',
    professional: '12 months'
  },
  {
    name: 'Multi-Location Support',
    free: false,
    starter: '3 locations',
    professional: 'Unlimited'
  },
  {
    name: 'API Access',
    free: false,
    starter: false,
    professional: true
  },
  {
    name: 'Priority Support',
    free: false,
    starter: 'Email',
    professional: 'Email + Chat'
  }
];

const PLAN_PRICES = {
  free: { monthly: 0, yearly: 0 },
  starter: { monthly: 19, yearly: 190 }, // ~16.67/month when billed yearly
  professional: { monthly: 49, yearly: 490 } // ~40.83/month when billed yearly
};

export function UpgradeModal({ isOpen, onClose, currentCredits, requiredCredits, trigger = 'credit_exhaustion' }: UpgradeModalProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  if (!isOpen) return null;

  const getModalTitle = () => {
    switch (trigger) {
      case 'credit_exhaustion':
        return 'Credits Required';
      case 'bulk_access':
        return 'Bulk Processing Available';
      case 'feature_limit':
        return 'Feature Upgrade Required';
      default:
        return 'Upgrade Your Plan';
    }
  };

  const getModalMessage = () => {
    switch (trigger) {
      case 'credit_exhaustion':
        return `You need ${requiredCredits} credit${requiredCredits > 1 ? 's' : ''} to generate an AI response, but you only have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} remaining.`;
      case 'bulk_access':
        return 'Bulk processing allows you to generate AI responses for multiple reviews at once. Upgrade to access this powerful feature.';
      case 'feature_limit':
        return 'This feature requires a paid plan to access. Upgrade to unlock advanced functionality.';
      default:
        return 'Upgrade your plan to access more credits and advanced features.';
    }
  };

  const handleUpgrade = (plan: 'starter' | 'professional') => {
    // In a real implementation, this would integrate with Paddle or another payment processor
    console.log(`Upgrading to ${plan} plan with ${billingCycle} billing`);
    
    // For now, we'll just log and close the modal
    // TODO: Integrate with Paddle payment system
    alert(`Upgrade to ${plan} plan (${billingCycle} billing) - Payment integration coming soon!`);
    onClose();
  };

  const renderFeatureValue = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <span className="text-green-600 font-semibold">✓</span>
      ) : (
        <span className="text-gray-400">—</span>
      );
    }
    return <span className="text-gray-900 font-medium">{value}</span>;
  };

  const getRecommendedPlan = () => {
    if (trigger === 'bulk_access') return 'starter';
    if (trigger === 'feature_limit') return 'professional';
    if (currentCredits === 0 && requiredCredits <= 100) return 'starter';
    return 'professional';
  };

  const recommendedPlan = getRecommendedPlan();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{getModalTitle()}</h2>
              <p className="text-gray-600 mt-1">{getModalMessage()}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Billing Toggle */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-center">
            <div className="bg-gray-100 rounded-lg p-1 flex">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  billingCycle === 'yearly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Yearly
                <span className="ml-1 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                  Save 20%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Plans Comparison */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free Plan */}
            <div className="border border-gray-200 rounded-xl p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">Free</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">$0</span>
                  <span className="text-gray-600">/month</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">Perfect for trying out</p>
              </div>
              <div className="mt-6">
                <div className="text-center text-sm text-gray-500 py-3">
                  Current Plan
                </div>
              </div>
            </div>

            {/* Starter Plan */}
            <div className={`border-2 rounded-xl p-6 relative ${
              recommendedPlan === 'starter' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200'
            }`}>
              {recommendedPlan === 'starter' && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                    Recommended
                  </span>
                </div>
              )}
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">Starter</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">
                    ${billingCycle === 'monthly' ? PLAN_PRICES.starter.monthly : Math.round(PLAN_PRICES.starter.yearly / 12)}
                  </span>
                  <span className="text-gray-600">/month</span>
                  {billingCycle === 'yearly' && (
                    <div className="text-sm text-gray-500">
                      ${PLAN_PRICES.starter.yearly} billed yearly
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2">Great for small businesses</p>
              </div>
              <div className="mt-6">
                <button
                  onClick={() => handleUpgrade('starter')}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Upgrade to Starter
                </button>
              </div>
            </div>

            {/* Professional Plan */}
            <div className={`border-2 rounded-xl p-6 relative ${
              recommendedPlan === 'professional' 
                ? 'border-purple-500 bg-purple-50' 
                : 'border-gray-200'
            }`}>
              {recommendedPlan === 'professional' && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                    Recommended
                  </span>
                </div>
              )}
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">Professional</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">
                    ${billingCycle === 'monthly' ? PLAN_PRICES.professional.monthly : Math.round(PLAN_PRICES.professional.yearly / 12)}
                  </span>
                  <span className="text-gray-600">/month</span>
                  {billingCycle === 'yearly' && (
                    <div className="text-sm text-gray-500">
                      ${PLAN_PRICES.professional.yearly} billed yearly
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2">For growing businesses</p>
              </div>
              <div className="mt-6">
                <button
                  onClick={() => handleUpgrade('professional')}
                  className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors"
                >
                  Upgrade to Professional
                </button>
              </div>
            </div>
          </div>

          {/* Features Comparison Table */}
          <div className="mt-8">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Feature Comparison</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">Feature</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-900">Free</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-900">Starter</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-900">Professional</th>
                  </tr>
                </thead>
                <tbody>
                  {PLAN_FEATURES.map((feature, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-3 px-4 text-sm text-gray-900">{feature.name}</td>
                      <td className="py-3 px-4 text-center text-sm">
                        {renderFeatureValue(feature.free)}
                      </td>
                      <td className="py-3 px-4 text-center text-sm">
                        {renderFeatureValue(feature.starter)}
                      </td>
                      <td className="py-3 px-4 text-center text-sm">
                        {renderFeatureValue(feature.professional)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Additional Benefits */}
          <div className="mt-8 bg-gray-50 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Why Upgrade?</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h5 className="text-sm font-medium text-gray-900">Save Time</h5>
                  <p className="text-sm text-gray-600">Process multiple reviews at once with bulk operations</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h5 className="text-sm font-medium text-gray-900">Better Responses</h5>
                  <p className="text-sm text-gray-600">Create custom prompts tailored to your business</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h5 className="text-sm font-medium text-gray-900">Track Performance</h5>
                  <p className="text-sm text-gray-600">Get insights into your review response performance</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h5 className="text-sm font-medium text-gray-900">Priority Support</h5>
                  <p className="text-sm text-gray-600">Get help when you need it with dedicated support</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div>
              <span>✓ Cancel anytime</span>
              <span className="mx-2">•</span>
              <span>✓ 14-day free trial</span>
              <span className="mx-2">•</span>
              <span>✓ No setup fees</span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 