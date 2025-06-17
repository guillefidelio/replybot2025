// src/components/CreditDisplay.tsx
import React, { useState, useEffect, useContext } from 'react';
import { CreditService } from '../../services/CreditService'; // Adjust path as needed
import { AuthContext } from '../../contexts/AuthContext'; // Adjust path as needed
import { DEFAULT_FREE_PLAN, SubscriptionPlan } from '../../types/payment'; // Adjust path
// import './CreditDisplay.css'; // We'll assume a CSS file for styles

interface CreditDisplayProps {
  onUpgradeClick?: () => void; // Callback when upgrade button is clicked
}

const CreditDisplay: React.FC<CreditDisplayProps> = ({ onUpgradeClick }) => {
  const { user } = useContext(AuthContext);
  const [credits, setCredits] = useState<number | null>(null);
  const [maxCredits, setMaxCredits] = useState<number>(DEFAULT_FREE_PLAN.credits); // Default to free plan's credits
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);


  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      // setError('Please log in to see your credits.'); // Or simply show nothing
      setCredits(null); // Clear credits if user logs out
      return;
    }

    setIsLoading(true);
    setError(null);
    const creditService = CreditService.getInstance();

    // Fetch initial credits
    creditService.getUserCredits(user.uid)
      .then(initialCredits => {
        setCredits(initialCredits);
        // TODO: Fetch actual user's subscription plan to set maxCredits accurately
        // For now, we use DEFAULT_FREE_PLAN or a fixed value if credits exceed it.
        // This logic will need refinement once plan management is in place.
        // Example: const userPlan = await PlanService.getUserPlan(user.uid); setSubscriptionPlan(userPlan);
        // if (userPlan) setMaxCredits(userPlan.credits); else setMaxCredits(DEFAULT_FREE_PLAN.credits);
        // If current credits > default max, adjust maxCredits to show full bar
        if (initialCredits !== null && initialCredits > maxCredits) {
            setMaxCredits(initialCredits);
        }
      })
      .catch(err => {
        console.error('Error fetching initial credits:', err);
        setError('Could not load credit balance.');
      })
      .finally(() => {
        // setIsLoading(false); // Loading state will be turned off by the listener's first fire
      });

    // Listen for real-time credit changes
    const unsubscribe = creditService.onCreditChange(user.uid, (updatedCredits) => {
      setCredits(updatedCredits);
      if (isLoading) setIsLoading(false); // Turn off loading after first data received
       // Adjust maxCredits if current credits exceed it (e.g., after a top-up)
      if (updatedCredits > maxCredits) {
        setMaxCredits(updatedCredits);
      }
      // If credits drop below the plan's default (e.g. DEFAULT_FREE_PLAN.credits)
      // and maxCredits was adjusted higher, reset maxCredits to the plan's default.
      // This needs to be smarter with actual plan data.
      else if (updatedCredits < maxCredits && maxCredits > (subscriptionPlan?.credits || DEFAULT_FREE_PLAN.credits) ) {
        setMaxCredits(subscriptionPlan?.credits || DEFAULT_FREE_PLAN.credits);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user, maxCredits, subscriptionPlan]); // Add maxCredits & subscriptionPlan to dependency array if they influence it.

  const getCreditStatusColor = (): string => {
    if (credits === null || maxCredits === 0) return '#CCCCCC'; // Grey for loading/unknown or no max
    const percentage = (credits / maxCredits) * 100;
    if (credits === 0) return '#F44336'; // Red for zero
    if (percentage < 20) return '#F44336'; // Red
    if (percentage < 60) return '#FFC107'; // Yellow
    return '#4CAF50'; // Green
  };

  const creditColor = getCreditStatusColor();
  const progressPercentage = credits !== null && maxCredits > 0 ? (credits / maxCredits) * 100 : 0;

  if (isLoading) {
    return <div className="credit-display loading">Loading credits...</div>;
  }

  if (error) {
    return <div className="credit-display error">Error: {error} <button onClick={() => window.location.reload()}>Retry</button></div>;
  }

  if (user === null) { // Explicitly handle no user logged in state if desired beyond just null credits
      return <div className="credit-display not-logged-in">Please log in to view credits.</div>;
  }

  if (credits === null) { // Should be covered by isLoading initially, but as a fallback
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
      {maxCredits > 0 && ( // Only show progress bar if there's a meaningful max
        <div className="progress-bar-container" style={{ height: '20px', backgroundColor: '#e0e0e0', borderRadius: '5px', overflow: 'hidden', marginBottom: '10px' }}>
          <div
            className="progress-bar-fill"
            style={{
              width: `${Math.min(progressPercentage, 100)}%`, // Cap at 100% visually
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
