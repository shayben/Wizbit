/**
 * Microsoft MSAL (Entra ID) configuration and singleton instance.
 *
 * Set VITE_AZURE_AD_CLIENT_ID (and optionally VITE_AZURE_AD_TENANT_ID) in
 * your .env file to enable SSO.  When the client ID is absent the app runs
 * without sign-in and all progress is kept in localStorage only.
 */

import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID as string | undefined;
const tenantId = (import.meta.env.VITE_AZURE_AD_TENANT_ID as string | undefined) ?? 'common';

export const isMsalConfigured = Boolean(clientId);

const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? 'no-client-id',
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
};

/**
 * Scopes requested at login.
 * 'openid', 'profile', and 'email' are for identity.
 * 'User.Read' allows fetching the user's profile photo from MS Graph.
 */
export const LOGIN_SCOPES = ['openid', 'profile', 'email', 'User.Read'];

export const msalInstance = isMsalConfigured
  ? new PublicClientApplication(msalConfig)
  : null;
