// src/components/UpgradeModal.tsx
import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext'; // Corrected path
import type { UserProfile } from '../types/firebase'; // Corrected path, type-only
import type { SubscriptionPlan } from '../types/payment'; // Corrected path, type-only
// import { DEFAULT_FREE_PLAN } from '../types/payment'; // Removed unused DEFAULT_FREE_PLAN
// import './UpgradeModal.css';

declare global {
  interface Window {
    Paddle: any;
  }
}

// Define a minimal AuthContextType if not properly defined elsewhere for 'user'
// This is illustrative. The actual AuthContext should provide this.
interface MinimalAuthContextType {
  user: { uid: string; email?: string | null; } | null;
  // Add other properties like loading, signIn, signOut if they exist in your actual AuthContext
}

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const examplePlans: SubscriptionPlan[] = [
  {
    id: 'premium_monthly',
    name: 'Premium Monthly',
    price: 1000,
    currency: 'USD',
    credits: 200,
    features: ['All AI Features', '200 Credits/Month', 'Priority Support']
  },
  {
    id: 'premium_yearly',
    name: 'Premium Yearly',
    price: 10000,
    currency: 'USD',
    credits: 2500,
    features: ['All AI Features', '2500 Credits/Year', 'Priority Support', 'Save 16%']
  },
  {
    id: 'credit_pack_small',
    name: 'Credit Pack (50)',
    price: 500,
    currency: 'USD',
    credits: 50,
    features: ['One-time purchase', '50 Credits']
  }
];

const PADDLE_VENDOR_ID = parseInt(process.env.REACT_APP_PADDLE_VENDOR_ID || 'YOUR_PADDLE_VENDOR_ID_HERE', 10);
const PADDLE_ENVIRONMENT = process.env.REACT_APP_PADDLE_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'live';


const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
  const { user } = useContext(AuthContext as React.Context<MinimalAuthContextType>); // Typed context
  const [isPaddleLoading, setIsPaddleLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [paddleError, setPaddleError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (window.Paddle) {
      setIsPaddleLoading(false);
      if (PADDLE_ENVIRONMENT === 'sandbox') {
        window.Paddle.Environment.set('sandbox');
      }
      window.Paddle.Setup({ vendor: PADDLE_VENDOR_ID });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/paddle.js';
    script.async = true;
    script.onload = () => {
      setIsPaddleLoading(false);
      if (PADDLE_ENVIRONMENT === 'sandbox') {
        window.Paddle.Environment.set('sandbox');
      }
      window.Paddle.Setup({ vendor: PADDLE_VENDOR_ID });
      console.log('Paddle.js loaded and setup.');
    };
    script.onerror = () => {
      console.error('Failed to load Paddle.js');
      setIsPaddleLoading(false);
      setPaddleError('Payment system could not be loaded. Please try again later.');
    };
    document.body.appendChild(script);

  }, []);

  useEffect(() => {
      if (user) {
          setUserProfile({
              uid: user.uid,
              email: user.email || '',
              credits: 0,
              activeFeatures: [],
              createdAt: new Date(),
              lastLoginAt: new Date(),
              // Ensure all fields from UserProfile are present or optional
              // If UserPaymentProfile fields are mandatory, they need defaults here too
          } as UserProfile); // Cast to UserProfile to satisfy type, ensure all mandatory fields are covered
      } else {
        setUserProfile(null); // Clear profile if user logs out
      }
  }, [user]);


  const handlePlanSelection = (plan: SubscriptionPlan) => {
    if (!user || !userProfile) { // userProfile check is technically redundant if user implies profile existence for purchase
      setPaddleError('You must be logged in to make a purchase.');
      return;
    }
    if (isPaddleLoading || !window.Paddle) {
      setPaddleError('Payment system is not ready. Please wait or try again.');
      return;
    }
    setPaddleError(null);
    setSelectedPlanId(plan.id);

    const paddleProductId = plan.id;

    console.log(`Opening Paddle Checkout for plan: ${plan.name}, Paddle Product ID: ${paddleProductId}`);

    window.Paddle.Checkout.open({
      product: paddleProductId,
      email: user.email, // user.email should be non-null for a logged-in user making a purchase
      passthrough: JSON.stringify({
        firebase_uid: user.uid,
        internal_plan_id: plan.id,
      }),
      successCallback: (data: any) => { // Consider typing 'data' if Paddle SDK provides types
        console.log('Paddle Checkout Success (Client-side):', data);
        alert('Purchase successful! Your plan will be updated shortly.');
        onClose();
      },
      eventCallback: (data: any) => { // Consider typing 'data'
        console.log('Paddle Event:', data);
        if (data.event === 'Checkout.Complete') {
           console.log('Paddle Checkout.Complete (Client-side via eventCallback):', data.eventData);
           alert('Purchase processing! Your plan will be updated shortly.');
           onClose();
        } else if (data.event === 'Checkout.Close') {
            console.log('Paddle Checkout Closed by user.');
            setSelectedPlanId(null);
        } else if (data.event === 'Checkout.Error') {
            console.error('Paddle Checkout Error:', data.eventData.message);
            setPaddleError(`Payment error: ${data.eventData.message}. Please try again.`);
            setSelectedPlanId(null);
        }
      }
    });
  };

  if (!isOpen) {
    return null;
  }

  const modalStyle: React.CSSProperties = {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 1000,
  };
  const modalContentStyle: React.CSSProperties = {
    backgroundColor: 'white', padding: '20px', borderRadius: '8px',
    width: '90%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto',
  };
  const planCardStyle: React.CSSProperties = {
    border: '1px solid #ddd', borderRadius: '4px', padding: '15px', marginBottom: '10px',
  };

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h2>Upgrade Your Plan</h2>
        {isPaddleLoading && <p>Loading payment options...</p>}
        {paddleError && <p style={{ color: 'red' }}>Error: {paddleError}</p>}

        {!isPaddleLoading && !paddleError && (
          <div>
            {examplePlans.map((plan) => (
              <div key={plan.id} style={planCardStyle}>
                <h3>{plan.name}</h3>
                <p>Price: ${(plan.price / 100).toFixed(2)} {plan.currency}</p>
                <p>Credits: {plan.credits}</p>
                <ul>
                  {plan.features.map((feature: string, index: number) => ( // Added types for feature and index
                    <li key={index}>{feature}</li>
                  ))}
                </ul>
                <button onClick={() => handlePlanSelection(plan)} disabled={selectedPlanId === plan.id}>
                  {selectedPlanId === plan.id ? 'Processing...' : `Choose ${plan.name}`}
                </button>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ marginTop: '15px' }}>Close</button>
      </div>
    </div>
  );
};

export default UpgradeModal;
