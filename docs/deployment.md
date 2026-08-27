# Production deployment runbook

This runbook keeps the public frontend deployable while payment, entitlement,
auth, legal, email, refund, and reconciliation paths remain server-authoritative
and fail closed.

## 1. Canonical frontend: Cloudflare Pages

The canonical production frontend is:

```text
https://business-japanese-hub.pages.dev/
```

GitHub Pages is **not** a deployment target for this project. Do not reintroduce
a repository project-path build, a copied top-level `404.html`, or a GitHub Pages
deploy workflow unless a later explicit deployment decision supersedes this
runbook.

Cloudflare Pages is connected to the repository and should use:

- production branch: `main`
- package manager: the committed `pnpm` version
- build command: `pnpm build`
- build output directory: `dist`
- `DEPLOY_BASE_PATH`: unset, so Vite builds for `/`

The root build now validates both frontend boundaries in one checkout:

```text
pnpm build
├── verify committed Library Book releases
├── typecheck all projects
├── build Library → dist/
└── build Career Game → dist-career-game/
```

Cloudflare Pages must continue to upload **only `dist/`**. The separate
`dist-career-game/` artifact proves that Career Game is independently
buildable; it has no production hostname or routing contract yet. That decision
is deferred to #60. Do not add a second Pages project, change `PUBLIC_SITE_URL`,
or infer production routing from the Career Game artifact without that explicit
decision.

Cloudflare Pages treats a project without a top-level `404.html` as a SPA and
serves the root application for unmatched history routes. The production build
therefore deliberately does **not** generate the old GitHub Pages `404.html`
artifact.

Frontend production environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- optional `VITE_EDGE_FUNCTIONS_BASE_URL` (otherwise derived from the Supabase URL)

Without the Supabase variables, the live frontend intentionally serves only the
free/public catalog and paid purchase remains unavailable.

The authenticated checkout and order-status functions accept browser CORS only
from the exact server-side `PUBLIC_SITE_URL`. For the current canonical origin,
set:

```text
PUBLIC_SITE_URL=https://business-japanese-hub.pages.dev/
```

Keep Supabase Auth Site URL / redirect allow-list aligned with that same origin.
If a custom domain later becomes canonical, update Cloudflare, `PUBLIC_SITE_URL`,
Auth redirects, CORS evidence, payment return URLs, email links, and this runbook
together rather than running two canonical origins.

After any production frontend deployment, run:

```bash
pnpm exec tsx scripts/smoke-deployment.ts https://business-japanese-hub.pages.dev/
```

The smoke verifies the root document, emitted assets, and direct SPA routes.
The commercial Book itself should additionally be checked manually through its
current catalog route as part of the paid golden path.

The product contract explicitly accepts that static web Book content can be
inspected in the browser bundle (`docs/accounts-and-entitlement.md` §7).
Server-authoritative ownership and in-product access gates are enforced, but
this is not DRM or a confidentiality boundary.

## 2. Production Supabase activation

Do not perform production writes until the intended Supabase project and
credentials are explicitly identified. Never use `supabase db reset --linked`
on production.

### 2.1 Exact-head local gates

From an exact reviewed `main`:

```bash
pnpm typecheck
deno check supabase/functions/*/index.ts
pnpm lint
pnpm test
pnpm build
supabase db start
supabase db reset --local
supabase test db --local supabase/tests
supabase db lint --local --schema public --level warning --fail-on error
```

### 2.2 Link and preflight the intended project

```bash
supabase login
supabase link --project-ref <production-project-ref>
supabase migration list --linked
supabase db push --linked --dry-run
```

If the first-sale migration reports duplicate pending Orders or another
financial inconsistency, stop and reconcile those facts manually. Migrations
must never guess or discard financial state merely to proceed.

### 2.3 Server-only secrets

For the smallest first-revenue profile, enable PayPal/USD plus Resend only:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV=prod`
- `PAYPAL_WEBHOOK_ID`
- `DEPLOYMENT_ENV=production`
- `ORDER_EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`
- verified `ORDER_EMAIL_FROM`
- `PUBLIC_SITE_URL=https://business-japanese-hub.pages.dev/`
- `SUPPORT_EMAIL`
- `LEGAL_SELLER_NAME`
- generated `SCHEDULED_JOB_SECRET`

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose a
service-role / secret key in Cloudflare Pages, GitHub repository variables, or
client code.

