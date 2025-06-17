// src/components/UpgradeModal.tsx
import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../contexts/AuthContext'; // Adjust path as needed
import { UserProfile } from '../../types/firebase'; // Adjust path
import { SubscriptionPlan, DEFAULT_FREE_PLAN } from '../../types/payment'; // Adjust path
// import './UpgradeModal.css'; // We'll assume a CSS file for styles

// This is a global declaration for the Paddle object, assuming Paddle.js is loaded via a script tag.
// If using Paddle via npm package, import it directly.
declare global {
  interface Window {
    Paddle: any;
  }
}

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  // We might pass current user profile or just rely on AuthContext
}

// Define some example plans. In a real app, these would come from a config or backend.
const examplePlans: SubscriptionPlan[] = [
  {
    id: 'premium_monthly',
    name: 'Premium Monthly',
    price: 1000, // in cents
    currency: 'USD',
    credits: 200,
    features: ['All AI Features', '200 Credits/Month', 'Priority Support']
  },
  {
    id: 'premium_yearly',
    name: 'Premium Yearly',
    price: 10000, // in cents
    currency: 'USD',
    credits: 2500, // e.g., 2400 + 100 bonus
    features: ['All AI Features', '2500 Credits/Year', 'Priority Support', 'Save 16%']
  },
  {
    id: 'credit_pack_small',
    name: 'Credit Pack (50)',
    price: 500, // in cents
    currency: 'USD',
    credits: 50,
    features: ['One-time purchase', '50 Credits']
  }
];

// Replace with your actual Paddle Vendor ID
const PADDLE_VENDOR_ID = parseInt(process.env.REACT_APP_PADDLE_VENDOR_ID || 'YOUR_PADDLE_VENDOR_ID_HERE', 10);
const PADDLE_ENVIRONMENT = process.env.REACT_APP_PADDLE_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'live';


const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
  const { user } = useContext(AuthContext);
  const [isPaddleLoading, setIsPaddleLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [paddleError, setPaddleError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // For passthrough data

  useEffect(() => {
    // Load Paddle.js script if not already loaded
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

    return () => {
      // document.body.removeChild(script); // Might cause issues if modal is re-opened quickly
    };
  }, []);

  // Fetch user profile for passthrough data - simplified
  useEffect(() => {
      if (user) {
          // In a real app, you might fetch the full UserProfile from Firestore
          // For now, construct a minimal one for passthrough
          setUserProfile({
              uid: user.uid,
              email: user.email || '',
              // ... other necessary fields for passthrough or display
              credits: 0, // Dummy value
              activeFeatures: [],
              createdAt: new Date(),
              lastLoginAt: new Date(),
          });
      }
  }, [user]);


  const handlePlanSelection = (plan: SubscriptionPlan) => {
    if (!user || !userProfile) {
      setPaddleError('You must be logged in to make a purchase.');
      return;
    }
    if (isPaddleLoading || !window.Paddle) {
      setPaddleError('Payment system is not ready. Please wait or try again.');
      return;
    }
    setPaddleError(null);
    setSelectedPlanId(plan.id); // Store selected plan id for passthrough

    // Paddle Product ID might be different from your internal plan.id
    // For this example, let's assume they are mapped or configured elsewhere.
    // E.g., getPaddleProductId(plan.id)
    const paddleProductId = plan.id; // Placeholder: use internal ID as Paddle Product ID

    console.log(`Opening Paddle Checkout for plan: ${plan.name}, Paddle Product ID: ${paddleProductId}`);

    window.Paddle.Checkout.open({
      product: paddleProductId,
      email: user.email,
      // customer_id: userProfile.paddleCustomerId, // If you have it
      passthrough: JSON.stringify({
        firebase_uid: user.uid,
        internal_plan_id: plan.id,
      }),
      successCallback: (data: any) => {
        console.log('Paddle Checkout Success (Client-side):', data);
        // IMPORTANT: DO NOT GRANT ENTITLEMENTS HERE. Wait for webhook.
        alert('Purchase successful! Your plan will be updated shortly.');
        onClose(); // Close the modal
      },
      eventCallback: (data: any) => { // More modern way to handle events
        console.log('Paddle Event:', data);
        if (data.event === 'Checkout.Complete') {
           console.log('Paddle Checkout.Complete (Client-side via eventCallback):', data.eventData);
           alert('Purchase processing! Your plan will be updated shortly.');
           onClose();
        } else if (data.event === 'Checkout.Close') {
            console.log('Paddle Checkout Closed by user.');
            setSelectedPlanId(null); // Reset selection
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

  // Basic styling for modal
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
                  {plan.features.map((feature, index) => (
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
