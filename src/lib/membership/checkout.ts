/**
 * Browser-side start of the Plus recurring checkout.
 *
 * The page only shows the call to action when the server says checkout is
 * open, and it never decides paid access: the ECPay callback grants membership
 * server-side. Anything unexpected fails closed.
 */

import { functionsBaseUrl } from './access'

const ECPAY_CHECKOUT_PREFIXES = [
  'https://payment.ecpay.com.tw/',
  'https://payment-stage.ecpay.com.tw/',
] as const

function isEcpayHostedAction(action: string): boolean {
  return ECPAY_CHECKOUT_PREFIXES.some((prefix) => action.startsWith(prefix))
}

/**
 * The consent revision the server currently admits Plus checkout under, or
 * null when checkout is closed. Any error means closed.
 */
export async function fetchPlusCheckoutOpen(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const baseUrl = functionsBaseUrl()
  if (!baseUrl) return null
  try {
    const response = await fetchImpl(`${baseUrl}/plus-checkout`, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!response.ok) return null
    const body = (await response.json()) as { open?: unknown; consentRevision?: unknown }
    return body?.open === true && typeof body.consentRevision === 'string' && body.consentRevision
      ? body.consentRevision
      : null
  } catch {
    return null
  }
}

export type PlusCheckoutStart =
  | { kind: 'redirect'; action: string; fields: Record<string, string> }
  | { kind: 'already-member' }
  | { kind: 'closed' }
  | { kind: 'failed' }

/**
 * One authenticated checkout start. Only the ECPay hosted checkout origins are
 * accepted so a malformed response can never post the form elsewhere.
 */
export async function startPlusCheckout(
  getAccessToken: () => Promise<string | null>,
  consentRevision: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlusCheckoutStart> {
  const baseUrl = functionsBaseUrl()
  try {
    const token = await getAccessToken()
    if (!token || !baseUrl) return { kind: 'failed' }

    const response = await fetchImpl(`${baseUrl}/plus-checkout`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentRevision }),
    })

    if (response.status === 409) return { kind: 'already-member' }
    if (response.status === 503) {
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null
      return body?.error === 'plus checkout closed' ? { kind: 'closed' } : { kind: 'failed' }
    }
    if (!response.ok) return { kind: 'failed' }

    const body = (await response.json()) as { action?: unknown; fields?: unknown }
    if (typeof body?.action !== 'string' || !isEcpayHostedAction(body.action)) {
      return { kind: 'failed' }
    }
    if (typeof body.fields !== 'object' || body.fields === null || Array.isArray(body.fields)) {
      return { kind: 'failed' }
    }
    return {
      kind: 'redirect',
      action: body.action,
      fields: body.fields as Record<string, string>,
    }
  } catch {
    return { kind: 'failed' }
  }
}

/** Auto-submits the ECPay hosted checkout form built from the server fields. */
export function submitHostedCheckout(
  action: string,
  fields: Record<string, string>,
  doc: Document = document,
): void {
  const form = doc.createElement('form')
  form.method = 'POST'
  form.action = action
  for (const [name, value] of Object.entries(fields)) {
    const input = doc.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  doc.body.appendChild(form)
  form.submit()
}