`DEPLOYMENT_ENV=production` is required. Missing, misspelled, or non-production
values disable live providers. A production deployment paired with
`PAYPAL_ENV=sandbox` or `ECPAY_ENV=stage` is rejected before checkout.

ECPay credentials may remain absent for the PayPal/USD first launch. Do not
release a TWD catalog row until its production operational evidence is ready.

### 2.4 Commerce-data preflight

Before applying migrations to a database that contains commerce data, run this
read-only preflight. Every query must return zero rows:

```sql
select payment_id, count(*)
  from public.refunds
 group by payment_id having count(*) > 1;

select provider, provider_refund_ref, count(*)
  from public.refunds
 where provider_refund_ref is not null
 group by provider, provider_refund_ref having count(*) > 1;

select source_order_id, count(*)
  from public.book_entitlement
 where source_order_id is not null
 group by source_order_id having count(*) > 1;

select id
  from public.payment_events
 where (
   processing_result is not null
   and processing_result not in (
     'succeeded', 'failed', 'verification_pending', 'refund_succeeded',
     'refund_pending', 'refund_failed', 'refund_mismatch',
     'unknown_reference', 'processing_error'
   )
 ) or (processed_at is null) <> (processing_result is null);
```

Stop on any result. Never delete financial rows merely to make a migration pass.
For an empty or quiesced first-revenue database, the committed unique-index
migrations are appropriate. If a target already has sustained writes or a large
ledger, prepare a separately reviewed online migration rather than improvising
inside `db push`.

### 2.5 Apply migrations and deploy Edge Functions

```bash
supabase db push --linked
supabase functions deploy --project-ref <production-project-ref>
```

Deploy using the JWT settings committed in `supabase/config.toml`.

### 2.6 Configure scheduled jobs

In server-only SQL/operator context, replace placeholder rows in
`scheduled_job_config` with this project's deployed `repair-reconcile` and
`order-email` function URLs. Create Vault secret `scheduled_job_secret` with the
same value as `SCHEDULED_JOB_SECRET`.

Keep these active jobs:

| Job | Schedule | Command |
| --- | --- | --- |
| `payments-repair-layer-b` | `*/10 * * * *` | `select public.scheduled_repair_call();` |
| `payments-recon-layer-c` | `0 3 * * *` | `select public.scheduled_reconciliation_call();` |
| `order-email-outbox` | `* * * * *` | `select public.scheduled_order_email_call();` |

Compute only the scheduled-job secret digest in a trusted shell:

```bash
read -r -s -p 'Scheduled job secret: ' BJH_SCHEDULED_JOB_SECRET
printf '\n'
BJH_SCHEDULED_JOB_SECRET_SHA256="$(
  printf %s "$BJH_SCHEDULED_JOB_SECRET" | openssl dgst -sha256 | awk '{print $2}'
)"
unset BJH_SCHEDULED_JOB_SECRET
printf 'SHA-256: %s\n' "$BJH_SCHEDULED_JOB_SECRET_SHA256"
```

Then pass only the digest to the readiness RPC:

```sql
select public.is_paid_launch_scheduler_ready(
  'https://<project-ref>.supabase.co/functions/v1/repair-reconcile',
  'https://<project-ref>.supabase.co/functions/v1/order-email',
  '<SCHEDULED_JOB_SECRET_SHA256>'
);
```

It must remain `false` until the deployed workers have produced fresh durable
success heartbeats.

### 2.7 Seed the released catalog

Review the dry run first, then sync the committed release ledger:

```bash
pnpm exec tsx scripts/update-catalog.ts --dry-run
```

Use the production invocation documented by the script only after confirming the
intended project and released prices. The browser cannot provide trusted amount,
currency, provider, or success state.

For the first-revenue profile, keep ECPay credentials absent and do not release
a TWD catalog row. `FUNDING_RECON_CSV` is an operator-supplied parser seam, not
an automated fresh report feed; ECPay/TWD requires separate dated settlement
report evidence before activation.

### 2.8 Auth, PayPal, and email external configuration

Configure Supabase Auth Site URL and redirect allow-list for:

```text
https://business-japanese-hub.pages.dev/
```

Configure the PayPal production webhook as:

```text
https://<project-ref>.supabase.co/functions/v1/paypal-webhook
```

Subscribe the exact capture/refund event catalog in
`docs/payments/implementation-contract.md`. Browser return parameters never
replace authoritative webhook/provider evidence.

