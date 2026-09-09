import React from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AppRouter } from '@/router';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouter />
        <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
