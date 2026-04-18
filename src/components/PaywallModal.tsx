/**
 * Soft paywall modal — appears when the backend rejects a request with 429.
 *
 * Until Stripe is wired up (Phase 1.1), this serves as a waitlist capture so we
 * can build the launch list of "people who hit a paywall". After Stripe goes
 * live, the same component will switch to a "Start free trial" CTA.
 *
 * Subscribes to the global `onQuotaExceeded` event bus so any service that
 * surfaces a `QuotaExceededError` triggers the modal automatically.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { onQuotaExceeded, type QuotaErrorPayload, apiPost } from '../services/apiClient';

const PURPOSE_COPY: Record<string, { title: string; line: string }> = {
  ocr: {
    title: "You've used today's free scans ✨",
    line: 'Premium readers get unlimited camera scans every day.',
  },
  'story-chapter': {
    title: 'Your adventure is just getting good!',
    line: 'Premium unlocks unlimited Adventure Mode chapters.',
  },
  moments: {
    title: 'More magical moments await ✨',
    line: 'Premium unlocks unlimited illustrated moments.',
  },
  'translate-batch': {
    title: 'Translation limit reached',
    line: 'Premium gives you unlimited translations.',
  },
  'translate-word': {
    title: 'Translation limit reached',
    line: 'Premium gives you unlimited word translations.',
  },
  'sticker-image': {
    title: 'AI sticker art is a Premium perk',
    line: 'Premium unlocks custom AI-illustrated stickers for every story.',
  },
  'speech-minutes': {
    title: "You've used today's free practice time",
    line: 'Premium unlocks unlimited reading-aloud practice every day.',
  },
};

const FALLBACK_COPY = {
  title: "You've reached today's free limit",
  line: 'Premium families get unlimited reading magic.',
};

const STORAGE_KEY = 'wizbit.waitlistEmail';

export const PaywallModal: React.FC = () => {
  const [event, setEvent] = useState<QuotaErrorPayload | null>(null);
  const [email, setEmail] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = onQuotaExceeded((payload) => {
      setError(null);
      setSubmitted(false);
      setEvent(payload);
    });
    return off;
  }, []);

  const close = useCallback(() => {
    setEvent(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, close]);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/waitlist', {
        email: trimmed,
        source: `paywall:${event.purpose}`,
      });
      localStorage.setItem(STORAGE_KEY, trimmed);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your email');
    } finally {
      setSubmitting(false);
    }
  }, [email, event]);

  if (!event) return null;

  const copy = PURPOSE_COPY[event.purpose] ?? FALLBACK_COPY;
  const annual = event.upsell?.annualPrice ?? '$59/yr';
  const monthly = event.upsell?.monthlyPrice ?? '$7.99/mo';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      onClick={close}
    >
      <div
        className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-6 md:p-8 animate-slide-up"
        style={{ overscrollBehavior: 'contain' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-3 text-center">✨</div>
        <h2 id="paywall-title" className="text-2xl font-bold text-center text-gray-900 mb-2">
          {copy.title}
        </h2>
        <p className="text-gray-600 text-center mb-5">{copy.line}</p>

        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 mb-5">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-medium text-purple-900">Wizbit Premium Family</span>
            <span className="text-xs text-purple-700">Coming soon</span>
          </div>
          <div className="mt-1 text-purple-900">
            <span className="text-xl font-bold">{annual}</span>
            <span className="text-sm text-purple-700"> · or {monthly}</span>
          </div>
          <ul className="mt-2 text-sm text-purple-900 space-y-1">
            <li>✓ Unlimited Adventure chapters</li>
            <li>✓ Unlimited camera scans &amp; reading practice</li>
            <li>✓ Up to 4 child profiles</li>
            <li>✓ Printable worksheets &amp; story library export</li>
          </ul>
        </div>

        {!submitted ? (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm text-gray-700">
              Get a launch-day discount &amp; an extra free month — drop your email:
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoComplete="email"
            />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold rounded-xl transition"
            >
              {submitting ? 'Saving…' : 'Notify me when Premium launches'}
            </button>
            <button
              type="button"
              onClick={close}
              className="w-full py-2 text-gray-500 text-sm hover:text-gray-700"
            >
              Maybe later — keep using free tier
            </button>
          </form>
        ) : (
          <div className="space-y-3 text-center">
            <div className="text-3xl">🎉</div>
            <p className="text-gray-800 font-medium">You&rsquo;re on the list!</p>
            <p className="text-gray-600 text-sm">
              We&rsquo;ll email you the moment Premium opens, with a launch-day discount.
            </p>
            <button
              type="button"
              onClick={close}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
