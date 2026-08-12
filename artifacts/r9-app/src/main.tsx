import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { detectRecoveryFromUrl } from '@/lib/recovery';

// Captura `type=recovery` do link de e-mail antes que o supabase-js
// consuma o hash da URL ao criar a sessão.
detectRecoveryFromUrl();

import './index.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
