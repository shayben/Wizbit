/**
 * Login screen — shown when auth is configured and no user is signed in.
 * Offers Microsoft SSO and Google sign-in.
 */

import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { isGoogleConfigured } from '../services/googleAuthService';
import { isMsalConfigured } from '../services/msalService';

const GoogleIcon: React.FC = () => (
  <svg width="21" height="21" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const LoginScreen: React.FC = () => {
  const { signInMicrosoft, signInGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleMicrosoft = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInMicrosoft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true);
      setError(null);
      try {
        await signInGoogle(tokenResponse.access_token);
      } catch {
        setError('Google sign-in failed. Please try again.');
      } finally {
        setGoogleLoading(false);
      }
    },
    onError: () => setError('Google sign-in failed. Please try again.'),
  });

  const btnClass =
    'w-full flex items-center justify-center gap-3 py-4 rounded-2xl ' +
    'bg-white border-2 border-gray-200 text-gray-700 font-semibold text-base md:text-lg ' +
    'hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm ' +
    'disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <p className="text-6xl mb-4">📖</p>
        <h1 className="text-3xl md:text-4xl font-bold text-indigo-700 mb-2">🧙 Wizbit</h1>
        <p className="text-gray-500 text-base md:text-lg">Sign in to track your reading progress</p>
      </div>

      <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-8 md:p-10 w-full max-w-xs md:max-w-sm flex flex-col gap-4 items-center">
        {isMsalConfigured && (
          <button
            type="button"
            onClick={handleMicrosoft}
            disabled={loading}
            className={btnClass}
          >
            <svg width="21" height="21" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
              <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            {loading ? 'Signing in…' : 'Continue with Microsoft'}
          </button>
        )}

        {isGoogleConfigured && (
          <>
            {isMsalConfigured && (
              <div className="flex items-center gap-3 w-full">
                <hr className="flex-1 border-gray-200" />
                <span className="text-gray-400 text-xs font-medium">or</span>
                <hr className="flex-1 border-gray-200" />
              </div>
            )}
            <button
              type="button"
              onClick={() => handleGoogleLogin()}
              disabled={googleLoading}
              className={btnClass}
            >
              <GoogleIcon />
              {googleLoading ? 'Signing in…' : 'Continue with Google'}
            </button>
          </>
        )}

        {error && (
          <p className="text-red-600 text-sm text-center bg-red-50 rounded-xl p-3 w-full">{error}</p>
        )}

        <p className="text-gray-400 text-xs text-center">
          Your progress and trophies are saved to your account across all devices.
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
