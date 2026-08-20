/**
 * Test-only helpers for the Edge Function handlers.
 *
 * Injected fakes only — no network, no DB, no Deno. `createMockDb` records every
 * query/insert/update/rpc call and returns per-table data/error at terminal
 * methods, mirroring the repo's existing `src/lib/persistence/supabase.test.ts`
 * pattern. `createFakeAdapter` is a `PaymentProviderAdapter` whose
 * `verifyCallback` / `confirmPayment` / `createCheckout` are `vi.fn()`s.
 *
 * This module is never imported by any Deno entry (`index.ts`), so it is never
 * bundled by `supabase functions deploy`.
 */
import { vi } from 'vitest';
import type { PaymentProviderAdapter } from '../../../src/lib/payments/contract.ts';
import type { Env } from './env.ts';
import type { DbClient } from './db.ts';
import type { Logger } from './log.ts';

export interface MockRoute {
  data?: unknown;
  error?: string;
}

export interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

export interface MockDb {
  db: DbClient;
  calls: RecordedCall[];
  setRoute(table: string, route: MockRoute): void;
  callsFor(table: string, method?: string): RecordedCall[];
  rpcCalls(fn: string): RecordedCall[];
}

export function createMockDb(initial?: Record<string, MockRoute>): MockDb {
  const routes: Record<string, MockRoute> = { ...(initial ?? {}) };
  const calls: RecordedCall[] = [];

  const record = (table: string, method: string, args: unknown[]): void => {
    calls.push({ table, method, args });
  };
  const makeError = (message: string) => ({ message });
  const routeResult = (table: string) => {
    const route = routes[table];
    if (route?.error) return { data: null, error: makeError(route.error) };
    return { data: route?.data ?? null, error: null };
  };
  // `maybeSingle`/`single` return ONE row: normalize an array route to its first
  // element (a list-shaped route can serve both list and single lookups).
  const singleResult = (table: string) => {
    const route = routes[table];
    if (route?.error) return { data: null, error: makeError(route.error) };
    const raw = route?.data ?? null;
    const data = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    return { data, error: null };
  };

  // Each `from()` returns a builder bound to ITS OWN table so concurrent queries
  // (e.g. the finance read model's Promise.all) never read another table's route.
  const makeBuilder = (table: string) => {
    const builder: Record<string, (...args: unknown[]) => unknown> = {
      select: (...args) => {
        record(table, 'select', args);
        return builder;
      },
      eq: (...args) => {
        record(table, 'eq', args);
        return builder;
      },
      neq: (...args) => {
        record(table, 'neq', args);
        return builder;
      },
      lte: (...args) => {
        record(table, 'lte', args);
        return builder;
      },
      gte: (...args) => {
        record(table, 'gte', args);
        return builder;
      },
      in: (...args) => {
        record(table, 'in', args);
        return builder;
      },
      or: (...args) => {
        record(table, 'or', args);
        return builder;
      },
      order: (...args) => {
        record(table, 'order', args);
        return builder;
      },
      limit: (...args) => {
        record(table, 'limit', args);
        return builder;
      },
      insert: (...args) => {
        record(table, 'insert', args);
        return builder;
      },
      upsert: (...args) => {
        record(table, 'upsert', args);
        return builder;
      },
      update: (...args) => {
        record(table, 'update', args);
        return builder;
      },
      delete: (...args) => {
        record(table, 'delete', args);
        return builder;
      },
      maybeSingle: async (...args: unknown[]) => {
        record(table, 'maybeSingle', args);
        return singleResult(table);
      },
      single: async (...args: unknown[]) => {
        record(table, 'single', args);
        return singleResult(table);
      },
      then: (...args: unknown[]) => {
        record(table, 'then', []);
        const onfulfilled = args[0] as
          | ((value: { data: unknown; error: { message: string } | null }) => unknown)
          | null
          | undefined;
        return Promise.resolve(routeResult(table)).then(onfulfilled);
      },
    };
    return builder;
  };

  const client = {
    from: (table: string) => makeBuilder(table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      record('rpc', fn, [args]);
      const route = routes[`rpc:${fn}`] ?? routes.rpc;
      if (route?.error) return { data: null, error: makeError(route.error) };
      return { data: route?.data ?? null, error: null };
    },
    auth: {
      getUser: async (token: string) => {
        record('auth', 'getUser', [token]);
        const route = routes['auth:getUser'];
        if (route?.error) return { data: null, error: makeError(route.error) };
        return { data: { user: route?.data ?? null }, error: null };
      },
    },
  } as unknown as DbClient;

  return {
    db: client,
    calls,
    setRoute: (table, route) => {
      routes[table] = route;
    },
    callsFor: (table, method) =>
      calls.filter((call) => call.table === table && (method === undefined || call.method === method)),
    rpcCalls: (fn) => calls.filter((call) => call.table === 'rpc' && call.method === fn),
  };
}

