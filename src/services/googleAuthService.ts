/**
 * Google OAuth configuration.
 *
 * Set VITE_GOOGLE_CLIENT_ID in your .env file (or GitHub Actions secrets)
 * to enable Google sign-in.  When the client ID is absent, the Google
 * sign-in button is hidden and the app falls back to Microsoft-only auth.
 */

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);
