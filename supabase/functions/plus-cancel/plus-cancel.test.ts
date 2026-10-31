import { describe, expect, it, vi } from 'vitest'
import { ecpayCheckMac } from '../../../src/lib/payments/ecpay/checkmac.ts'
import type { EcpayTransport } from '../../../src/lib/payments/ecpay/adapter.ts'
import type { DbClient } from '../_shared/db.ts'
import type { HandlerRequest } from '../_shared/http.ts'
import { fakeLogger, testEnv } from '../_shared/testing.ts'
import { handlePlusCancel, type PlusCancelDeps } from './handler.ts'

const MTN = 'BJHP0123456789ABCDEF'
const HASH_KEY = 'test-hash-key'
const HASH_IV = 'test-hash-iv'
const PERIOD_START = '2026-11-01T00:00:00.000Z'
const PERIOD_END = '2026-12-01T00:00:00.000Z'
const CANCEL_REQUESTED_AT = '2026-10-31T12:00:00.000Z'

function request(method = 'POST', authorization?: string): HandlerRequest {
  return {
    method,
    url: 'https://example.test/plus-cancel',
    headers: authorization ? { authorization } : {},
    bodyText: '',
  }
}

type Chain = {
  select: () => Chain
  eq: () => Chain
  in: () => Chain
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null
    error: { message: string } | null
  }>
}

interface FakeDbOptions {
  order?: Record<string, unknown> | null
  orderError?: boolean
  summary?: Record<string, unknown> | null
  summaryError?: boolean
}

function fakeDb(options: FakeDbOptions = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const chain = (table: string): Chain => {
    const builder: Chain = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      maybeSingle: () =>
        Promise.resolve(
          table === 'plus_membership_ecpay_order'
            ? {
              data: options.order ?? null,
              error: options.orderError ? { message: 'database unavailable' } : null,
            }
            : {
              data: options.summary ?? null,
              error: options.summaryError ? { message: 'database unavailable' } : null,
            },
        ),
    }
    return builder
  }
  const db = {
    from: vi.fn((table: string) => chain(table)),
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve({ data: null, error: null })
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null }),
    },
  } as unknown as DbClient
  return { db, rpcCalls }
}

function fakeTransport(fields: Record<string, string>, status = 200): EcpayTransport {
  return {
    post: vi.fn().mockResolvedValue({
      status,
      body: new URLSearchParams(fields).toString(),
    }),
  } as unknown as EcpayTransport
}

async function providerResponse(
  overrides: Record<string, string> = {},
): Promise<Record<string, string>> {
  const fields = {
    MerchantID: '2000132',
    MerchantTradeNo: MTN,
    RtnCode: '1',
    RtnMsg: 'OK',
    ...overrides,
  }
  return { ...fields, CheckMacValue: await ecpayCheckMac(fields, HASH_KEY, HASH_IV) }
}

function deps(overrides: Partial<PlusCancelDeps> = {}): PlusCancelDeps {
  return {
    env: testEnv(),
    db: fakeDb().db,
    log: fakeLogger(),
    now: () => new Date('2026-11-01T00:00:00Z'),
    transport: fakeTransport({}),
    ...overrides,
  }
}

const ACTIVE_ORDER = {
  merchant_trade_no: MTN,
  status: 'active',
  updated_at: CANCEL_REQUESTED_AT,
}
const SUMMARY = { period_start: PERIOD_START, period_end: PERIOD_END }

