import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary, AppwriteProvider } from './components/AppwriteProvider';
import { AuthActionHandler } from './components/AuthActionHandler';
import { PushNotificationManager } from './components/PushNotificationManager';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppwriteProvider>
        <AuthActionHandler />
        <PushNotificationManager />
        <App />
      </AppwriteProvider>
    </ErrorBoundary>
  </StrictMode>,
);
