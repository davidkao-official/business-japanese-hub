import { describe, expect, it, vi } from 'vitest'
import type { CheckoutResponse, ConsentSubmission, OrderStatusResponse } from '../payments/contract'
import {
  createCheckoutPurchaseExecutor,
  fetchOrderStatus,
  isTerminalResultView,
  pollOrderStatus,
  resultStateFor,
} from './executor'

const BASE = 'https://edge.example/functions/v1'

function consent(overrides: Partial<ConsentSubmission> = {}): ConsentSubmission {
  return {
    jurisdiction: 'TW',
    locale: 'zh-TW',
    noticeVersion: 'tw-7day-removal-notice-v1',
    consentVersion: 'tw-digital-content-consent-v1',
    consentGranted: true,
    noticeTextSnapshot: 'notice text',
    consentTextSnapshot: 'consent text',
    ...overrides,
  }
}

function checkoutResponse(orderId = 'order-1'): CheckoutResponse {
  return {
    orderId,
    paymentId: 'payment-1',
    instruction: {
      action: 'https://provider.example/pay',
      fields: {
        MerchantID: 'm',
        MerchantTradeNo: 'BJH001',
        TradeDesc: 'book',
        CheckMacValue: 'abc',
      },
      provider: 'ecpay',
      merchantReference: 'BJH001',
    },
  }
}

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: vi.fn().mockResolvedValue(payload) }
}

