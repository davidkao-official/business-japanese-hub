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
  ecpayMerchantId: string;
  ecpayHashKey: string;
  ecpayHashIV: string;
  /** 'stage' | 'prod'; undefined fails closed to stage (§16 — never mixed). */
  ecpayEnv: EcpayEnv | undefined;
  /** PayPal OAuth client id (server-only; never client-facing, §15). */
  paypalClientId: string;
  /** PayPal OAuth client secret (server-only; never client-facing, §15). */
  paypalClientSecret: string;
  /** 'stage' | 'prod'; undefined fails closed to sandbox (§16). */
  paypalEnv: PaypalEnv | undefined;
  /** Server-configured webhook id used by verify-webhook-signature (§21). */
  paypalWebhookId: string;
  /** Secret shared with the pg_cron / pg_net scheduled-job callers. */
  scheduledJobSecret: string | undefined;
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
    ecpayMerchantId: required(reader, 'ECPAY_MERCHANT_ID'),
    ecpayHashKey: required(reader, 'ECPAY_HASH_KEY'),
    ecpayHashIV: required(reader, 'ECPAY_HASH_IV'),
    ecpayEnv: parseEcpayEnv(reader.get('ECPAY_ENV')),
    paypalClientId: required(reader, 'PAYPAL_CLIENT_ID'),
    paypalClientSecret: required(reader, 'PAYPAL_CLIENT_SECRET'),
    paypalEnv: parsePaypalEnv(reader.get('PAYPAL_ENV')),
    paypalWebhookId: required(reader, 'PAYPAL_WEBHOOK_ID'),
    scheduledJobSecret: reader.get('SCHEDULED_JOB_SECRET'),
    fundingReconCsv: reader.get('FUNDING_RECON_CSV'),
  };
}

/** Resolve a deployed Edge Function URL for this project (ingress §3.5). */
export function edgeFunctionUrl(env: Env, name: string): string {
  return `${env.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`;
}
