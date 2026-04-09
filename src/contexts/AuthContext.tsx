/**
 * Auth context — wraps Microsoft MSAL (Entra ID) and exposes the current user
 * to the whole component tree.  When MSAL is not configured (client ID absent)
 * the context still works: auth methods are no-ops and `user` stays null.
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
import type { CurrentUser } from '../types/auth';

interface AuthContextValue {
  user: CurrentUser | null;
  /** True while the initial auth state is being resolved. */
  loading: boolean;
  isConfigured: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  isConfigured: false,
  signIn: async () => {},
  signOut: async () => {},
});

function accountToUser(account: AccountInfo, photoURL: string | null = null): CurrentUser {
  return {
    uid: account.homeAccountId,
    displayName: account.name ?? null,
    email: account.username ?? null,
    photoURL,
  };
}

/** Attempt to fetch the user's Microsoft profile photo via MS Graph. */
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
  const [loading, setLoading] = useState(isMsalConfigured);

  useEffect(() => {
    if (!msalInstance) return;

    let cancelled = false;

    msalInstance.initialize().then(async () => {
      if (cancelled) return;

      // Handle redirect response (if any)
      await msalInstance!.handleRedirectPromise().catch((err) => {
        console.warn('[Auth] handleRedirectPromise error:', err);
      });

      const accounts = msalInstance!.getAllAccounts();
      if (accounts.length > 0 && !cancelled) {
        const account = accounts[0];
        try {
          // Acquire token silently to get an access token for MS Graph
          const result = await msalInstance!.acquireTokenSilent({
            account,
            scopes: LOGIN_SCOPES,
          });
          const photoURL = await fetchMsGraphPhoto(result.accessToken);
          if (!cancelled) setUser(accountToUser(account, photoURL));
        } catch {
          // Token refresh failed — still show user without photo
          if (!cancelled) setUser(accountToUser(account));
        }
      }

      if (!cancelled) setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async () => {
    if (!msalInstance) return;
    try {
      const result = await msalInstance.loginPopup({ scopes: LOGIN_SCOPES });
      const photoURL = await fetchMsGraphPhoto(result.accessToken);
      setUser(accountToUser(result.account, photoURL));
    } catch {
      // User cancelled popup or other error — leave user as null
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!msalInstance) return;
    const account = msalInstance.getAllAccounts()[0];
    setUser(null);
    await msalInstance.logoutPopup({ account }).catch((err) => {
      console.warn('[Auth] logoutPopup error:', err);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isConfigured: isMsalConfigured, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