export interface FakeAdapter {
  provider: string;
  createCheckout: ReturnType<typeof vi.fn>;
  verifyCallback: ReturnType<typeof vi.fn>;
  confirmPayment: ReturnType<typeof vi.fn>;
  refund: ReturnType<typeof vi.fn>;
  reconcile: ReturnType<typeof vi.fn>;
}

export function createFakeAdapter(provider = 'ecpay'): FakeAdapter & PaymentProviderAdapter {
  const adapter: FakeAdapter = {
    provider,
    createCheckout: vi.fn(),
    verifyCallback: vi.fn(),
    confirmPayment: vi.fn(),
    refund: vi.fn(),
    reconcile: vi.fn().mockResolvedValue({ provider, entries: [] }),
  };
  return adapter as FakeAdapter & PaymentProviderAdapter;
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    supabaseUrl: 'https://test.supabase.co',
    supabaseServiceRoleKey: 'test-service-role-key',
    ecpayMerchantId: '2000132',
    ecpayHashKey: 'test-hash-key',
    ecpayHashIV: 'test-hash-iv',
    ecpayEnv: 'stage',
    paypalClientId: 'test-paypal-client-id',
    paypalClientSecret: 'test-paypal-client-secret',
    paypalEnv: 'sandbox',
    paypalWebhookId: 'test-webhook-id',
    scheduledJobSecret: 'test-scheduled-secret',
    orderEmailProvider: 'resend',
    resendApiKey: 'test-resend-api-key',
    orderEmailFrom: 'Business Japanese Hub <receipts@example.com>',
    publicSiteUrl: 'https://business-japanese.example',
    supportEmail: 'support@example.com',
    legalSellerName: 'Example Seller',
    fundingReconCsv: undefined,
    ...overrides,
  };
}

export function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

export function handlerRequest(
  method: string,
  url: string,
  bodyText = '',
  headers: Record<string, string> = {},
): { method: string; url: string; bodyText: string; headers: Record<string, string> } {
  return { method, url, bodyText, headers };
}

export function bearerHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export const ORDER_ROW = {
  id: 'ord-1',
  user_id: 'user-1',
  book_id: 'book-a',
  item_name_snapshot: '敬語エッセンシャル',
  customer_email_snapshot: 'buyer@example.com',
  published_revision: 'keigo-essentials@e1-r1',
  amount_minor: 79000,
  currency: 'TWD',
  status: 'pending',
  jurisdiction: 'TW',
  japan_tax_status_snapshot: 'unresolved',
  created_at: '2026-08-16T08:00:00Z',
  paid_at: null,
  refunded_at: null,
};

export const PAYMENT_ROW = {
  id: 'pay-1',
  order_id: 'ord-1',
  provider: 'ecpay',
  provider_merchant_ref: 'BJH123456789',
  provider_payment_ref: null,
  amount_minor: 79000,
  currency: 'TWD',
  method: 'credit',
  status: 'created',
  provider_status_code: null,
  provider_status_message: null,
  created_at: '2026-08-16T08:00:00Z',
  paid_at: null,
  last_verified_at: null,
  provider_fee_amount_minor: null,
  reconciliation_status: null,
};
