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
      json: async () => ({ id: 'email-1' }),
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
});
