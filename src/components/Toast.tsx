// src/components/Toast.tsx
import React, { useEffect } from 'react';
// import './Toast.css'; // For styling

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  duration?: number; // Auto-dismiss duration in ms
  onDismiss: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ id, message, type, duration = 5000, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [id, duration, onDismiss]);

  const baseStyle: React.CSSProperties = {
    padding: '10px 15px',
    margin: '10px',
    borderRadius: '5px',
    color: 'white',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    opacity: 0.9,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const typeStyles: Record<ToastType, React.CSSProperties> = {
    success: { backgroundColor: '#4CAF50' },
    error: { backgroundColor: '#F44336' },
    info: { backgroundColor: '#2196F3' },
    warning: { backgroundColor: '#FFC107', color: '#333' },
  };

  const dismissButtonStyle: React.CSSProperties = {
    marginLeft: '15px',
    background: 'none',
    border: 'none',
    color: 'inherit',
    fontSize: '1.2em',
    cursor: 'pointer',
  };

  return (
    <div style={{ ...baseStyle, ...typeStyles[type] }} className={`toast toast-${type}`}>
      <span>{message}</span>
      <button style={dismissButtonStyle} onClick={() => onDismiss(id)}>&times;</button>
    </div>
  );
};

export default Toast;
