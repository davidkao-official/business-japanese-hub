import { describe, expect, it, vi } from 'vitest';
import {
  buildOrderConfirmationEmail,
  createResendEmailSender,
  isOrderEmailConfigured,
  type OrderConfirmationFacts,
} from './email.ts';
import { testEnv } from './testing.ts';

const FACTS: OrderConfirmationFacts = {
  orderId: 'ord-1',
  recipientEmail: 'reader@example.com',
  locale: 'en',
  itemName: 'Meetings <script>alert("x")</script>',
  amountMinor: 1200,
  currency: 'USD',
  provider: 'paypal',
  paymentMethod: 'credit',
  paidAt: '2026-08-20T12:00:00.000Z',
};

describe('order confirmation email', () => {
  it('renders escaped HTML and a complete plain-text receipt from authoritative facts', () => {
    const message = buildOrderConfirmationEmail(
      FACTS,
      testEnv({
        publicSiteUrl: 'https://business-japanese.example',
        supportEmail: 'support@example.com',
        legalSellerName: 'Example Seller & Co.',
        orderEmailFrom: 'Business Japanese Hub <receipts@example.com>',
      }),
    );

    expect(message.idempotencyKey).toBe('order-confirmation/ord-1');
    expect(message.to).toBe('reader@example.com');
    expect(message.subject).toContain('ord-1');
    expect(message.html).toContain('Meetings &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('USD 12.00');
    expect(message.html).toContain('https://business-japanese.example/library');
    expect(message.html).toContain('https://business-japanese.example/legal/refunds');
    expect(message.html).toContain('Example Seller &amp; Co.');
    expect(message.text).toContain('Meetings <script>alert("x")</script>');
    expect(message.text).toContain('Payment: PayPal');
    expect(message.text).not.toContain('PayPal / credit card');
    expect(message.text).toContain(
      'Delivery: Delivered to your Library after payment confirmation; check your Library for current access',
    );
    expect(message.text).not.toContain('Immediate access');
    expect(message.text).toContain('support@example.com');
  });

  it('requires the scheduled worker secret before checkout can rely on email delivery', () => {
    expect(isOrderEmailConfigured(testEnv())).toBe(true);
    expect(isOrderEmailConfigured(testEnv({ scheduledJobSecret: undefined }))).toBe(false);
  });

  it('sends with Resend without exposing the API key in the request body', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: ' email-1 ' }),
    });
    const env = testEnv({
      orderEmailProvider: 'resend',
      resendApiKey: 're_secret',
      orderEmailFrom: 'Business Japanese Hub <receipts@example.com>',
      publicSiteUrl: 'https://business-japanese.example',
      supportEmail: 'support@example.com',
      legalSellerName: 'Example Seller',
    });
    const sender = createResendEmailSender(env, fetcher);
    const message = buildOrderConfirmationEmail(FACTS, env);

    await expect(sender.send(message)).resolves.toEqual({
      ok: true,
      providerMessageId: 'email-1',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_secret',
          'Idempotency-Key': 'order-confirmation/ord-1',
        }),
      }),
    );
    const body = String(fetcher.mock.calls[0][1].body);
    expect(body).not.toContain('re_secret');
    expect(JSON.parse(body)).toMatchObject({
      to: ['reader@example.com'],
      reply_to: 'support@example.com',
    });
  });

  it.each([
    ['ja', 'ECPay / クレジットカード'],
    ['zh-TW', 'ECPay / 信用卡'],
  ])('localizes the credit-card method in %s', (locale, expected) => {
    const message = buildOrderConfirmationEmail(
      { ...FACTS, locale, provider: 'ecpay', paymentMethod: 'credit' },
      testEnv(),
    );
    expect(message.text).toContain(expected);
  });

  it('aborts a stalled Resend request at the bounded deadline', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_input: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));
      const env = testEnv();
      const send = createResendEmailSender(env, fetcher).send(buildOrderConfirmationEmail(FACTS, env));

      await vi.advanceTimersByTimeAsync(10_000);

      await expect(send).resolves.toEqual({ ok: false, errorCode: 'request_timeout', retryable: true });
      expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the deadline active while reading a stalled Resend response body', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_input: string, init?: { signal?: AbortSignal }) => Promise.resolve({
        ok: true,
        status: 200,
        json: () => new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
      }));
      const env = testEnv();
      const send = createResendEmailSender(env, fetcher).send(buildOrderConfirmationEmail(FACTS, env));

      await vi.advanceTimersByTimeAsync(10_000);

      await expect(send).resolves.toEqual({ ok: false, errorCode: 'request_timeout', retryable: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries an unparsable success response through the same idempotency key', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('invalid JSON')),
    });
    const env = testEnv();

    await expect(
      createResendEmailSender(env, fetcher).send(buildOrderConfirmationEmail(FACTS, env)),
    ).resolves.toEqual({
      ok: false,
      errorCode: 'malformed_success_response',
      retryable: true,
    });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'order-confirmation/ord-1',
    });
  });

  it('retries valid success JSON that omits a usable provider message id', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ id: null }),
    });
    const env = testEnv();

    await expect(
      createResendEmailSender(env, fetcher).send(buildOrderConfirmationEmail(FACTS, env)),
    ).resolves.toEqual({
      ok: false,
      errorCode: 'malformed_success_response',
      retryable: true,
    });
  });

  it('retries a whitespace-only provider message id instead of marking the job sent', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ id: '   ' }),
    });
    const env = testEnv();

    await expect(
      createResendEmailSender(env, fetcher).send(buildOrderConfirmationEmail(FACTS, env)),
    ).resolves.toEqual({
      ok: false,
      errorCode: 'malformed_success_response',
      retryable: true,
    });
  });
});
