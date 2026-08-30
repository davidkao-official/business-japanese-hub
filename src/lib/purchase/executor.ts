/**
 * Checkout purchase executor (#9) — the real `PurchaseExecutor` backed by the
 * Supabase Edge Function boundary.
 *
 * Given a `PurchaseIntent` (bookId — the ONLY client-supplied input; amount /
 * currency are never sent) and a collected compliance `ConsentSubmission`, it:
 *
 *   1. Fail-closed consent gate: TW requires an explicit granted consent; the
 *      executor refuses with `consent_required` otherwise (the CTA checkbox is
 *      the UX gate; this is the guarantee).
 *   2. POSTs `{ bookId, consent }` to the checkout Edge Function
 *      `POST /functions/v1/checkout/books/:bookId` (the server reads the
 *      authoritative `catalog` price and persists Order + `order_compliance`
 *      in ONE transaction BEFORE any provider redirect — decision-record §3.4/
 *      §8.3).
 *   3. Performs a FULL-PAGE form POST to the returned provider
 *      `instruction.action` with `instruction.fields` — a hidden
 *      `<form method="POST" target="_self">`, never iframe/modal
 *      (decision-record §16 / §17.1 iOS in-app-browser caveat).
 *
 * HTTP + form submission live in small injectable helpers (`FetchClient`,
 * `SubmitForm`) so tests mock them and never touch the network or navigate.
 * Without a configured Edge Function base URL the executor degrades to
 * `unavailable` (mirrors the shared platform-auth browser env contract).
 *
 * Environment (Vite, baked at build time):
 *   - `VITE_EDGE_FUNCTIONS_BASE_URL` — optional explicit base URL of the Edge
 *     Functions gateway, e.g. `https://xxxx.supabase.co/functions/v1`.
 *   - otherwise derived as `<VITE_SUPABASE_URL>/functions/v1`.
 */
import type {
  CheckoutResponse,
  CheckoutRequest,
  ConsentSubmission,
  OrderStatusResponse,
  PurchaseIntent,
  PurchaseResult,
} from '../payments/contract';
import { isResolvedJurisdiction } from '../payments/contract';

/* ------------------------------------------------------------------------- *
 * Injectable seams (tests mock these; production uses the DOM/global defaults)
 * ------------------------------------------------------------------------- */

/** Minimal response shape the executor consumes from the Edge Functions. */
export interface FetchClientResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface FetchClientInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FetchClient {
  (url: string, init?: FetchClientInit): Promise<FetchClientResponse>;
}

/** Full-page form POST of a form-post checkout instruction (never iframe). */
export interface SubmitForm {
  (action: string, fields: Record<string, string>): void;
}

/** Full-page navigation to a redirect checkout instruction (PayPal approval URL). */
export interface Navigate {
  (url: string): void;
}

/** Server-authoritative auth token source (Supabase session JWT). */
export type AuthTokenSource = string | null | (() => string | null | Promise<string | null>);

export const defaultFetchClient: FetchClient = async (url, init) => {
  const res = await globalThis.fetch(url, init);
  return { ok: res.ok, status: res.status, json: () => res.json() };
};

const defaultSubmitForm: SubmitForm = (action, fields) => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  form.target = '_self';
  form.style.display = 'none';
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
};

/** Default redirect navigation (PayPal approval link) — full-page, same tab. */
const defaultNavigate: Navigate = (url) => {
  window.location.assign(url);
};

/** Base-path-aware route into the server-authoritative order-status page. */
export function purchaseResultPath(orderId: string): string {
  const configuredBase = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
  return `${base}purchase/result?order=${encodeURIComponent(orderId)}`;
}

/* ------------------------------------------------------------------------- *
 * Edge Functions base URL + auth seam
 * ------------------------------------------------------------------------- */

/**
 * Resolve the Edge Functions base URL. Explicit `VITE_EDGE_FUNCTIONS_BASE_URL`
 * wins; otherwise derived from `VITE_SUPABASE_URL` (`<url>/functions/v1`).
 * `null` when unset → callers degrade (executor returns `unavailable`).
 */
export function resolveFunctionsBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL as string | undefined;
  if (explicit) return explicit.replace(/\/+$/, '');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (supabaseUrl) return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;
  return null;
}

let authTokenProvider: AuthTokenSource = null;

/**
 * Wire the server-authoritative Supabase session token (Bearer) used for the
 * authenticated checkout / orders-status calls. Idempotent; App sets it once at
 * bootstrap. Tests leave it null (no Authorization header).
 */
export function configureEdgeFunctionsAuth(provider: AuthTokenSource): void {
  authTokenProvider = provider;
}

