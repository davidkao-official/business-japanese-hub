/**
 * Edge Function environment contract (decision-record §15 / §16 / §3.5).
 *
 * All provider secrets (`ECPAY_HASH_KEY` / `ECPAY_HASH_IV`) and the service-role
 * key exist ONLY server-side. `Env` is the injectable, pure shape every handler
 * receives; `readEnvFrom` is the Deno boundary implementation that reads
 * `Deno.env` (injected so tests never touch process/Deno globals). Secrets are
 * never logged and never returned in any handler response.
 *
 * The ECPay callback / browser-return URLs are derived from `SUPABASE_URL`
 * (`<url>/functions/v1/<name>`) so the AioCheckOut `ReturnURL` /
 * `OrderResultURL` always point at the same project's Edge Function gateway.
 */
import type { EcpayEnv } from '../../../src/lib/payments/ecpay/urls.ts';
import type { PaypalEnv } from '../../../src/lib/payments/paypal/urls.ts';

export type { EcpayEnv };
export type { PaypalEnv };

/** Injectable, pure environment snapshot read at the Deno boundary. */
export interface Env {
  supabaseUrl: string;
  /** Server-only; the ONLY key used to build the DB client (never the anon key). */
  supabaseServiceRoleKey: string;
  /** ECPay credentials are provider-scoped; optional for PayPal-only deploys. */
  ecpayMerchantId?: string;
  ecpayHashKey?: string;
  ecpayHashIV?: string;
  /** 'stage' | 'prod'; undefined fails closed to stage (§16 — never mixed). */
  ecpayEnv: EcpayEnv | undefined;
  /**
   * PayPal OAuth client id (server-only; never client-facing, §15). Optional:
   * ECPay-only deployments must keep working without PayPal credentials —
   * PayPal config is required only when a PayPal operation is actually used.
   */
  paypalClientId?: string;
  /** PayPal OAuth client secret (server-only; never client-facing, §15). Optional. */
  paypalClientSecret?: string;
  /** 'sandbox' | 'prod'; undefined fails closed to sandbox (§16). Optional. */
  paypalEnv: PaypalEnv | undefined;
  /** Server-configured webhook id used by verify-webhook-signature (§21). Optional. */
  paypalWebhookId?: string;
  /** Secret shared with the pg_cron / pg_net scheduled-job callers. */
  scheduledJobSecret: string | undefined;
  /** Transactional-email adapter selection. Undefined disables email delivery. */
  orderEmailProvider: string | undefined;
  /** Resend API key. Server-only and optional until the Resend adapter is selected. */
  resendApiKey: string | undefined;
  /** RFC 5322 From identity configured for transactional order email. */
  orderEmailFrom: string | undefined;
  /** Canonical public origin used to build Library and policy links. */
  publicSiteUrl: string | undefined;
  /** Public support address shown in transactional email and used as Reply-To. */
  supportEmail: string | undefined;
  /** Legal seller display name shown on the receipt; never inferred in code. */
  legalSellerName: string | undefined;
  /**
   * Optional production FundingReconDetail CSV source for Layer C reconciliation
   * (decision-record §6). Not configured → Layer C logs and skips.
   */
  fundingReconCsv: string | undefined;
}

/** Minimal reader over the environment (satisfied by `Deno.env`). */
export interface EnvReader {
  get(key: string): string | undefined;
}

function required(reader: EnvReader, key: string): string {
  const value = reader.get(key);
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** Parse `ECPAY_ENV`; anything other than 'prod' fails closed to stage. */
function parseEcpayEnv(value: string | undefined): EcpayEnv | undefined {
  if (value === 'prod') return 'prod';
  if (value === 'stage') return 'stage';
  return undefined;
}

/** Parse `PAYPAL_ENV`; anything other than 'prod' fails closed to sandbox. */
function parsePaypalEnv(value: string | undefined): PaypalEnv | undefined {
  if (value === 'prod') return 'prod';
  if (value === 'sandbox') return 'sandbox';
  return undefined;
}

/** Deno boundary implementation — reads from an injected `Deno.env`-shaped reader. */
export function readEnvFrom(reader: EnvReader): Env {
  return {
    supabaseUrl: required(reader, 'SUPABASE_URL'),
    supabaseServiceRoleKey: required(reader, 'SUPABASE_SERVICE_ROLE_KEY'),
    ecpayMerchantId: reader.get('ECPAY_MERCHANT_ID'),
    ecpayHashKey: reader.get('ECPAY_HASH_KEY'),
    ecpayHashIV: reader.get('ECPAY_HASH_IV'),
    ecpayEnv: parseEcpayEnv(reader.get('ECPAY_ENV')),
    // Provider credentials are OPTIONAL at read time. Adapter/handler seams
    // enforce the selected provider before any state change.
    paypalClientId: reader.get('PAYPAL_CLIENT_ID'),
    paypalClientSecret: reader.get('PAYPAL_CLIENT_SECRET'),
    paypalEnv: parsePaypalEnv(reader.get('PAYPAL_ENV')),
    paypalWebhookId: reader.get('PAYPAL_WEBHOOK_ID'),
    scheduledJobSecret: reader.get('SCHEDULED_JOB_SECRET'),
    orderEmailProvider: reader.get('ORDER_EMAIL_PROVIDER'),
    resendApiKey: reader.get('RESEND_API_KEY'),
    orderEmailFrom: reader.get('ORDER_EMAIL_FROM'),
    publicSiteUrl: reader.get('PUBLIC_SITE_URL'),
    supportEmail: reader.get('SUPPORT_EMAIL'),
    legalSellerName: reader.get('LEGAL_SELLER_NAME'),
    fundingReconCsv: reader.get('FUNDING_RECON_CSV'),
  };
}

/** Resolve a deployed Edge Function URL for this project (ingress §3.5). */
export function edgeFunctionUrl(env: Env, name: string): string {
  return `${env.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`;
}
