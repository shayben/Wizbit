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
import { setAuthTokenProvider, type AuthTokenInfo } from '../services/apiClient';

const PROVIDER_KEY = 'wizbit:auth-provider';
const GOOGLE_USER_KEY = 'wizbit:google-user';
const GOOGLE_TOKEN_KEY = 'wizbit:google-token';

interface GoogleUserInfo {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

interface StoredGoogleToken {
  accessToken: string;
  expiresAt: number;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  isConfigured: boolean;
  signInMicrosoft: () => Promise<void>;
  signInGoogle: (accessToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  isConfigured: false,
  signInMicrosoft: async () => {},
  signInGoogle: async () => {},
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

function googleInfoToUser(info: GoogleUserInfo): CurrentUser {
  return {
    uid: `google:${info.sub}`,
    displayName: info.name ?? null,
    email: info.email ?? null,
    photoURL: info.picture ?? null,
    provider: 'google',
  };
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
      const raw = localStorage.getItem(GOOGLE_USER_KEY);
      if (!raw) return false;
      try {
        const info = JSON.parse(raw) as GoogleUserInfo;
        if (!info.sub) { localStorage.removeItem(GOOGLE_USER_KEY); return false; }
        if (!cancelled) setUser(googleInfoToUser(info));
        return true;
      } catch {
        localStorage.removeItem(GOOGLE_USER_KEY);
        return false;
      }
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

  // ── Google sign-in (receives access token from useGoogleLogin) ──
  const signInGoogle = useCallback(async (accessToken: string) => {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('Failed to fetch Google user info');
    const info = (await res.json()) as GoogleUserInfo;
    const u = googleInfoToUser(info);
    setUser(u);
    localStorage.setItem(PROVIDER_KEY, 'google');
    localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(info));
    // Persist the access token so /api/* calls authenticate after reload.
    // Google access tokens are valid ~1h; the api proxy verifies via tokeninfo.
    const stored: StoredGoogleToken = {
      accessToken,
      expiresAt: Date.now() + 55 * 60_000,
    };
    localStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify(stored));
  }, []);

  // ── Sign out ──
  const signOut = useCallback(async () => {
    if (user?.photoURL?.startsWith('blob:')) {
      URL.revokeObjectURL(user.photoURL);
    }

    const provider = user?.provider;
    setUser(null);
    localStorage.removeItem(PROVIDER_KEY);
    localStorage.removeItem(GOOGLE_USER_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_KEY);

    if (provider === 'microsoft' && msalInstance) {
      const account = msalInstance.getAllAccounts()[0];
      await msalInstance.logoutPopup({ account }).catch(() => {});
    }
    // Google: clearing stored user info is sufficient; no server-side logout needed
  }, [user]);

  // ── Wire fresh-token provider into apiClient ──
  // Re-runs whenever the active user changes; the closure captures the latest
  // `user.provider`. apiClient calls this lazily before every /api/* request.
  useEffect(() => {
    setAuthTokenProvider(async (): Promise<AuthTokenInfo | null> => {
      const u = user;
      if (!u) return null;
      if (u.provider === 'microsoft' && msalInstance) {
        try {
          const account = msalInstance.getAllAccounts()[0];
          if (!account) return null;
          const result = await msalInstance.acquireTokenSilent({ account, scopes: LOGIN_SCOPES });
          // Backend verifies signature + issuer; idToken's audience matches
          // our app registration which is what we want for caller identity.
          const token = result.idToken || result.accessToken;
          if (!token) return null;
          return { token, provider: 'microsoft' };
        } catch {
          return null;
        }
      }
      if (u.provider === 'google') {
        try {
          const raw = localStorage.getItem(GOOGLE_TOKEN_KEY);
          if (!raw) return null;
          const stored = JSON.parse(raw) as StoredGoogleToken;
          if (!stored.accessToken || stored.expiresAt < Date.now()) return null;
          return { token: stored.accessToken, provider: 'google' };
        } catch {
          return null;
        }
      }
      return null;
    });
    return () => {
      setAuthTokenProvider(async () => null);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isConfigured: isMsalConfigured || isGoogleConfigured,
      signInMicrosoft,
      signInGoogle,
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
