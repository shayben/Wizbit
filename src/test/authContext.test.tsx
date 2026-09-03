import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AccountInfo } from '@azure/msal-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import type { AuthTokenInfo } from '../services/apiClient';

const microsoftAccount = (homeAccountId: string, username: string): AccountInfo => ({
  homeAccountId,
  environment: 'login.microsoftonline.com',
  tenantId: 'tenant',
  username,
  localAccountId: homeAccountId,
  name: username,
});

const accounts = [
  microsoftAccount('other.tenant', 'other@example.com'),
  microsoftAccount('current.tenant', 'current@example.com'),
];

const msalMock = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  handleRedirectPromise: vi.fn().mockResolvedValue(null),
  getAllAccounts: vi.fn(),
  getActiveAccount: vi.fn().mockReturnValue(null),
  setActiveAccount: vi.fn(),
  acquireTokenSilent: vi.fn(),
  loginPopup: vi.fn(),
  clearCache: vi.fn().mockResolvedValue(undefined),
}));

let tokenProvider: () => Promise<AuthTokenInfo | null> = async () => null;

vi.mock('../services/msalService', () => ({
  isMsalConfigured: true,
  LOGIN_SCOPES: ['openid'],
  msalInstance: msalMock,
}));

vi.mock('../services/googleAuthService', () => ({
  isGoogleConfigured: false,
}));

vi.mock('../services/apiClient', () => ({
  setAuthTokenProvider: vi.fn((provider: () => Promise<AuthTokenInfo | null>) => {
    tokenProvider = provider;
  }),
}));

function AuthProbe() {
  const { user, signOut } = useAuth();
  return (
    <>
      <span>{user?.uid ?? 'signed-out'}</span>
      <button type="button" onClick={() => void signOut()}>Sign out</button>
    </>
  );
}

describe('AuthProvider Microsoft account isolation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    msalMock.getAllAccounts.mockReturnValue(accounts);
    msalMock.getActiveAccount.mockReturnValue(null);
    msalMock.acquireTokenSilent.mockResolvedValue({
      account: accounts[1],
      accessToken: 'graph-token',
      idToken: 'id-token',
    });
    msalMock.clearCache.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  it('restores and authenticates with the account selected on this device', async () => {
    localStorage.setItem('wizbit:auth-provider', 'microsoft');
    localStorage.setItem('wizbit:microsoft-account', accounts[1].homeAccountId);

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    await screen.findByText(accounts[1].homeAccountId);
    expect(msalMock.acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({ account: accounts[1] }),
    );
    expect(msalMock.setActiveAccount).toHaveBeenCalledWith(accounts[1]);

    let token: AuthTokenInfo | null = null;
    await act(async () => {
      token = await tokenProvider();
    });
    expect(token).toEqual({ token: 'id-token', provider: 'microsoft' });
    expect(msalMock.acquireTokenSilent).toHaveBeenLastCalledWith(
      expect.objectContaining({ account: accounts[1] }),
    );
  });

  it('signs out only the account cached on this device', async () => {
    localStorage.setItem('wizbit:auth-provider', 'microsoft');
    localStorage.setItem('wizbit:microsoft-account', accounts[1].homeAccountId);

    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await screen.findByText(accounts[1].homeAccountId);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(msalMock.clearCache).toHaveBeenCalledWith({ account: accounts[1] });
    });
    expect(localStorage.getItem('wizbit:microsoft-account')).toBeNull();
    expect(screen.getByText('signed-out')).toBeInTheDocument();
  });
});
