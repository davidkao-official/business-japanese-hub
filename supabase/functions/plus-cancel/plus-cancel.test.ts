import { describe, expect, it, vi } from 'vitest'
import { ecpayCheckMac } from '../../../src/lib/payments/ecpay/checkmac.ts'
import { ECPAY_URLS } from '../../../src/lib/payments/ecpay/urls.ts'
import type { EcpayTransport } from '../../../src/lib/payments/ecpay/adapter.ts'
import type { DbClient } from '../_shared/db.ts'
import type { HandlerRequest } from '../_shared/http.ts'
import { createMockDb, fakeLogger, testEnv } from '../_shared/testing.ts'
import { handlePlusCancel, type PlusCancelDeps } from './handler.ts'
import { handlePlusPeriodReconcile } from '../plus-period-reconcile/handler.ts'

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
  eq: (column: string, value: unknown) => Chain
  in: () => Chain
  order: () => Chain
  limit: () => Chain
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
  const filters: Array<{ table: string; column: string; value: unknown }> = []
  const chain = (table: string): Chain => {
    const builder: Chain = {
      select: () => builder,
      eq: (column, value) => {
        filters.push({ table, column, value })
        return builder
      },
      in: () => builder,
      order: () => builder,
      limit: () => builder,
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
      if (fn === 'confirm_plus_ecpay_customer_cancel') {
        options.order = { ...options.order, status: 'canceled', provider_canceled_at: args.p_confirmed_at }
        return Promise.resolve({ data: { provider_canceled_at: args.p_confirmed_at }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null }),
    },
  } as unknown as DbClient
  return { db, rpcCalls, filters }
}

