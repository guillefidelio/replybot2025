// src/contexts/NotificationContext.tsx
import React, { createContext, useState, useCallback, useContext } from 'react';
import type { ReactNode } from 'react'; // Changed to type-only import
import ToastContainer from '../components/ToastContainer'; // Adjust path
import type { ToastNotification } from '../components/ToastContainer'; // Changed to type-only import and ensure path is correct for the type if it's from the component itself.

type NotificationContextType = {
  addNotification: (message: string, type: ToastNotification['type'], duration?: number) => void;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

let idCounter = 0;

export const NotificationProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  const addNotification = useCallback((message: string, type: ToastNotification['type'], duration?: number) => {
    const id = `toast-${idCounter++}`;
    setNotifications((prevNotifications) => [
      ...prevNotifications,
      { id, message, type, duration },
    ]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prevNotifications) =>
      prevNotifications.filter((notification) => notification.id !== id)
    );
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification }}>
      {children}
      <ToastContainer notifications={notifications} onDismissNotification={removeNotification} />
    </NotificationContext.Provider>
  );
};

export const useNotifier = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifier must be used within a NotificationProvider');
  }
  return context;
};
