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

export type { EcpayEnv };

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

/** Deno boundary implementation — reads from an injected `Deno.env`-shaped reader. */
export function readEnvFrom(reader: EnvReader): Env {
  return {
    supabaseUrl: required(reader, 'SUPABASE_URL'),
    supabaseServiceRoleKey: required(reader, 'SUPABASE_SERVICE_ROLE_KEY'),
    ecpayMerchantId: required(reader, 'ECPAY_MERCHANT_ID'),
    ecpayHashKey: required(reader, 'ECPAY_HASH_KEY'),
    ecpayHashIV: required(reader, 'ECPAY_HASH_IV'),
    ecpayEnv: parseEcpayEnv(reader.get('ECPAY_ENV')),
    scheduledJobSecret: reader.get('SCHEDULED_JOB_SECRET'),
    fundingReconCsv: reader.get('FUNDING_RECON_CSV'),
  };
}

/** Resolve a deployed Edge Function URL for this project (ingress §3.5). */
export function edgeFunctionUrl(env: Env, name: string): string {
  return `${env.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`;
}
