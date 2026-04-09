/**
 * Shared user type used throughout the app.
 * Abstracts away the underlying auth provider (Microsoft MSAL).
 */

export interface CurrentUser {
  /** Stable unique identifier (MSAL homeAccountId). */
  uid: string;
  displayName: string | null;
  email: string | null;
  /** Profile photo URL — null until loaded or when unavailable. */
  photoURL: string | null;
}