Verify the Resend sender used by `ORDER_EMAIL_FROM` and retain evidence of a
real matching order-confirmation delivery before closing the email launch gate.

### 2.9 Named finance access

Provision finance roles only for verified operator user IDs:

```sql
insert into public.finance_roles (user_id, role)
values ('<verified auth.users id>'::uuid, 'finance_admin')
on conflict do nothing;
```

`GET /functions/v1/finance` with that user's bearer JWT returns bounded samples
for Orders, Payments, Refunds, Entitlements, callbacks, email and audit state.
Reconciliation and actionable-failure totals come from the server-only
`finance_status_counts()` RPC.

`finance_viewer` is read-only and receives redacted outbox/audit samples;
`finance_admin` can inspect the privileged operational fields and request a full
refund. No operator action may declare a refund successful without provider
evidence.

### 2.10 Prime worker health

Before checkout can become available, invoke:

1. `repair-reconcile` with `{"mode":"repair"}`
2. `repair-reconcile` with `{"mode":"reconcile"}`
3. `order-email` with the configured `X-Scheduled-Job-Secret`

Confirm 2xx responses in Edge Function logs and retain the resulting counts.
Each authenticated worker invocation records `scheduled_job_health`.

Checkout fails closed when repair, reconciliation, or email health is stale,
when the latest run failed, or while a newer run has no result. A cron row alone
proves scheduling, not successful execution.

## 3. Paid-launch activation gates

Before accepting a real payment, all enabled-jurisdiction gates must have real
evidence:

- canonical Cloudflare frontend is reachable and its production environment
  points to the intended Supabase project;
- Supabase migrations/functions/auth redirects are live;
- released USD catalog price matches the committed release;
- real seller identity/contact fields are supplied and match the merchant setup;
- exact legal documents have received the required human/professional approval;
- PayPal merchant/KYC eligibility and live credentials are confirmed;
- PayPal webhook is configured with the exact event catalog;
- Resend sender and delivery are verified;
- scheduler readiness is `true`;
- named finance access works without shared merchant credentials.

Japan tax status is required before enabling JP checkout. It does not block the
current USD-first launch where otherwise lawful. JPY adapter work remains a
separate follow-up and must not delay first revenue.

## 4. Production golden path

Activate the remaining fail-closed gates in a controlled window and execute one
low-value real purchase:

```text
Cloudflare Storefront
→ 会議の日本語
→ free preview
→ authenticated checkout
→ PayPal approval/capture
→ authoritative webhook
→ exactly-one Entitlement
→ Library / Reader access
→ order result / receipt
→ real confirmation email
→ finance visibility
→ full refund
→ entitlement revocation
→ reconciliation
```

Also exercise duplicate/replayed webhook evidence. Do not mark a gate passed
without external evidence.

After the transaction, rerun:

```bash
pnpm exec tsx scripts/smoke-deployment.ts https://business-japanese-hub.pages.dev/
```

Inspect finance state, payment events, outbox state, scheduler health, and logs.

## 5. Rollback and observability

- **Cloudflare Pages:** production is sourced from `main`. Prefer a normal revert
  PR to the last known-good commit, allowing Cloudflare Git integration to build
  and deploy the reviewed state. Cloudflare deployment history may be used as an
  emergency frontend rollback surface, but repository `main` must still be
  reconciled immediately afterward so Git remains canonical.
- **Edge Functions:** inspect Supabase Edge Function logs. A function-only
  rollback may redeploy a known-good Git SHA only after confirming compatibility
  with the current forward-only database schema.
- **Database:** inspect migration history, Postgres logs, `cron.job`,
  `payment_events`, `payments`, `orders`, `refunds`, `book_entitlement`,
  `order_email_outbox`, `scheduled_job_health`, and `admin_audit_log`. Never use
  `db reset` on production and never delete financial rows as rollback. Use a
  reviewed forward repair migration or the provider/database backup procedures
  for a genuine data incident.
- **Payments/email:** correlate provider event IDs with local
  Payment/Order/Refund IDs through the finance read model. Treat processing
  errors, unprocessed events, duplicate payments, requested/processing/failed
  refunds, dead/manual email jobs, reconciliation mismatches, and
  verification-pending attempts as actionable operator work. Never log secrets
  or customer email bodies.

Canonical payment details remain in `docs/payments/implementation-contract.md`
and `docs/payments/decision-record.md`.
