/**
 * Login screen — shown when auth is configured and no user is signed in.
 * Offers Microsoft SSO and Google sign-in.
 */

import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { isGoogleConfigured } from '../services/googleAuthService';
import { isMsalConfigured } from '../services/msalService';

const LoginScreen: React.FC = () => {
  const { signInMicrosoft, signInGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <p className="text-6xl mb-4">📖</p>
        <h1 className="text-3xl md:text-4xl font-bold text-indigo-700 mb-2">Reading Assistant</h1>
        <p className="text-gray-500 text-base md:text-lg">Sign in to track your reading progress</p>
      </div>

      <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-8 md:p-10 w-full max-w-xs md:max-w-sm flex flex-col gap-4 items-center">
        {isMsalConfigured && (
          <button
            type="button"
            onClick={handleMicrosoft}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl
                       bg-white border-2 border-gray-200 text-gray-700 font-semibold text-base md:text-lg
                       hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm
                       disabled:opacity-60 disabled:cursor-not-allowed"
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
            <div className="w-full flex justify-center [&>div]:w-full">
              <GoogleLogin
                onSuccess={(response) => {
                  if (response.credential) {
                    (signInGoogle as (cred: string) => void)(response.credential);
                  }
                }}
                onError={() => setError('Google sign-in failed. Please try again.')}
                size="large"
                width="100%"
                text="continue_with"
                shape="pill"
              />
            </div>
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
