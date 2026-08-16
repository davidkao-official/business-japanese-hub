# Payment / Commerce Database — Operator Reference

> **本文件不是 source of truth。**
> 唯一規範來源是：
> 1. `supabase/migrations/0002_commerce.sql`、`supabase/migrations/0003_compliance_finance.sql`（SQL 就是 contract）
> 2. `src/lib/payments/contract.ts`（共享 TS contract）
> 3. `docs/payments/decision-record.md`（canonical decision record：§8 Money、§8.3 catalog seam、§9 entitlement migration、§12 data model、§13 idempotency、§14 finance、§15 security）
>
> 本文件只是 human-readable index，幫助 operator／Edge Function（A4）快速定位欄位與安全邊界；若與 SQL／contract 衝突，以 SQL／contract 為準。

## Tables

| Table | Migration | Purpose | Security |
| --- | --- | --- | --- |
| `catalog` | 0002 | Authoritative server-side price seam (§8.3). Checkout reads `released_at <= now()`; client display uses the static bundle `Price`. | **No-read boundary**: RLS on, zero client policies, `revoke` from anon/authenticated/PUBLIC, `grant select` to `service_role` only. service_role keeps its Supabase-default INSERT/UPDATE (used by `scripts/update-catalog.ts`). |
| `orders` | 0002 | One purchase intent. `amount_minor/currency/published_revision/item_name_snapshot` are **immutable** (trigger `orders_immutable_fields_check`); orchestration updates only `status/paid_at/refunded_at`. | Server-only. |
| `payments` | 0002 | Payment attempts. `provider_merchant_ref` (ECPay MerchantTradeNo) unique per provider; `provider_payment_ref` (TradeNo) unique once known (partial index). | Server-only. |
| `refunds` | 0002 | **Source of truth for refunds** (§7). MVP full refund only; provider-confirmed refund → `status='succeeded'`. | Server-only. |
| `payment_events` | 0002 | Reliability ledger; `UNIQUE(provider, event_fingerprint)` makes duplicate callbacks a no-op. `sanitized_payload_json` holds allowlisted financial/status fields only. | Server-only. |
| `book_entitlement` | 0001 + 0003 | Ownership. 0003 adds `source_order_id`/`status`/`revoked_at`/`revocation_reason` and relaxes the provider CHECK. Retains the 0001 select-only policy for the owning user. | Client can only read own rows; writes only via `grant_entitlement`. |
| `order_compliance` | 0003 | Order-linked immutable compliance evidence (notice/consent snapshots) written in the same transaction as Order creation (#25). One row per order. | Server-only. |
| `finance_roles` | 0003 | Server-enforced `finance_viewer` / `finance_admin`. Source for the finance Edge Function authorization — never trust a client-claimed role. | Server-only (`grant select` to service_role). |
| `admin_audit_log` | 0003 | Audit trail for finance/operator actions (refund requests, reconciliation overrides) with before/after state. | Server-only. |
| `platform_tax_config` | 0003 | Japan consumption-tax status boundary (#25). Seeded `('japan_consumption_tax_status','unresolved')` — fail-closed: never apply 10% tax / claim tax-inclusive pricing until explicitly `taxable` or `exempt`. | Server-only (clients must not override). |

## Security posture

- **Server-only set**: `catalog`, `orders`, `payments`, `refunds`, `payment_events`, `order_compliance`, `finance_roles`, `admin_audit_log`, `platform_tax_config` — every one has RLS enabled, **no client policy**, privileges revoked from anon/authenticated/PUBLIC, and only `service_role` grants. The DB must never let an authenticated client read another user's order or any payment/finance row.
- **`book_entitlement`** keeps its own-row select policy from 0001; writes flow only through the `grant_entitlement` write point (service_role-only EXECUTE).
- **Money**: amounts are stored as integer minor-unit `bigint` (`amount_minor`) with `CHECK (amount_minor >= 0 AND amount_minor <= 9007199254740991)`; currency is uppercase ISO 4217. **Never** store major-unit display amounts as payment truth.

## Idempotency constraints (§13)

1. Payment attempt: `UNIQUE(provider, provider_merchant_ref)`.
2. Provider transaction: partial unique index `payments_provider_payment_ref_uidx` on `(provider, provider_payment_ref) WHERE provider_payment_ref IS NOT NULL`.
3. Callback receipt: `UNIQUE(provider, event_fingerprint)`.
4. Ownership: `UNIQUE(user_id, book_id)` on `book_entitlement`.

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
- `provider_ref` / `source_order_id` / `granted_at` refresh **only when the incoming `provider_ref` is non-NULL** — the "legitimate refresh" signal. A pure status flip passes NULL and preserves existing provenance.
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

Real end-to-end enforcement (RLS, triggers, grants) requires a provisioned Supabase
instance: `supabase start` (or a project) + `supabase db reset` to apply 0001→0003.
Until then, the migration contract tests (`src/lib/persistence/migration-0002.test.ts`,
`migration-0003.test.ts`) parse the SQL text and assert security intent without
executing it; real enforcement is verified against the deployed instance (mirroring
`docs/accounts-and-entitlement.md` §9).
