/**
 * Login screen — shown when Firebase is configured and no user is signed in.
 * Offers Google SSO. If Firebase is not configured, this screen is never shown.
 */

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LoginScreen: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
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

      <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-8 md:p-10 w-full max-w-xs md:max-w-sm flex flex-col gap-5 items-center">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl
                     bg-white border-2 border-gray-200 text-gray-700 font-semibold text-base md:text-lg
                     hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {/* Google logo SVG */}
          <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

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
