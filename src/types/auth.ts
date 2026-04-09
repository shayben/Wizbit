/**
 * Shared user type used throughout the app.
 * Abstracts away the underlying auth provider (Microsoft MSAL or Google).
 */

export type AuthProvider = 'microsoft' | 'google';

export interface CurrentUser {
  /** Stable unique identifier (MSAL homeAccountId or Google sub). */
  uid: string;
  displayName: string | null;
  email: string | null;
  /** Profile photo URL — null until loaded or when unavailable. */
  photoURL: string | null;
  /** Which provider the user signed in with. */
  provider: AuthProvider;
}
