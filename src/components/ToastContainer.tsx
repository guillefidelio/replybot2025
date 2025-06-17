// src/components/ToastContainer.tsx
import React from 'react';
import Toast, { ToastProps as SingleToastProps } from './Toast'; // Assuming ToastProps is exported from Toast.tsx
// import './ToastContainer.css'; // For styling

export interface ToastNotification extends Omit<SingleToastProps, 'onDismiss'> {
  // id is part of SingleToastProps
}

interface ToastContainerProps {
  notifications: ToastNotification[];
  onDismissNotification: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ notifications, onDismissNotification }) => {
  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '20px', // Or bottom: '20px'
    right: '20px',
    zIndex: 2000, // Ensure it's above other content
    width: '300px', // Or adjust as needed
  };

  return (
    <div style={containerStyle} className="toast-container">
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          id={notification.id}
          message={notification.message}
          type={notification.type}
          duration={notification.duration}
          onDismiss={onDismissNotification}
        />
      ))}
    </div>
  );
};

export default ToastContainer;