describe('checkout executor (#9 / #21)', () => {
  it('POSTs {bookId, consent} to the checkout edge function and returns pending', async () => {
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse(checkoutResponse()))
    const submitForm = vi.fn()
    const executor = createCheckoutPurchaseExecutor({
      functionsBaseUrl: BASE,
      fetchClient,
      submitForm,
    })

    const result = await executor({ bookId: 'book-1' }, consent())

    expect(fetchClient).toHaveBeenCalledTimes(1)
    const [url, init] = fetchClient.mock.calls[0] as [string, { method: string; body: string; headers: Record<string, string> }]
    expect(url).toBe(`${BASE}/checkout/books/book-1`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ bookId: 'book-1', consent: consent() })
    expect(result).toEqual({ ok: true, orderId: 'order-1', status: 'pending' })
  })

  it('keeps the existing ECPay instruction as a full-page POST by default', async () => {
    const response = checkoutResponse()
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse(response))
    const submitForm = vi.fn()
    const executor = createCheckoutPurchaseExecutor({
      functionsBaseUrl: BASE,
      fetchClient,
      submitForm,
    })

    await executor({ bookId: 'book-1' }, consent())

    expect(submitForm).toHaveBeenCalledTimes(1)
    expect(submitForm).toHaveBeenCalledWith(
      response.instruction.action,
      response.instruction.fields,
      'POST',
    )
  })

  it('honors a redirect-style PayPal GET checkout instruction', async () => {
    const response: CheckoutResponse = {
      orderId: 'order-usd-1',
      paymentId: 'payment-usd-1',
      instruction: {
        action: 'https://www.sandbox.paypal.com/checkoutnow?token=P1',
        fields: {},
        method: 'GET',
        provider: 'paypal',
        merchantReference: 'PAYPAL-REF-1',
      },
    }
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse(response))
    const submitForm = vi.fn()
    const executor = createCheckoutPurchaseExecutor({
      functionsBaseUrl: BASE,
      fetchClient,
      submitForm,
    })

    const result = await executor(
      { bookId: 'book-usd-1' },
      consent({ jurisdiction: 'JP', locale: 'en' }),
    )

    expect(submitForm).toHaveBeenCalledWith(response.instruction.action, {}, 'GET')
    expect(result).toEqual({ ok: true, orderId: 'order-usd-1', status: 'pending' })
  })

  it('refuses checkout without an explicit consent (unresolved jurisdiction fails closed)', async () => {
    const fetchClient = vi.fn()
    const executor = createCheckoutPurchaseExecutor({ functionsBaseUrl: BASE, fetchClient })

    const result = await executor({ bookId: 'book-1' })

    expect(result).toEqual({ ok: false, reason: 'consent_required', message: expect.any(String) })
    expect(fetchClient).not.toHaveBeenCalled()
  })

  it('refuses when the TW consent is present but not granted', async () => {
    const fetchClient = vi.fn()
    const executor = createCheckoutPurchaseExecutor({ functionsBaseUrl: BASE, fetchClient })

    const result = await executor({ bookId: 'book-1' }, consent({ consentGranted: false }))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('consent_required')
    expect(fetchClient).not.toHaveBeenCalled()
  })

  it('POSTs a JP proceeded-after-disclosure consent for a JP declaration', async () => {
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse(checkoutResponse()))
    const submitForm = vi.fn()
    const executor = createCheckoutPurchaseExecutor({
      functionsBaseUrl: BASE,
      fetchClient,
      submitForm,
    })

    const jpConsent = consent({ jurisdiction: 'JP', locale: 'ja' })
    const result = await executor({ bookId: 'book-1' }, jpConsent)

    expect(fetchClient).toHaveBeenCalledTimes(1)
    const [, init] = fetchClient.mock.calls[0] as [string, { body: string }]
    expect(JSON.parse(init.body)).toEqual({ bookId: 'book-1', consent: jpConsent })
    expect(result).toEqual({ ok: true, orderId: 'order-1', status: 'pending' })
  })

  it('never sends a client-supplied amount/currency', async () => {
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse(checkoutResponse()))
    const submitForm = vi.fn()
    const executor = createCheckoutPurchaseExecutor({
      functionsBaseUrl: BASE,
      fetchClient,
      submitForm,
    })

    await executor({ bookId: 'book-1', amount: 999999, currency: 'USD' }, consent())

    const [, init] = fetchClient.mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body).not.toHaveProperty('amount')
    expect(body).not.toHaveProperty('currency')
    expect(body.bookId).toBe('book-1')
  })

  it('degrades to unavailable when the edge function base URL is not configured', async () => {
    const executor = createCheckoutPurchaseExecutor({
      functionsBaseUrl: null,
      fetchClient: vi.fn(),
    })
    const result = await executor({ bookId: 'book-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unavailable')
  })

  it('returns failed on a non-ok checkout response', async () => {
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse({}, false, 500))
    const executor = createCheckoutPurchaseExecutor({ functionsBaseUrl: BASE, fetchClient })
    const result = await executor({ bookId: 'book-1' }, consent({ jurisdiction: 'JP', locale: 'ja' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('failed')
  })

  it('returns failed on an invalid checkout response shape', async () => {
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse({ orderId: 123 }))
    const executor = createCheckoutPurchaseExecutor({ functionsBaseUrl: BASE, fetchClient })
    const result = await executor({ bookId: 'book-1' }, consent({ jurisdiction: 'JP', locale: 'ja' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('failed')
  })

  it('returns failed when the instruction omits fields', async () => {
    const fetchClient = vi.fn().mockResolvedValue(
      jsonResponse({ orderId: 'order-1', paymentId: 'payment-1', instruction: { action: 'https://x/pay' } }),
    )
    const executor = createCheckoutPurchaseExecutor({ functionsBaseUrl: BASE, fetchClient })
    const result = await executor({ bookId: 'book-1' }, consent({ jurisdiction: 'JP', locale: 'ja' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('failed')
  })

  it('returns failed for an unsupported provider navigation method', async () => {
    const response = checkoutResponse() as CheckoutResponse & {
      instruction: CheckoutResponse['instruction'] & { method: 'PUT' }
    }
    response.instruction.method = 'PUT'
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse(response))
    const submitForm = vi.fn()
    const executor = createCheckoutPurchaseExecutor({ functionsBaseUrl: BASE, fetchClient, submitForm })

    const result = await executor({ bookId: 'book-1' }, consent())

    expect(result.ok).toBe(false)
    expect(submitForm).not.toHaveBeenCalled()
  })

  it('attaches the Bearer token when an auth token source is provided', async () => {
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse(checkoutResponse()))
    const submitForm = vi.fn()
    const executor = createCheckoutPurchaseExecutor({
      functionsBaseUrl: BASE,
      fetchClient,
      submitForm,
      authToken: 'tok-123',
    })

    await executor({ bookId: 'book-1' }, consent({ jurisdiction: 'JP', locale: 'ja' }))

    const [, init] = fetchClient.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(init.headers.Authorization).toBe('Bearer tok-123')
  })
})

function order(overrides: Partial<OrderStatusResponse> = {}): OrderStatusResponse {
  return {
    orderId: 'order-1',
    status: 'pending',
    paymentStatus: null,
    bookId: 'book-1',
    amount: { amount: 880, currency: 'JPY' },
    compliance: { jurisdiction: 'JP', japanConsumptionTaxStatus: 'unresolved' },
    ...overrides,
  }
}

describe('resultStateFor / terminality', () => {
  it('maps server order status to the view state', () => {
    expect(resultStateFor(order({ status: 'paid' }))).toBe('succeeded')
    expect(resultStateFor(order({ status: 'refunded' }))).toBe('succeeded')
    expect(resultStateFor(order({ status: 'cancelled' }))).toBe('cancelled')
    expect(resultStateFor(order({ status: 'pending', paymentStatus: 'failed' }))).toBe('failed')
    expect(resultStateFor(order({ status: 'pending' }))).toBe('pending')
  })

  it('treats only non-pending views as terminal', () => {
    expect(isTerminalResultView('succeeded')).toBe(true)
    expect(isTerminalResultView('failed')).toBe(true)
    expect(isTerminalResultView('cancelled')).toBe(true)
    expect(isTerminalResultView('pending')).toBe(false)
  })
})

describe('orders-status polling', () => {
  it('fetches the server order status for an order id', async () => {
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse(order({ status: 'paid' })))
    const status = await fetchOrderStatus('order-1', { functionsBaseUrl: BASE, fetchClient })
    expect(fetchClient).toHaveBeenCalledWith(`${BASE}/orders-status/order-1/status`, { headers: {} })
    expect(status?.status).toBe('paid')
  })

  it('returns null when the status fetch fails', async () => {
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse({}, false, 401))
    const status = await fetchOrderStatus('order-1', { functionsBaseUrl: BASE, fetchClient })
    expect(status).toBeNull()
  })

  it('polls until a terminal order status (bounded)', async () => {
    const fetchClient = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(order({ status: 'pending' })))
      .mockResolvedValueOnce(jsonResponse(order({ status: 'paid' })))
    const status = await pollOrderStatus('order-1', {
      functionsBaseUrl: BASE,
      fetchClient,
      intervalMs: 1,
      maxAttempts: 10,
    })
    expect(status?.status).toBe('paid')
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })

  it('survives a transient fetch rejection and keeps polling', async () => {
    const fetchClient = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(order({ status: 'paid' })))
    const status = await pollOrderStatus('order-1', {
      functionsBaseUrl: BASE,
      fetchClient,
      intervalMs: 1,
      maxAttempts: 2,
    })
    expect(status?.status).toBe('paid')
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })

  it('stops after max attempts without a terminal state', async () => {
    const fetchClient = vi.fn().mockResolvedValue(jsonResponse(order({ status: 'pending' })))
    const status = await pollOrderStatus('order-1', {
      functionsBaseUrl: BASE,
      fetchClient,
      intervalMs: 1,
      maxAttempts: 3,
    })
    expect(status?.status).toBe('pending')
    expect(fetchClient).toHaveBeenCalledTimes(3)
  })
})