/** Resolve a Bearer token: explicit override wins, else the configured seam. */
async function resolveAuthToken(explicit?: AuthTokenSource): Promise<string | null> {
  const source = explicit ?? authTokenProvider;
  if (typeof source === 'function') {
    const token = source();
    return typeof token === 'string' ? token : ((await token) ?? null);
  }
  return source ?? null;
}

/* ------------------------------------------------------------------------- *
 * Executor
 * ------------------------------------------------------------------------- */

export interface CheckoutExecutorDeps {
  /** Edge Functions base URL; defaults to `resolveFunctionsBaseUrl()`. */
  functionsBaseUrl?: string | null;
  /** Injectable HTTP client; defaults to a `globalThis.fetch` wrapper. */
  fetchClient?: FetchClient;
  /** Injectable full-page form submitter (form-post instructions); defaults to the hidden-form POST. */
  submitForm?: SubmitForm;
  /** Injectable full-page navigator (redirect instructions); defaults to `window.location.assign`. */
  navigate?: Navigate;
  /** Bearer token source for the authenticated checkout call. */
  authToken?: AuthTokenSource;
}

/**
 * The #9 executor callable: `(intent, consent?) => Promise<PurchaseResult>`.
 * Assignable to the locked `PurchaseExecutor` seam (the second argument is
 * optional), so it can be injected through `PurchaseProvider`.
 */
export type CheckoutExecutor = (
  intent: PurchaseIntent,
  consent?: ConsentSubmission | null,
) => Promise<PurchaseResult>;

/** Build a CheckoutRequest — only bookId + consent; never amount/currency. */
function buildCheckoutRequest(intent: PurchaseIntent, consent: ConsentSubmission | null): CheckoutRequest {
  // The server's `catalog` is the authoritative price source; the client cannot
  // send an amount/currency (§8.3). The consent (TW: explicit prior consent;
  // JP: proceeded-after-disclosure) always rides so the checkout Edge Function
  // can persist the order_compliance evidence before any provider redirect.
  return { bookId: intent.bookId, consent: consent ?? undefined };
}

