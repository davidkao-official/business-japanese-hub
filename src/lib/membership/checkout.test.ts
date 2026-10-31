import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPlusCheckoutOpen, startPlusCheckout, submitHostedCheckout } from './checkout'

const BASE = 'https://edge.test/functions/v1'
const STAGE_ACTION = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response
}

beforeEach(() => {
  vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', BASE)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Plus checkout browser client', () => {
  it('reports checkout as open only on an explicit server yes', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ open: true }))
      .mockResolvedValueOnce(jsonResponse({ open: false }))

    await expect(fetchPlusCheckoutOpen(fetchImpl)).resolves.toBe(true)
    await expect(fetchPlusCheckoutOpen(fetchImpl)).resolves.toBe(false)
    expect(fetchImpl).toHaveBeenNthCalledWith(1, `${BASE}/plus-checkout`, {
      method: 'GET',
      cache: 'no-store',
    })
  })

  it('treats a network error as closed', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(fetchPlusCheckoutOpen(fetchImpl)).resolves.toBe(false)
  })

  it('returns the ECPay hosted checkout action and fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ action: STAGE_ACTION, fields: { MerchantID: '2000132' } }),
    )

    await expect(startPlusCheckout(async () => 'session-token', fetchImpl)).resolves.toEqual({
      kind: 'redirect',
      action: STAGE_ACTION,
      fields: { MerchantID: '2000132' },
    })
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/plus-checkout`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: 'Bearer session-token' },
    })
  })

  it('maps an active membership conflict to already-member', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'already a member' }, 409))
    await expect(startPlusCheckout(async () => 'session-token', fetchImpl)).resolves.toEqual({
      kind: 'already-member',
    })
  })

  it('maps the closed gate to closed', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'plus checkout closed' }, 503))
    await expect(startPlusCheckout(async () => 'session-token', fetchImpl)).resolves.toEqual({
      kind: 'closed',
    })
  })

  it('refuses to post the form to a non-ECPay action', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ action: 'https://evil.example/checkout', fields: { A: '1' } }),
    )
    await expect(startPlusCheckout(async () => 'session-token', fetchImpl)).resolves.toEqual({
      kind: 'failed',
    })
  })

  it('submits a hidden POST form to the hosted checkout', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

    submitHostedCheckout(STAGE_ACTION, { MerchantID: '2000132', CheckMacValue: 'abc' })

    const form = document.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.getAttribute('method')).toBe('POST')
    expect(form?.getAttribute('action')).toBe(STAGE_ACTION)
    expect(
      Array.from(form?.querySelectorAll('input') ?? []).map((input) => [
        input.type,
        input.name,
        input.value,
      ]),
    ).toEqual([
      ['hidden', 'MerchantID', '2000132'],
      ['hidden', 'CheckMacValue', 'abc'],
    ])
    expect(submit).toHaveBeenCalledTimes(1)
    form?.remove()
  })
})
