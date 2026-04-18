import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { PaywallModal } from './components/PaywallModal.tsx'
import { ensureMomentCacheLoaded } from './data/momentCache.ts'
import { GOOGLE_CLIENT_ID } from './services/googleAuthService.ts'

// Pre-load the moment cache so it's ready when the user starts reading
ensureMomentCacheLoaded();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID ?? ''}>
      <AuthProvider>
        <App />
        <PaywallModal />
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
