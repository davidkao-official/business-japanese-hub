# Payment / Commerce Database — Operator Reference

> **本文件不是 source of truth。**
> 唯一規範來源是：
> 1. `supabase/migrations/`（SQL 就是 contract；包含 commerce、compliance、PayPal 與 transactional finalizers）
> 2. `src/lib/payments/contract.ts`（共享 TS contract）
> 3. `docs/payments/decision-record.md`（canonical decision record：§8 Money、§8.3 catalog seam、§9 entitlement migration、§12 data model、§13 idempotency、§14 finance、§15 security）
>
> 本文件只是 human-readable index，幫助 operator／Edge Function（A4）快速定位欄位與安全邊界；若與 SQL／contract 衝突，以 SQL／contract 為準。

## Tables

| Table | Migration | Purpose | Security |
| --- | --- | --- | --- |
| `catalog` | 0002 + 20260820100000 | Authoritative server-side price and customer-facing `item_name` seam (§8.3). Checkout reads `released_at <= now()`; client display uses the static bundle `Price`. | **No-read boundary**: RLS on, zero client policies, `revoke` from anon/authenticated/PUBLIC, `grant select` to `service_role` only. service_role keeps its Supabase-default INSERT/UPDATE (used by `scripts/update-catalog.ts`). |
| `orders` | 0002 + 20260820100000 | One purchase intent. Catalog/price/compliance fields plus `customer_email_snapshot` and buyer-facing `customer_locale_snapshot` are **immutable** (trigger `orders_immutable_fields_check`); orchestration updates only `status/paid_at/refunded_at`. | Server-only. |
| `payments` | 0002 + 0006 + 20260819212459 + 20260822173000 | Payment attempts. `provider_merchant_ref` is the local/provider correlation key; `provider_checkout_ref` preserves a checkout/session id such as a PayPal Order ID; `provider_payment_ref` holds the final capture/transaction id. Each reference is unique per provider once known. Identity, commercial facts, and non-null provider references are immutable. | Server-only. |
| `refunds` | 0002 + 20260822172000 + 20260822173000 | **Source of truth for refunds** (§7). Exactly one full-refund fact per Payment; provider-confirmed refund → `status='succeeded'`. Creation and audit are one transaction. Identity, commercial facts, and non-null provider reference are immutable. | Server-only. |
| `payment_events` | 0002 | Reliability ledger; `UNIQUE(provider, event_fingerprint)` makes receipt idempotent while replay re-applies the locked finalizer. `sanitized_payload_json` holds allowlisted financial/status fields only; `payment_id`, `processed_at`, and `processing_result` expose the durable outcome. | Server-only. |
| `book_entitlement` | 0001 + 0003 + 20260822170000 + 20260822172000 | Ownership lifecycle. Revoked evidence is hidden by active-only owner RLS. A legitimate repurchase rebinds `source_order_id`, allowing a later refund to revoke the current purchase; every non-null source Order identifies exactly one entitlement row. | Authenticated client can select only its own active rows; writes only via `grant_entitlement`. |
| `order_compliance` | 0003 | Order-linked immutable compliance evidence (notice/consent snapshots) written in the same transaction as Order creation (#25). One row per order. | Server-only. |
| `finance_roles` | 0003 | Server-enforced `finance_viewer` / `finance_admin`. Source for the finance Edge Function authorization — never trust a client-claimed role. | Server-only (`grant select` to service_role). |
| `admin_audit_log` | 0003 | Audit trail for finance/operator actions (refund requests, reconciliation overrides) with before/after state. | Server-only. |
| `platform_tax_config` | 0003 | Japan consumption-tax status boundary (#25). Seeded `('japan_consumption_tax_status','unresolved')` — fail-closed: never apply 10% tax / claim tax-inclusive pricing until explicitly `taxable` or `exempt`. | Server-only (clients must not override). |
| `order_email_outbox` | 20260820100000 | Durable order-confirmation delivery. First fulfillment enqueues one `order-confirmation-v1` row; the worker owns `pending → processing → sent/retry/dead`. | Server-only; no client policy or privilege. |
| `scheduled_job_health` | 20260822171000 | Run-token-fenced repair/reconcile/email heartbeat state used by paid-launch readiness. | Server-only. |

The finance API returns bounded row samples for investigation, but its
reconciliation/actionable totals come from the exact server-only
`finance_status_counts()` aggregate (`20260822175000`). The function scans the
complete ledgers without a display limit and is executable only by
`service_role`; the Edge Function still enforces the named finance role before
calling it. `finance_viewer` receives operational outbox/audit columns without
recipient email or before/after payloads; `finance_admin` retains the full
operator evidence required for delivery and refund investigation.

## Security posture

- **Server-only set**: `catalog`, `orders`, `payments`, `refunds`, `payment_events`, `order_compliance`, `finance_roles`, `admin_audit_log`, `platform_tax_config` — every one has RLS enabled, **no client policy**, privileges revoked from anon/authenticated/PUBLIC, and only `service_role` grants. The DB must never let an authenticated client read another user's order or any payment/finance row.
- **`book_entitlement`** keeps its own-row select policy from 0001; writes flow only through the `grant_entitlement` write point (service_role-only EXECUTE).
- **Money**: amounts are stored as integer minor-unit `bigint` (`amount_minor`) with `CHECK (amount_minor >= 0 AND amount_minor <= 9007199254740991)`; currency is uppercase ISO 4217. **Never** store major-unit display amounts as payment truth.

## Idempotency constraints (§13)

1. Payment attempt: `UNIQUE(provider, provider_merchant_ref)`.
2. Provider transaction: partial unique index `payments_provider_payment_ref_uidx` on `(provider, provider_payment_ref) WHERE provider_payment_ref IS NOT NULL`.
3. Provider checkout/session: partial unique index `payments_provider_checkout_ref_uidx` on `(provider, provider_checkout_ref) WHERE provider_checkout_ref IS NOT NULL`.
4. Callback receipt: `UNIQUE(provider, event_fingerprint)`; receipt uses conflict-ignoring upsert, then re-applies the idempotent transaction on replay.
5. Ownership: `UNIQUE(user_id, book_id)` on `book_entitlement`; partial
   `UNIQUE(source_order_id) WHERE source_order_id IS NOT NULL` proves one Book
   Order can fulfill only one entitlement lifecycle row.
6. Open checkout: partial `UNIQUE(user_id, book_id) WHERE status='pending'` on `orders`, plus a transaction advisory lock keyed by user + Book for retry decisions. A PayPal attempt with a persisted Order id resumes by read-only GET of that exact Order after immutable-fact validation; when the id was not persisted after an ambiguous create call, POST replay is bounded to five hours (below PayPal Orders' default six-hour Request-Id retention) and older attempts are held for verification. An ECPay `created` attempt is exclusively claimed before reconstructing its not-yet-issued local form; `pending`/`verification_pending` attempts are held so a submitted `MerchantTradeNo` is never reused. An authoritatively `failed` Payment gets a new PaymentAttempt and merchant reference on the same immutable Order. Active entitlement or a paid Order returns `owned` before handoff. The migration deliberately stops with a reconciliation hint if legacy data contains duplicate pending Orders; operators must verify provider state rather than silently discard an attempt.
7. Receipt delivery: `UNIQUE(order_id, template_key)` in `order_email_outbox`, plus Resend key `order-confirmation/<orderId>`. Automatic send/retry stops before the provider's 24-hour idempotency boundary; aged rows become `dead` for manual handling. `prepare_order_email_send` rechecks that the Order is still paid and atomically fences `processing → sending` immediately before the external call. A refund that wins before the fence suppresses delivery; a fenced historical confirmation may finish, and its copy points to current Library state. Active `sending` rows are never swept by another cron, stale rows recover through the same provider idempotency key, and every worker transition verifies its expected-state compare-and-set matched. Any 2xx response without a usable provider message id is treated as ambiguous and retried with that same key rather than dead-lettered.
8. Refund request: `UNIQUE(payment_id)` plus partial `UNIQUE(provider, provider_refund_ref)`; the locked request RPC returns the existing fact on retry and never dispatches a second provider operation.

## Transactional financial finalizers

Migration `20260819212459_payment_atomicity_and_paypal_correlation.sql` defines the two `security definer` finalizers; `20260820100000_first_sale_order_email.sql` replaces the payment-success finalizer to add the atomic outbox insert. EXECUTE privilege is revoked from `PUBLIC`, `anon`, and `authenticated` and granted only to `service_role`:

- `finalize_payment_success(...)` locks the Payment and Order rows and commits the verified Payment state, Order state, provider-neutral Entitlement grant, and first order-confirmation outbox row in one transaction. A replay is a no-op; a second real successful attempt becomes `duplicate_success` and never re-grants or re-enqueues.
- `request_full_refund(...)` locks the Payment and atomically creates exactly one full Refund plus `refund.requested` audit evidence. Retry returns the existing Refund.
- `finalize_refund_success(...)` takes locks in one global `Payment → Refund → Order` order and commits the provider-confirmed refund fact plus all derived Payment/Order/Entitlement transitions in one transaction. Before mutation it enforces the MVP full-refund invariant: refund provider, amount, and currency must exactly match the locked payment. Its wrapper also requires a primary refund to leave exactly one revoked entitlement or rolls the transaction back. `finalize_refund_success_audited(...)` couples a finance actor's confirmation audit to the same transaction. It repairs legacy half-applied refund facts on replay; a duplicate-payment refund preserves the paid Order and active Entitlement.

Provider transaction/capture IDs remain in `payments.provider_*` and `refunds.provider_*`; `book_entitlement.provider_ref` never receives them. Paid entitlement provenance uses `source_order_id`.

## Atomic checkout intent

Migration `20260820100000_first_sale_order_email.sql` adds the only supported
first-sale creation RPC. It is `security definer`, with EXECUTE revoked from
PUBLIC/anon/authenticated and granted only to `service_role`:

```sql
create_checkout_intent(
  p_user_id uuid,
  p_book_id text,
  p_customer_email_snapshot text,
  p_customer_locale_snapshot text,
  p_jurisdiction text,
  p_japan_tax_status_snapshot text,
  p_locale text,
  p_notice_version text,
  p_consent_version text,
  p_consent_granted boolean,
  p_notice_text_snapshot text,
  p_consent_text_snapshot text,
  p_consent_timestamp timestamptz,
  p_provider text,
  p_provider_merchant_ref text,
  p_payment_method text DEFAULT 'credit'
) → jsonb  -- { "outcome": "owned" | "created" | "resumed" | "retry_created", ... }
```

The RPC re-reads and locks a released positive-price catalog row, snapshots its
name/revision/amount/currency, and inserts Order + `order_compliance` + Payment
in one transaction. Launch mappings are exact: USD → PayPal and TWD → ECPay.
The partial open-intent constraint and user + Book advisory lock serialize
concurrent retries. `resumed` recovers PayPal through a read-only GET when
`provider_checkout_ref` is known. Only the ambiguous pre-persistence crash
window may repeat POST with the same merchant reference / `PayPal-Request-Id`,
and only for five hours; after that finite provider window the attempt is held
for authoritative verification instead of risking a second provider Order.
ECPay does not provide a replay contract: the handler may claim and reconstruct
an unissued `created` form, but returns `checkout_verification_pending` once the
attempt is `pending`/`verification_pending` rather than reusing
`MerchantTradeNo`. If pure local form generation throws before any form is
issued, the exclusive claim is marked `failed`; the next checkout creates a
fresh PaymentAttempt and MerchantTradeNo. That structured conflict sends the
authenticated buyer to the existing server-authoritative order-status page. Once
this RPC has returned commercial rows, the Edge handler never compensates by
deleting them: another request may already have claimed the handoff, and
provider/transport failures
are ambiguous. The durable attempt remains available to status polling and
repair instead of risking an orphaned real provider payment.
`retry_created` is emitted only after the prior Payment is authoritatively
`failed`; it preserves the Order snapshots and creates a new PaymentAttempt.
Every resume/retry first compares the authenticated email, presentation locale,
jurisdiction, tax status, and complete canonical compliance evidence against
the immutable Order. A changed declaration or legacy pending Order with missing
receipt/compliance facts is rejected before provider handoff and requires
operator reconciliation.
`owned` contains no commercial rows and the Edge handler returns an
`already_owned` conflict before provider handoff.
The payment-method snapshot is likewise exact: PayPal records `paypal` (the
hosted provider channel, never an inferred funding source) and ECPay records
`credit` for its fixed credit-card checkout.
The trusted Edge handler supplies the authenticated user/email, an allowlisted
buyer-facing locale, and canonical notice/consent evidence. The customer locale
is deliberately separate from `order_compliance.locale`, which identifies the
fixed jurisdiction-specific legal copy. No browser-supplied amount, currency,
title, legal copy, or seller fact is authoritative.

## `grant_entitlement` (recreated in 0003, 8-arg)

```sql
grant_entitlement(
  p_user_id uuid, p_book_id text, p_provider text,
  p_provider_ref text DEFAULT NULL,
  p_source_order_id uuid DEFAULT NULL,
  p_status text DEFAULT 'active',
  p_revoked_at timestamptz DEFAULT NULL,
  p_revocation_reason text DEFAULT NULL
) → void  -- security definer; EXECUTE service_role-only
```

**Conflict behavior (documented in the SQL):**
- `status` / `revoked_at` / `revocation_reason` are always applied (revocation and revoked→active reactivation both work).
- `provider` is always set to the incoming grant source.
- `provider_ref` refreshes when the incoming provider reference is non-NULL;
  `source_order_id` refreshes independently when the incoming Order is non-NULL.
  `granted_at` refreshes when either signal is present. This makes a legitimate
  repurchase authoritative even though paid grants intentionally keep
  `provider_ref` NULL. A pure status flip passes both NULL and preserves
  provenance.
- A `provider='manual'` active regrant is a new operator provenance boundary:
  NULL `provider_ref` / `source_order_id` explicitly clear stale paid references
  and refresh `granted_at`. A replayed refund from the old Order therefore
  cannot revoke the newer manual grant.
- **Call only for the FIRST qualifying successful payment.** `duplicate_success` (second real charge) must never call grant, or it would clobber `provider_ref`/`granted_at` provenance (§7/§13).

TS helper: `src/lib/persistence/grant.ts` `grantEntitlement(client, input)` — extended args are forwarded only when supplied, so legacy 4-arg callers keep the exact original RPC body.

## Catalog seam + operator seeding

`scripts/update-catalog.ts` (service-role) reads ONLY released snapshots
(`content-dist/books/<slug>/current.json` with `publication.status='published'`),
converts major-unit display `Price.amount` to `amount_minor` (JPY minor=1,
TWD/USD minor=100; any other currency → refuse that book), and upserts `catalog`
on `book_id`.

```bash
pnpm exec tsx scripts/update-catalog.ts --help        # usage
pnpm exec tsx scripts/update-catalog.ts --dry-run     # preview, no DB write
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm exec tsx scripts/update-catalog.ts --slug=keigo-essentials
```

Checkout reads released-only: `WHERE book_id = $1 AND released_at IS NOT NULL AND released_at <= now()`; no row → refuse checkout.

## Environment dependency

Real end-to-end enforcement (RLS, triggers, grants) requires a Supabase database:
`supabase db start` (or a project) + `supabase db reset --local` applies every
migration. Run `supabase test db --local supabase/tests` for transactional pgTAP
regressions and `supabase db lint --local --schema public --level warning` for
schema errors. TypeScript migration contract tests remain a fast source-level
guard, but do not replace database execution.

Edge Function entrypoints have a separate runtime gate:
`deno check supabase/functions/*/index.ts`. The GitHub quality gate runs this,
then recreates the local database, executes every pgTAP contract, and lints the
resulting schema; Node-only typechecking is not a substitute for the Deno gate.

Provider credentials are scoped independently. A PayPal-only deployment may
omit every `ECPAY_*` credential and an ECPay-only deployment may omit every
`PAYPAL_*` credential; selecting an unconfigured provider fails before inserts,
and its unauthenticated callback/webhook endpoints return 503 without acking.
`DEPLOYMENT_ENV` is mandatory for payment operations: production accepts only
`PAYPAL_ENV=prod` / `ECPAY_ENV=prod`; development or staging accepts only
PayPal sandbox / ECPay stage. Missing, invalid, or cross-environment pairs
disable that provider before any checkout write.

For the PayPal/USD launch, configure exactly this production webhook endpoint:

```text
https://<project-ref>.supabase.co/functions/v1/paypal-webhook
```

Subscribe it to every event the verified adapter handles from PayPal's
[current event-name catalog](https://developer.paypal.com/api/rest/webhooks/event-names/);
the browser return is never authoritative:

- `CHECKOUT.ORDER.APPROVED`
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.PENDING`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.DECLINED`
- `PAYMENT.CAPTURE.REFUNDED`
- `PAYMENT.CAPTURE.REVERSED`
- `PAYMENT.REFUND.PENDING`
- `PAYMENT.REFUND.FAILED`

Refund PENDING/FAILED events correlate to the one existing full-refund fact and
update its lifecycle without revoking ownership. Only verified capture-level
REFUNDED/REVERSED evidence enters the atomic refund finalizer. This exact list
matches PayPal's production webhook event catalog; do not invent refund event
names when configuring the subscription.

The secret-authenticated scheduled endpoint accepts `mode=repair` (10-minute
provider confirmation/refund recovery) and `mode=reconcile` (daily ECPay/PayPal
financial reporting); migration `20260820090000_scheduled_reconciliation_modes.sql`
wires the two cron jobs to those modes. Migration `20260820100000_first_sale_order_email.sql`
adds `mode=email` and a one-minute `order-email-outbox` job targeting the
`order-email` Edge Function. Configure `scheduled_job_config.order_email_function_url`
to the deployed URL and keep the same Vault/Edge `SCHEDULED_JOB_SECRET` pair.
Checkout stays fail-closed until both exact function URLs, the hashed secret,
all three exact active schedules (ten-minute repair, daily reconciliation,
one-minute email), and fresh durable worker success heartbeats pass
`is_paid_launch_scheduler_ready(...)`. Repair, reconciliation, and email expire
after 20 minutes, 36 hours, and 5 minutes respectively; a failure or a newer
unfinished run closes checkout.

Transactional order email is separately provider-scoped. The worker refuses to
claim jobs unless all seven variables are configured; values remain server-only
and are never logged:

- `ORDER_EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`
- `ORDER_EMAIL_FROM` (verified sender identity)
- `PUBLIC_SITE_URL` (canonical origin for `/library` and `/legal/refunds`)
- `SUPPORT_EMAIL` (public Reply-To/support identity)
- `LEGAL_SELLER_NAME` (verified seller display name; never inferred by code)
- `SCHEDULED_JOB_SECRET` (same value stored in Vault; only its SHA-256 digest
  crosses the checkout RPC boundary)
