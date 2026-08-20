import type { Env } from './env.ts';

export interface OrderConfirmationFacts {
  orderId: string;
  recipientEmail: string;
  locale: string;
  itemName: string;
  amountMinor: number;
  currency: string;
  provider: string;
  paymentMethod: string;
  paidAt: string;
}

export interface EmailMessage {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export type EmailSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; errorCode: string; retryable: boolean };

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

type Fetcher = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

type SupportedLocale = 'en' | 'ja' | 'zh-TW';

const STRINGS: Record<SupportedLocale, {
  subject: (orderId: string) => string;
  heading: string;
  thanks: string;
  order: string;
  item: string;
  amount: string;
  paidAt: string;
  payment: string;
  delivery: string;
  deliveryValue: string;
  library: string;
  refunds: string;
  seller: string;
  support: string;
  creditCard: string;
}> = {
  en: {
    subject: (orderId) => `Payment confirmed — order ${orderId}`,
    heading: 'Payment confirmed',
    thanks: 'Thank you for your purchase.',
    order: 'Order',
    item: 'Book',
    amount: 'Amount paid',
    paidAt: 'Paid at',
    payment: 'Payment',
    delivery: 'Delivery',
    deliveryValue: 'Delivered to your Library after payment confirmation; check your Library for current access',
    library: 'Open your Library',
    refunds: 'Refund policy',
    seller: 'Seller',
    support: 'Support',
    creditCard: 'credit card',
  },
  ja: {
    subject: (orderId) => `お支払い完了 — 注文 ${orderId}`,
    heading: 'お支払いが完了しました',
    thanks: 'ご購入ありがとうございます。',
    order: '注文番号',
    item: '書籍',
    amount: 'お支払い金額',
    paidAt: 'お支払い日時',
    payment: 'お支払い方法',
    delivery: '提供方法',
    deliveryValue: '決済確認後にライブラリへ配信済みです。現在のアクセス状況はライブラリでご確認ください',
    library: 'ライブラリを開く',
    refunds: '返金ポリシー',
    seller: '販売者',
    support: 'お問い合わせ',
    creditCard: 'クレジットカード',
  },
  'zh-TW': {
    subject: (orderId) => `付款完成 — 訂單 ${orderId}`,
    heading: '付款已完成',
    thanks: '感謝您的購買。',
    order: '訂單編號',
    item: '書籍',
    amount: '付款金額',
    paidAt: '付款時間',
    payment: '付款方式',
    delivery: '交付方式',
    deliveryValue: '付款確認後已交付至書庫；目前存取狀態請以書庫顯示為準',
    library: '開啟書庫',
    refunds: '退款政策',
    seller: '銷售者',
    support: '客服',
    creditCard: '信用卡',
  },
};

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing order-email configuration: ${name}`);
  return normalized;
}

function normalizeLocale(locale: string): SupportedLocale {
  if (locale.toLowerCase().startsWith('ja')) return 'ja';
  if (locale.toLowerCase().startsWith('zh')) return 'zh-TW';
  return 'en';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function formatAmount(amountMinor: number, currency: string, locale: SupportedLocale): string {
  const normalizedCurrency = currency.toUpperCase();
  const fractionDigits = normalizedCurrency === 'JPY' ? 0 : 2;
  const amount = amountMinor / (fractionDigits === 0 ? 1 : 100);
  try {
    return `${normalizedCurrency} ${new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount)}`;
  } catch {
    return `${normalizedCurrency} ${amount.toFixed(fractionDigits)}`;
  }
}

function paymentLabel(provider: string, method: string, locale: SupportedLocale): string {
  const normalizedProvider = provider.toLowerCase();
  if (normalizedProvider === 'paypal') return 'PayPal';
  const providerLabel = normalizedProvider === 'ecpay' ? 'ECPay' : provider;
  const methodLabel = method.toLowerCase() === 'credit' ? STRINGS[locale].creditCard : method;
  return `${providerLabel} / ${methodLabel}`;
}

function siteUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

export function isOrderEmailConfigured(env: Env): boolean {
  return env.orderEmailProvider === 'resend'
    && Boolean(env.scheduledJobSecret?.trim())
    && Boolean(env.resendApiKey?.trim())
    && Boolean(env.orderEmailFrom?.trim())
    && Boolean(env.publicSiteUrl?.trim())
    && Boolean(env.supportEmail?.trim())
    && Boolean(env.legalSellerName?.trim());
}

export function buildOrderConfirmationEmail(facts: OrderConfirmationFacts, env: Env): EmailMessage {
  const from = required(env.orderEmailFrom, 'ORDER_EMAIL_FROM');
  const supportEmail = required(env.supportEmail, 'SUPPORT_EMAIL');
  const sellerName = required(env.legalSellerName, 'LEGAL_SELLER_NAME');
  const publicSiteUrl = required(env.publicSiteUrl, 'PUBLIC_SITE_URL');
  const locale = normalizeLocale(facts.locale);
  const strings = STRINGS[locale];
  const amount = formatAmount(facts.amountMinor, facts.currency, locale);
  const payment = paymentLabel(facts.provider, facts.paymentMethod, locale);
  const libraryUrl = siteUrl(publicSiteUrl, '/library');
  const refundUrl = siteUrl(publicSiteUrl, '/legal/refunds');
  const lines = [
    strings.heading,
    strings.thanks,
    '',
    `${strings.order}: ${facts.orderId}`,
    `${strings.item}: ${facts.itemName}`,
    `${strings.amount}: ${amount}`,
    `${strings.paidAt}: ${facts.paidAt}`,
    `${strings.payment}: ${payment}`,
    `${strings.delivery}: ${strings.deliveryValue}`,
    '',
    `${strings.library}: ${libraryUrl}`,
    `${strings.refunds}: ${refundUrl}`,
    `${strings.seller}: ${sellerName}`,
    `${strings.support}: ${supportEmail}`,
  ];
  const rows = [
    [strings.order, facts.orderId],
    [strings.item, facts.itemName],
    [strings.amount, amount],
    [strings.paidAt, facts.paidAt],
    [strings.payment, payment],
    [strings.delivery, strings.deliveryValue],
  ].map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('');

  return {
    to: facts.recipientEmail,
    from,
    replyTo: supportEmail,
    subject: strings.subject(facts.orderId),
    idempotencyKey: `order-confirmation/${facts.orderId}`,
    text: lines.join('\n'),
    html: `<!doctype html><html lang="${escapeHtml(locale)}"><body><main><h1>${escapeHtml(strings.heading)}</h1><p>${escapeHtml(strings.thanks)}</p><table>${rows}</table><p><a href="${escapeHtml(libraryUrl)}">${escapeHtml(strings.library)}</a></p><p><a href="${escapeHtml(refundUrl)}">${escapeHtml(strings.refunds)}</a></p><p>${escapeHtml(strings.seller)}: ${escapeHtml(sellerName)}<br>${escapeHtml(strings.support)}: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p></main></body></html>`,
  };
}

function sanitizedErrorCode(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['name', 'code', 'error']) {
      const value = record[key];
      if (typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value)) return value;
    }
  }
  return fallback;
}

export function createResendEmailSender(env: Env, fetcher: Fetcher = fetch): EmailSender {
  const apiKey = required(env.resendApiKey, 'RESEND_API_KEY');
  if (env.orderEmailProvider !== 'resend') {
    throw new Error('Unsupported ORDER_EMAIL_PROVIDER');
  }
  return {
    async send(message): Promise<EmailSendResult> {
      let response: Awaited<ReturnType<Fetcher>>;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': message.idempotencyKey,
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            reply_to: message.replyTo,
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
          signal: controller.signal,
        });
      } catch {
        return {
          ok: false,
          errorCode: controller.signal.aborted ? 'request_timeout' : 'network_error',
          retryable: true,
        };
      } finally {
        clearTimeout(timeout);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      if (response.ok && payload && typeof payload === 'object') {
        const id = (payload as Record<string, unknown>).id;
        if (typeof id === 'string' && id) return { ok: true, providerMessageId: id };
      }

      const code = sanitizedErrorCode(payload, `http_${response.status}`);
      const concurrentConflict = response.status === 409 && code === 'concurrent_idempotent_requests';
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || concurrentConflict;
      return { ok: false, errorCode: code, retryable };
    },
  };
}