function fakeTransport(fields: Record<string, string>, status = 200): EcpayTransport {
  return {
    post: vi.fn(async (url: string) => url === ECPAY_URLS.stage.queryCreditCardPeriodInfo ? {
      status: 200,
      body: JSON.stringify({ MerchantTradeNo: MTN, RtnCode: 1, ExecStatus: '0', ExecLog: [] }),
    } : {
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
  user_id: 'verified-user',
  plan_code: 'plus_early_access_monthly',
  environment: 'stage',
  period_amount_twd: 299,
  status: 'active',
  updated_at: CANCEL_REQUESTED_AT,
}
const SUMMARY = { period_start: PERIOD_START, period_end: PERIOD_END, access_period_end: PERIOD_END }

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

  it('returns 404 for a legacy canceled order without stop evidence', async () => {
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'verified-user' } },
      plus_membership_ecpay_order: { singleData: [null, { ...ACTIVE_ORDER, status: 'canceled' }] },
    })
    const transport = fakeTransport({})
    const result = await handlePlusCancel(request('POST', 'Bearer token'), deps({ db: mock.db, transport }))
    expect(result.status).toBe(404)
    expect(transport.post).not.toHaveBeenCalled()
  })

  it('persists the provider stop and returns the known paid window without freezing a terminal cutoff', async () => {
    const { db, rpcCalls, filters } = fakeDb({ order: ACTIVE_ORDER, summary: SUMMARY })
    const log = fakeLogger()
    const transport = fakeTransport(await providerResponse())

    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'),
      deps({ db, log, transport }),
    )

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ status: 'canceled', accessUntil: PERIOD_END })
    expect(filters).toContainEqual({
      table: 'plus_membership_ecpay_order',
      column: 'user_id',
      value: 'verified-user',
    })
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(rpcCalls.map((call) => call.fn)).toEqual([
      'set_plus_ecpay_order_status', 'confirm_plus_ecpay_customer_cancel',
      'complete_plus_ecpay_cancel_readback',
    ])
    expect(rpcCalls[0].args).toEqual({ p_merchant_trade_no: MTN, p_status: 'cancel_requested' })
    expect(rpcCalls[1].args).toMatchObject({ p_merchant_trade_no: MTN, p_rtn_code: '1',
      p_confirmed_at: '2026-11-01T00:00:00.000Z',
    })
    expect(rpcCalls[1].args.p_facts_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(log.error).not.toHaveBeenCalled()
  })

  it('persists the verified stop for an already requested cancellation', async () => {
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
      'confirm_plus_ecpay_customer_cancel', 'complete_plus_ecpay_cancel_readback',
    ])
    expect(rpcCalls[0].args.p_confirmed_at).toBe('2026-11-01T09:00:00.000Z')
  })

  it('integrates #281 read-back and anchor periods after persisting the verified stop', async () => {
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'verified-user' } },
      plus_membership_ecpay_order: { data: ACTIVE_ORDER },
      plus_membership_ecpay_receipt: { data: { process_at: '2027-01-30T16:30:00.000Z' } },
      plus_membership_stream_summary: { data: SUMMARY },
      'rpc:confirm_plus_ecpay_customer_cancel': { data: { provider_canceled_at: '2027-03-01T00:00:00.000Z' } },
      'rpc:record_plus_ecpay_authorization': { rpcResults: [
        { data: { status: 'new', source_event_id: `${MTN}:auth:1`, total_success_times: 1 } },
        { data: { status: 'new', source_event_id: `${MTN}:auth:2`, total_success_times: 2 } },
      ] },
      'rpc:record_plus_membership_event': { data: 'applied' },
      'rpc:resolve_plus_membership_access': { data: { access_status: 'active' } },
    })
    const renewalEnd = '2027-04-01T16:00:00.000Z'
    const rpc = mock.db.rpc
    mock.db.rpc = vi.fn(async (fn, args) => {
      const result = await rpc(fn, args)
      if (fn === 'record_plus_membership_event' && args.p_event_type === 'membership_renewed') {
        mock.setRoute('plus_membership_stream_summary', { data: {
          period_start: args.p_period_start, period_end: args.p_period_end, access_period_end: args.p_period_end,
        } })
      }
      return result
    })
    const transport = fakeTransport(await providerResponse())
    vi.mocked(transport.post).mockResolvedValueOnce({
      status: 200, body: new URLSearchParams(await providerResponse()).toString(),
    }).mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({ MerchantTradeNo: MTN, RtnCode: 1, ExecStatus: '0', ExecLog: [
        { RtnCode: 1, amount: 299, gwsr: 2, process_date: '2027/02/28 23:00:00' },
        { RtnCode: 1, amount: 299, gwsr: 1, process_date: '2027/01/31 00:30:00' },
      ] }),
    })
    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'), deps({ db: mock.db, transport, now: () => new Date('2027-03-01T00:00:00.000Z') }),
    )
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body).accessUntil).toBe(renewalEnd)
    expect(vi.mocked(transport.post).mock.calls.map(([url]) => url)).toEqual([
      ECPAY_URLS.stage.creditCardPeriodAction, ECPAY_URLS.stage.queryCreditCardPeriodInfo,
    ])
    expect(mock.rpcCalls('record_plus_ecpay_authorization')).toHaveLength(2)
    expect(mock.rpcCalls('record_plus_membership_event').map((call) => call.args[0]))
      .toEqual([
        expect.objectContaining({ p_event_type: 'membership_started' }),
        expect.objectContaining({ p_event_type: 'membership_renewed', p_period_end: renewalEnd }),
      ])
  })

  it.each(['query', 'ingest', 'exception'])('still cancels and logs an error if read-back fails (%s)', async (failure) => {
    const { db } = fakeDb({ order: ACTIVE_ORDER, summary: SUMMARY })
    const log = fakeLogger()
    const transport = fakeTransport(await providerResponse())
    vi.mocked(transport.post).mockResolvedValueOnce({
      status: 200, body: new URLSearchParams(await providerResponse()).toString(),
    }).mockResolvedValueOnce(failure === 'query' ? { status: 500, body: '' } : {
      status: 200,
      body: JSON.stringify({ MerchantTradeNo: MTN, RtnCode: 1, ExecStatus: '0', ExecLog: [
        { RtnCode: 1, amount: 299, gwsr: 1, process_date: '2027/01/31 00:30:00' },
      ] }),
    })
    const rpc = db.rpc
    db.rpc = vi.fn(async (fn, args) => {
      if (fn === 'record_plus_ecpay_authorization') {
        if (failure === 'exception') throw new Error('database connection lost')
        return { data: null, error: { message: 'database unavailable' } }
      }
      return rpc(fn, args)
    })
    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'), deps({ db, log, transport }),
    )
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body).accessUntil).toBe(PERIOD_END)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ merchantTradeNo: MTN }),
      'ecpay plus cancel read-back failed; using recorded paid period',
    )
  })

  it('reconciles a failed read-back after returning the recorded paid window', async () => {
    const providerCanceledAt = '2026-11-01T00:00:00.000Z'
    const canceledOrder = { ...ACTIVE_ORDER, status: 'canceled', provider_canceled_at: providerCanceledAt }
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'verified-user' } },
      plus_membership_ecpay_order: { singleData: [ACTIVE_ORDER, null, canceledOrder] },
      plus_membership_stream_summary: { data: SUMMARY },
      'rpc:confirm_plus_ecpay_customer_cancel': { data: { provider_canceled_at: providerCanceledAt } },
      'rpc:claim_plus_ecpay_reconcile_order': { rpcResults: [{ data: canceledOrder }, { data: null }] },
    })
    const fields = await providerResponse()
    const transport = fakeTransport(fields)
    vi.mocked(transport.post)
      .mockResolvedValueOnce({ status: 200, body: new URLSearchParams(fields).toString() })
      .mockRejectedValueOnce(new Error('read-back failed'))
    const cancelDeps = deps({ db: mock.db, transport })
    const cancel = () => handlePlusCancel(request('POST', 'Bearer token'), cancelDeps)
    const first = await cancel()
    expect(first.status).toBe(200)
    expect(JSON.parse(first.body)).toEqual({ status: 'canceled', accessUntil: PERIOD_END })
    expect(mock.rpcCalls('confirm_plus_ecpay_customer_cancel')).toHaveLength(1)
    expect(mock.rpcCalls('complete_plus_ecpay_cancel_readback')).toHaveLength(0)

    const reconcile = await handlePlusPeriodReconcile({
      method: 'POST', url: 'https://example.test/reconcile',
      headers: { 'x-scheduled-job-secret': 'test-scheduled-secret' }, bodyText: '',
    }, cancelDeps)
    expect(JSON.parse(reconcile.body)).toEqual({ checked: 1, ingested: 0, failed: 0 })
    expect(mock.rpcCalls('complete_plus_ecpay_cancel_readback')).toHaveLength(1)

    const retry = await cancel()
    expect(retry.status).toBe(200)
    expect(JSON.parse(retry.body)).toEqual({ status: 'canceled', accessUntil: PERIOD_END })
    expect(mock.rpcCalls('confirm_plus_ecpay_customer_cancel')).toHaveLength(1)
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0)
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

  it('confirms the provider stop without inventing access when no paid period is recorded', async () => {
    const { db, rpcCalls } = fakeDb({ order: ACTIVE_ORDER, summary: null })
    const transport = fakeTransport(await providerResponse())

    const result = await handlePlusCancel(
      request('POST', 'Bearer verified-token'),
      deps({ db, log: fakeLogger(), transport }),
    )

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ status: 'canceled', accessUntil: null })
    expect(rpcCalls.some((call) => call.fn === 'record_plus_membership_event')).toBe(false)
  })

})
