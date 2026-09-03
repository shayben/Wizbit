import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaywallModal } from '../components/PaywallModal';
import { apiGet } from '../services/apiClient';

const quotaPayload = {
  error: 'quota_exceeded',
  purpose: 'ocr',
  limit: 3,
  used: 3,
  plan: 'free',
  retryAt: '2026-09-04T00:00:00.000Z',
  upsell: {
    cta: 'Join waitlist',
    annualPrice: '$59/yr',
    monthlyPrice: '$7.99/mo',
  },
};

describe('PaywallModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('provides an immediately accessible dismiss button', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(quotaPayload), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));
    render(<PaywallModal />);

    await expect(apiGet('/test')).rejects.toThrow('Quota exceeded for ocr');
    const closeButton = await screen.findByRole('button', { name: 'Close quota notification' });
    fireEvent.click(closeButton);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
