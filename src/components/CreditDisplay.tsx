// src/components/CreditDisplay.tsx
import React, { useState, useEffect, useContext } from 'react';
import { CreditService } from '../services/CreditService'; // Corrected path
import { AuthContext } from '../contexts/AuthContext'; // Corrected path
import type { SubscriptionPlan } from '../types/payment'; // Corrected path, type-only for SubscriptionPlan
import { DEFAULT_FREE_PLAN } from '../types/payment'; // Corrected path for value

// import './CreditDisplay.css'; // We'll assume a CSS file for styles

// Define a minimal AuthContextType if not properly defined elsewhere for 'user'
// This is illustrative. The actual AuthContext should provide this.
interface MinimalAuthContextType {
  user: { uid: string; email?: string | null; } | null;
  // Add other properties like loading, signIn, signOut if they exist in your actual AuthContext
}


interface CreditDisplayProps {
  onUpgradeClick?: () => void; // Callback when upgrade button is clicked
}

const CreditDisplay: React.FC<CreditDisplayProps> = ({ onUpgradeClick }) => {
  const { user } = useContext(AuthContext as React.Context<MinimalAuthContextType>); // Typed context
  const [credits, setCredits] = useState<number | null>(null);
  const [maxCredits, setMaxCredits] = useState<number>(DEFAULT_FREE_PLAN.credits);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionPlan, /* setSubscriptionPlan */] = useState<SubscriptionPlan | null>(null); // Commented out setSubscriptionPlan


  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      setCredits(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    const creditService = CreditService.getInstance();

    creditService.getUserCredits(user.uid)
      .then((initialCredits: number | null) => { // Added type for initialCredits
        setCredits(initialCredits);
        if (initialCredits !== null && initialCredits > maxCredits) {
            setMaxCredits(initialCredits);
        }
      })
      .catch((err: Error) => { // Added type for err
        console.error('Error fetching initial credits:', err);
        setError('Could not load credit balance.');
      })
      .finally(() => {
        // setIsLoading(false); // Listener's first fire will handle this
      });

    const unsubscribe = creditService.onCreditChange(user.uid, (updatedCredits: number) => { // Added type for updatedCredits
      setCredits(updatedCredits);
      if (isLoading) setIsLoading(false);
      if (updatedCredits > maxCredits) {
        setMaxCredits(updatedCredits);
      }
      else if (updatedCredits < maxCredits && maxCredits > (subscriptionPlan?.credits || DEFAULT_FREE_PLAN.credits) ) {
        setMaxCredits(subscriptionPlan?.credits || DEFAULT_FREE_PLAN.credits);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user, maxCredits, subscriptionPlan, isLoading]); // Added isLoading to dependencies

  const getCreditStatusColor = (): string => {
    if (credits === null || maxCredits === 0) return '#CCCCCC';
    const percentage = (credits / maxCredits) * 100;
    if (credits === 0) return '#F44336';
    if (percentage < 20) return '#F44336';
    if (percentage < 60) return '#FFC107';
    return '#4CAF50';
  };

  const creditColor = getCreditStatusColor();
  const progressPercentage = credits !== null && maxCredits > 0 ? (credits / maxCredits) * 100 : 0;

  if (isLoading) {
    return <div className="credit-display loading">Loading credits...</div>;
  }

  if (error) {
    return <div className="credit-display error">Error: {error} <button onClick={() => window.location.reload()}>Retry</button></div>;
  }

  if (user === null) {
      return <div className="credit-display not-logged-in">Please log in to view credits.</div>;
  }

  if (credits === null) {
      return <div className="credit-display no-credits">Could not determine credit balance.</div>;
  }

  return (
    <div className="credit-display-container" style={{ padding: '10px', border: '1px solid #eee', borderRadius: '5px' }}>
      <div className="credit-text" style={{ marginBottom: '8px', fontSize: '1.2em' }}>
        <span style={{ color: creditColor, fontWeight: 'bold' }}>
          {credits} Available Credits
        </span>
        {credits < maxCredits * 0.2 && credits > 0 && (
          <span style={{ marginLeft: '10px', color: creditColor, fontSize: '0.9em' }}>(Low!)</span>
        )}
        {credits === 0 && (
           <span style={{ marginLeft: '10px', color: creditColor, fontSize: '0.9em' }}>(None)</span>
        )}
      </div>
      {maxCredits > 0 && (
        <div className="progress-bar-container" style={{ height: '20px', backgroundColor: '#e0e0e0', borderRadius: '5px', overflow: 'hidden', marginBottom: '10px' }}>
          <div
            className="progress-bar-fill"
            style={{
              width: `${Math.min(progressPercentage, 100)}%`,
              height: '100%',
              backgroundColor: creditColor,
              transition: 'width 0.5s ease-in-out, background-color 0.5s ease-in-out',
            }}
          />
        </div>
      )}
      {onUpgradeClick && (
         <button
            className="upgrade-credits-button"
            onClick={onUpgradeClick}
            style={{
                backgroundColor: (credits === 0 || credits < maxCredits * 0.2) ? '#F44336' : '#007bff',
                color: 'white',
                padding: '8px 15px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
            }}
        >
          {credits === 0 ? 'Buy Credits' : 'Upgrade / Buy More'}
        </button>
      )}
    </div>
  );
};

export default CreditDisplay;