describe('Plus cancel Edge handler', () => {
  it('allows only the cancel method', async () => {
    const result = await handlePlusCancel(request('GET'), deps())
    expect(result.status).toBe(405)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
  })

  it('requires a verified bearer subject', async () => {
    expect((await handlePlusCancel(request(), deps())).status).toBe(401)

    const invalid = fakeDb()
    invalid.db.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' },
    })
    expect(
      (await handlePlusCancel(request('POST', 'Bearer invalid-token'), deps({ db: invalid.db })))
        .status,
    ).toBe(401)
  })

  it('returns 404 when the verified user has no active ECPay order', async () => {
    const { db, rpcCalls } = fakeDb({ order: null })
    const result = await handlePlusCancel(request('POST', 'Bearer verified-token'), deps({ db }))
    expect(result.status).toBe(404)
    expect(rpcCalls).toEqual([])
  })

  it('cancels the subscription at period end and returns the current access window', async () => {
    const { db, rpcCalls } = fakeDb({ order: ACTIVE_ORDER, summary: SUMMARY })
    const log = fakeLogger()
    const transport = fakeTransport(await providerResponse())

    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'),
      deps({ db, log, transport }),
    )

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ status: 'canceled', accessUntil: PERIOD_END })
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(rpcCalls.map((call) => call.fn)).toEqual([
      'set_plus_ecpay_order_status',
      'record_plus_membership_event',
      'set_plus_ecpay_order_status',
    ])
    expect(rpcCalls[0].args).toEqual({
      p_merchant_trade_no: MTN,
      p_status: 'cancel_requested',
    })
    expect(rpcCalls[1].args).toMatchObject({
      p_source_system: 'ecpay_aio_period:stage',
      p_source_customer_id: MTN,
      p_source_subscription_id: MTN,
      p_source_event_id: `${MTN}:cancel`,
      p_user_id: 'verified-user',
      p_plan_code: 'plus_early_access_monthly',
      p_event_type: 'membership_canceled',
      p_occurred_at: CANCEL_REQUESTED_AT,
      p_period_start: PERIOD_START,
      p_period_end: PERIOD_END,
      p_cancel_at_period_end: true,
    })
    expect(rpcCalls[2].args).toEqual({
      p_merchant_trade_no: MTN,
      p_status: 'canceled',
    })
    expect(log.error).not.toHaveBeenCalled()
  })

  it('replays the stored cancel-request time for an already cancel_requested order', async () => {
    const { db, rpcCalls } = fakeDb({
      order: {
        merchant_trade_no: MTN,
        status: 'cancel_requested',
        updated_at: CANCEL_REQUESTED_AT,
      },
      summary: SUMMARY,
    })

    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'),
      deps({
        db,
        now: () => new Date('2026-11-01T09:00:00Z'),
        transport: fakeTransport(await providerResponse()),
      }),
    )

    expect(result.status).toBe(200)
    expect(rpcCalls.map((call) => call.fn)).toEqual([
      'record_plus_membership_event',
      'set_plus_ecpay_order_status',
    ])
    expect(rpcCalls[0].args.p_occurred_at).toBe(CANCEL_REQUESTED_AT)
  })

  it('treats the already-terminated provider result as success', async () => {
    const { db } = fakeDb({ order: ACTIVE_ORDER, summary: SUMMARY })
    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'),
      deps({ db, transport: fakeTransport(await providerResponse({ RtnCode: '90100149' })) }),
    )
    expect(result.status).toBe(200)
  })

  it('fails closed when ECPay rejects the cancel', async () => {
    const { db, rpcCalls } = fakeDb({ order: ACTIVE_ORDER, summary: SUMMARY })
    const log = fakeLogger()

    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'),
      deps({ db, log, transport: fakeTransport(await providerResponse({ RtnCode: '10100058' })) }),
    )

    expect(result.status).toBe(502)
    expect(JSON.parse(result.body)).toEqual({ error: 'provider cancel failed' })
    expect(rpcCalls.map((call) => call.args.p_status)).toEqual(['cancel_requested'])
    expect(log.error).toHaveBeenCalledWith(
      { merchantTradeNo: MTN, rtnCode: '10100058' },
      'ecpay plus cancel rejected',
    )
  })

  it('fails closed when the provider CheckMacValue does not verify', async () => {
    const { db, rpcCalls } = fakeDb({ order: ACTIVE_ORDER, summary: SUMMARY })
    const response = { ...(await providerResponse()), CheckMacValue: 'BADCHECKMACVALUE' }

    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'),
      deps({ db, transport: fakeTransport(response) }),
    )

    expect(result.status).toBe(502)
    expect(rpcCalls.map((call) => call.args.p_status)).toEqual(['cancel_requested'])
  })

  it('fails closed when the provider response carries no CheckMacValue', async () => {
    const { db, rpcCalls } = fakeDb({ order: ACTIVE_ORDER, summary: SUMMARY })

    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'),
      deps({
        db,
        transport: fakeTransport({
          MerchantID: '2000132',
          MerchantTradeNo: MTN,
          RtnCode: '1',
          RtnMsg: 'OK',
        }),
      }),
    )

    expect(result.status).toBe(502)
    expect(rpcCalls.map((call) => call.args.p_status)).toEqual(['cancel_requested'])
  })
})