export function createCheckoutPurchaseExecutor(deps: CheckoutExecutorDeps = {}): CheckoutExecutor {
  const baseUrl = deps.functionsBaseUrl ?? resolveFunctionsBaseUrl();
  const fetchClient = deps.fetchClient ?? defaultFetchClient;
  const submitForm = deps.submitForm ?? defaultSubmitForm;
  const navigate = deps.navigate ?? defaultNavigate;

  return async (intent, consent = null) => {
    if (!baseUrl) {
      return { ok: false, reason: 'unavailable', message: 'checkout edge function is not configured' };
    }

    // Fail-closed jurisdiction gate (presentation-only locale): jurisdiction is
    // an explicit consumer self-declaration carried by the consent. No consent
    // (or a non-TW/JP declaration) means `unresolved` → block before any request.
    // TW additionally requires an explicitly granted prior consent.
    if (!consent || !isResolvedJurisdiction(consent.jurisdiction)) {
      return {
        ok: false,
        reason: 'consent_required',
        message: 'consumer jurisdiction is required before checkout',
      };
    }
    if (consent.jurisdiction === 'TW' && consent.consentGranted !== true) {
      return {
        ok: false,
        reason: 'consent_required',
        message: 'explicit prior consent to immediate digital delivery is required',
      };
    }

    const body = buildCheckoutRequest(intent, consent);
    const token = await resolveAuthToken(deps.authToken);
    // Checkout is authenticated and entitlement attribution is tied to the
    // server-verified session. Never send an anonymous request and never let
    // the client infer a buyer identity.
    if (!token) {
      return {
        ok: false,
        reason: 'signed_out',
        message: 'authentication is required before checkout',
      };
    }
    let response: FetchClientResponse;
    try {
      response = await fetchClient(
        `${baseUrl}/checkout/books/${encodeURIComponent(intent.bookId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
      );
    } catch {
      return { ok: false, reason: 'failed', message: 'checkout request failed' };
    }

    if (!response.ok) {
      if (response.status === 401) {
        return {
          ok: false,
          reason: 'signed_out',
          message: 'authentication is required before checkout',
        };
      }
      if (response.status === 409) {
        try {
          const conflict = await response.json() as { reason?: unknown; orderId?: unknown };
          if (
            conflict.reason === 'checkout_verification_pending' &&
            typeof conflict.orderId === 'string' &&
            conflict.orderId.length > 0
          ) {
            navigate(purchaseResultPath(conflict.orderId));
            return { ok: true, orderId: conflict.orderId, status: 'pending' };
          }
          if (conflict.reason === 'already_owned') {
            return { ok: false, reason: 'already_owned' };
          }
        } catch {
          // Malformed conflicts remain a generic fail-closed checkout failure.
        }
      }
      return { ok: false, reason: 'failed', message: `checkout request failed (${response.status})` };
    }

    let data: CheckoutResponse;
    try {
      data = (await response.json()) as CheckoutResponse;
    } catch {
      return { ok: false, reason: 'failed', message: 'invalid checkout response' };
    }

    // Validate the minimum shape before trusting it. The instruction is a
    // discriminated union over transports: `form-post` (action + fields) or
    // `redirect` (url). The server picks the transport; the client only renders
    // it and NEVER decides the provider or payment success (§21).
    const instruction = data.instruction;
    const validInstruction =
      instruction !== null &&
      typeof instruction === 'object' &&
      ((instruction as { kind?: string }).kind === 'form-post'
        ? typeof (instruction as { action?: unknown }).action === 'string' &&
          typeof (instruction as { fields?: unknown }).fields === 'object' &&
          (instruction as { fields?: unknown }).fields !== null
        : (instruction as { kind?: string }).kind === 'redirect' &&
          typeof (instruction as { url?: unknown }).url === 'string');
    if (
      !data ||
      typeof data.orderId !== 'string' ||
      !validInstruction
    ) {
      return { ok: false, reason: 'failed', message: 'invalid checkout response' };
    }

    // Render the server-chosen transport: full-page form POST for ECPay, full-page
    // navigation to the approval URL for PayPal (never iframe/modal, §16/§17.1).
    if (instruction.kind === 'form-post') {
      submitForm(instruction.action, instruction.fields);
    } else {
      navigate(instruction.url);
    }
    return { ok: true, orderId: data.orderId, status: 'pending' };
  };
}

/* ------------------------------------------------------------------------- *
 * Orders-status polling (browser-return result page)
 * ------------------------------------------------------------------------- */

export const ORDER_STATUS_POLL_INTERVAL_MS = 2000;
export const ORDER_STATUS_MAX_ATTEMPTS = 10;

export type PurchaseResultView = 'pending' | 'succeeded' | 'refunded' | 'failed' | 'cancelled';

/** Map a server order-status payload to the view state (server-driven only). */
export function resultStateFor(order: OrderStatusResponse): PurchaseResultView {
  if (order.status === 'refunded') return 'refunded';
  if (order.status === 'paid') return 'succeeded';
  if (order.status === 'cancelled') return 'cancelled';
  if (order.paymentStatus === 'failed') return 'failed';
  return 'pending';
}

export function isTerminalResultView(view: PurchaseResultView): boolean {
  return view !== 'pending';
}

/** GET the local authoritative order status — never a query-param trust. */
export async function fetchOrderStatus(
  orderId: string,
  options: {
    functionsBaseUrl?: string | null;
    fetchClient?: FetchClient;
    authToken?: AuthTokenSource;
  } = {},
): Promise<OrderStatusResponse | null> {
  const baseUrl = options.functionsBaseUrl ?? resolveFunctionsBaseUrl();
  if (!baseUrl) return null;
  const client = options.fetchClient ?? defaultFetchClient;
  const token = await resolveAuthToken(options.authToken);
  let response: FetchClientResponse;
  try {
    response = await client(`${baseUrl}/orders-status/${encodeURIComponent(orderId)}/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    // A transient transport error must not abort the whole polling loop —
    // return null so pollOrderStatus keeps retrying its bounded attempts.
    return null;
  }
  if (!response.ok) return null;
  try {
    return (await response.json()) as OrderStatusResponse;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the order status with bounded retries (default ~2s × up to 10 attempts).
 * Resolves the first terminal order, or the last non-terminal order when
 * attempts are exhausted. The browser-return query params are NEVER read — only
 * this server response drives the UI (decision-record §3.2).
 */
export async function pollOrderStatus(
  orderId: string,
  options: {
    functionsBaseUrl?: string | null;
    intervalMs?: number;
    maxAttempts?: number;
    fetchClient?: FetchClient;
    authToken?: AuthTokenSource;
  } = {},
): Promise<OrderStatusResponse | null> {
  const intervalMs = options.intervalMs ?? ORDER_STATUS_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? ORDER_STATUS_MAX_ATTEMPTS;
  let last: OrderStatusResponse | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await fetchOrderStatus(orderId, options);
    if (last && isTerminalResultView(resultStateFor(last))) return last;
    if (attempt < maxAttempts) await delay(intervalMs);
  }
  return last;
}
