/**
 * Auth context — supports Microsoft MSAL and Google sign-in.
 * Persists the active provider in localStorage so returning users are
 * automatically signed in without choosing a provider again.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { AccountInfo } from '@azure/msal-browser';
import { msalInstance, isMsalConfigured, LOGIN_SCOPES } from '../services/msalService';
import type { CurrentUser, AuthProvider as AuthProviderType } from '../types/auth';
import { isGoogleConfigured } from '../services/googleAuthService';
import { jwtDecode } from 'jwt-decode';

const PROVIDER_KEY = 'reading-assistant:auth-provider';
const GOOGLE_CRED_KEY = 'reading-assistant:google-credential';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  isConfigured: boolean;
  signInMicrosoft: () => Promise<void>;
  signInGoogle: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  isConfigured: false,
  signInMicrosoft: async () => {},
  signInGoogle: () => {},
  signOut: async () => {},
});

function msalAccountToUser(account: AccountInfo, photoURL: string | null = null): CurrentUser {
  return {
    uid: account.homeAccountId,
    displayName: account.name ?? null,
    email: account.username ?? null,
    photoURL,
    provider: 'microsoft',
  };
}

interface GoogleJwtPayload {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

function googleCredentialToUser(credential: string): CurrentUser | null {
  try {
    const payload = jwtDecode<GoogleJwtPayload>(credential);
    return {
      uid: `google:${payload.sub}`,
      displayName: payload.name ?? null,
      email: payload.email ?? null,
      photoURL: payload.picture ?? null,
      provider: 'google',
    };
  } catch {
    return null;
  }
}

async function fetchMsGraphPhoto(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(isMsalConfigured || isGoogleConfigured);

  // ── Restore session on mount ──
  useEffect(() => {
    let cancelled = false;
    const savedProvider = localStorage.getItem(PROVIDER_KEY) as AuthProviderType | null;

    const restoreMicrosoft = async () => {
      if (!msalInstance) return false;
      await msalInstance.initialize();
      await msalInstance.handleRedirectPromise().catch(() => {});
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length === 0) return false;

      const account = accounts[0];
      try {
        const result = await msalInstance.acquireTokenSilent({ account, scopes: LOGIN_SCOPES });
        const photoURL = await fetchMsGraphPhoto(result.accessToken);
        if (!cancelled) setUser(msalAccountToUser(account, photoURL));
      } catch {
        if (!cancelled) setUser(msalAccountToUser(account));
      }
      return true;
    };

    const restoreGoogle = () => {
      const cred = localStorage.getItem(GOOGLE_CRED_KEY);
      if (!cred) return false;
      const u = googleCredentialToUser(cred);
      if (!u) { localStorage.removeItem(GOOGLE_CRED_KEY); return false; }
      if (!cancelled) setUser(u);
      return true;
    };

    (async () => {
      // Try restoring the provider the user last used
      if (savedProvider === 'google') {
        if (!restoreGoogle() && msalInstance) await restoreMicrosoft();
      } else if (savedProvider === 'microsoft') {
        if (!(await restoreMicrosoft())) restoreGoogle();
      } else {
        // No preference — try both
        if (msalInstance && (await restoreMicrosoft())) { /* done */ }
        else restoreGoogle();
      }
      if (!cancelled) setLoading(false);
    })().catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // ── Microsoft sign-in ──
  const signInMicrosoft = useCallback(async () => {
    if (!msalInstance) return;
    try {
      const result = await msalInstance.loginPopup({ scopes: LOGIN_SCOPES });
      const photoURL = await fetchMsGraphPhoto(result.accessToken);
      const u = msalAccountToUser(result.account, photoURL);
      setUser(u);
      localStorage.setItem(PROVIDER_KEY, 'microsoft');
    } catch {
      // User cancelled popup
    }
  }, []);

  // ── Google sign-in (called from Google button callback) ──
  const signInGoogle = useCallback((credential?: string) => {
    if (!credential) return;
    const u = googleCredentialToUser(credential);
    if (u) {
      setUser(u);
      localStorage.setItem(PROVIDER_KEY, 'google');
      localStorage.setItem(GOOGLE_CRED_KEY, credential);
    }
  }, []);

  // ── Sign out ──
  const signOut = useCallback(async () => {
    if (user?.photoURL?.startsWith('blob:')) {
      URL.revokeObjectURL(user.photoURL);
    }

    const provider = user?.provider;
    setUser(null);
    localStorage.removeItem(PROVIDER_KEY);
    localStorage.removeItem(GOOGLE_CRED_KEY);

    if (provider === 'microsoft' && msalInstance) {
      const account = msalInstance.getAllAccounts()[0];
      await msalInstance.logoutPopup({ account }).catch(() => {});
    }
    // Google: clearing stored credential is sufficient; no server-side logout needed
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isConfigured: isMsalConfigured || isGoogleConfigured,
      signInMicrosoft,
      signInGoogle: signInGoogle as () => void,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
