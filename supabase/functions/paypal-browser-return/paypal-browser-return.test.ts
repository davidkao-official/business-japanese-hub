import { describe, expect, it } from 'vitest';
import { handlerRequest } from '../_shared/testing.ts';
import { handlePaypalBrowserReturn } from './handler.ts';

describe('PayPal browser return (#21)', () => {
  it('redirects the local order id to the SPA result page without payment mutation', () => {
    const result = handlePaypalBrowserReturn(
      handlerRequest(
        'GET',
        'https://test.supabase.co/functions/v1/paypal-browser-return?order=ord-1&token=provider-token',
      ),
    );

    expect(result.status).toBe(303);
    expect(result.headers.Location).toBe('/purchase/result?order=ord-1');
    expect(result.headers.Location).not.toContain('provider-token');
  });

  it('falls back to the generic result page when no local order id is present', () => {
    const result = handlePaypalBrowserReturn(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/paypal-browser-return'),
    );

    expect(result.status).toBe(303);
    expect(result.headers.Location).toBe('/purchase/result');
  });

  it('rejects non-GET requests', () => {
    const result = handlePaypalBrowserReturn(
      handlerRequest('POST', 'https://test.supabase.co/functions/v1/paypal-browser-return'),
    );

    expect(result.status).toBe(405);
  });
});
