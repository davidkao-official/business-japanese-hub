import { describe, expect, it, vi } from 'vitest'
import type { DbClient } from '../_shared/db.ts'
import type { HandlerRequest } from '../_shared/http.ts'
import { testEnv } from '../_shared/testing.ts'
import { handlePlusCheckout, PLUS_CHECKOUT_PLAN_CODE } from './handler.ts'

function request(
  method = 'POST',
  authorization?: string,
  bodyText = JSON.stringify({ consentRevision: 'test-consent-1' }),
): HandlerRequest {
  return {
    method,
    url: 'https://example.test/plus-checkout',
    headers: authorization ? { authorization } : {},
    bodyText,
  }
}

function dbWith(options: {
  data?: Record<string, unknown> | Array<Record<string, unknown>> | null
  error?: { message: string } | null
  rejected?: boolean
} = {}) {
  const rpc = options.rejected
    ? vi.fn().mockRejectedValue(new Error('database unavailable'))
    : vi.fn().mockResolvedValue({
      data: options.data ?? [{ merchant_trade_no: 'P202610270001', period_amount_twd: 299, exec_times: 99 }],
      error: options.error ?? null,
    })
  const db = {
    from: vi.fn(),
    rpc,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'verified-user' } },
        error: null,
      }),
    },
  } as unknown as DbClient
  return { db, rpc }
}

function deps(
  db: DbClient,
  overrides: Partial<ReturnType<typeof testEnv>> = {},
  membershipAccessFor = vi.fn().mockResolvedValue('non-member' as const),
) {
  return {
    env: testEnv(overrides),
    db,
    now: () => new Date('2026-10-27T03:00:00.000Z'),
    membershipAccessFor,
  }
}

function body(result: { body: string }): Record<string, unknown> {
  return JSON.parse(result.body)
}

describe('Plus checkout Edge handler', () => {
  it('allows GET and POST only and disables caching', async () => {
    const { db } = dbWith()
    const result = await handlePlusCheckout(request('PUT'), deps(db))
    expect(result.status).toBe(405)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
  })

  it('reports the checkout gate as open without authentication', async () => {
    const { db } = dbWith()
    const result = await handlePlusCheckout(request('GET'), deps(db))
    expect(result.status).toBe(200)
    expect(body(result)).toEqual({ open: true, consentRevision: 'test-consent-1' })
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
  })

  it('reports the checkout gate as closed when the Owner gate is shut', async () => {
    const { db } = dbWith()
    const result = await handlePlusCheckout(
      request('GET'),
      deps(db, { plusCheckoutAdmitted: false }),
    )
    expect(result.status).toBe(200)
    expect(body(result)).toEqual({ open: false, consentRevision: null })
  })

  it('requires a verified bearer session', async () => {
    const { db, rpc } = dbWith()
    const result = await handlePlusCheckout(request(), deps(db))
    expect(result.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['Owner admission is closed', { plusCheckoutAdmitted: false }],
    ['consent revision is unset', { plusConsentRevision: undefined }],
    ['provider environment is misaligned', { deploymentEnv: 'production' as const }],
  ])('keeps checkout closed when %s', async (_label, overrides) => {
    const { db, rpc } = dbWith()
    const result = await handlePlusCheckout(
      request('POST', 'Bearer valid-session'),
      deps(db, overrides),
    )
    expect(result.status).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['no body', ''],
    ['a stale consent revision', JSON.stringify({ consentRevision: 'old-consent' })],
  ])('rejects checkout with %s before creating an order', async (_label, bodyText) => {
    const { db, rpc } = dbWith()
    const result = await handlePlusCheckout(
      request('POST', 'Bearer valid-session', bodyText),
      deps(db),
    )
    expect(result.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an active member before creating an order', async () => {
    const { db, rpc } = dbWith()
    const result = await handlePlusCheckout(
      request('POST', 'Bearer valid-session'),
      deps(db, {}, vi.fn().mockResolvedValue('active')),
    )
    expect(result.status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps an active membership RPC error to conflict', async () => {
    const { db } = dbWith({ error: { message: 'plus ecpay order already active' } })
    const result = await handlePlusCheckout(
      request('POST', 'Bearer valid-session'),
      deps(db),
    )
    expect(result.status).toBe(409)
  })

  it('creates a signed stage checkout using the verified identity and consent revision', async () => {
    const { db, rpc } = dbWith()
    const result = await handlePlusCheckout(
      request('POST', 'Bearer valid-session'),
      deps(db),
    )
    const response = body(result) as {
      action: string
      fields: Record<string, string>
    }

    expect(result.status).toBe(200)
    expect(response.action).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5')
    expect(rpc).toHaveBeenCalledWith('create_plus_ecpay_order', {
      p_user_id: 'verified-user',
      p_plan_code: PLUS_CHECKOUT_PLAN_CODE,
      p_environment: 'stage',
      p_consent_revision: 'test-consent-1',
    })
    expect(response.fields).toMatchObject({
      TotalAmount: '299',
      PeriodType: 'M',
      ExecTimes: '99',
      ReturnURL: 'https://test.supabase.co/functions/v1/ecpay-plus-callback',
      PeriodReturnURL: 'https://test.supabase.co/functions/v1/ecpay-plus-callback',
      ClientBackURL: 'https://business-japanese.example/plus?checkout=returned',
    })
    expect(response.fields).not.toHaveProperty('OrderResultURL')
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
  })
})
