# Production deployment runbook

This runbook keeps the public frontend deployable before paid activation while
all payment, entitlement, auth, legal, email, refund, and reconciliation paths
remain server-authoritative and fail closed.

## 1. GitHub Pages public frontend

One repository administrator must set **Settings → Pages → Source → GitHub
Actions**. The `Deploy GitHub Pages` workflow then validates the full
application and server/database boundary, builds with the project base
`/business-japanese-hub/`, deploys, and smokes the root, built assets, a direct
Book route, and the purchase-result route.

Repository variables:

- `DEPLOY_BASE_PATH=/business-japanese-hub/` (the workflow default; use `/` only
  after configuring a custom domain)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public browser values)
- optional `VITE_EDGE_FUNCTIONS_BASE_URL` (otherwise derived from the Supabase
  URL)

Without the Supabase variables, the live site intentionally serves only the
free/public catalog and paid purchase remains unavailable.

The authenticated checkout and order-status functions accept browser CORS only
from the exact origin derived from server-only `PUBLIC_SITE_URL`; keep it aligned
with the canonical Pages/custom-domain URL. The deploy job holds only Pages/OIDC
permissions. Post-deploy route smoke runs afterward in a separate read-only job.

The current product contract also explicitly accepts that static web Book
content can be inspected in the browser bundle (`docs/accounts-and-entitlement.md`
§7). Server-authoritative ownership and in-product access gates are enforced,
but they are not DRM or a confidentiality boundary; the Pages deployment does
not claim otherwise. A future private content-delivery layer would be a separate
product/architecture decision, not a payment-entitlement shortcut.

## 2. Production Supabase activation

Do not perform these steps until the production project and credentials are
provided by the owner. Never use `supabase db reset --linked` on production.

1. From an exact, reviewed `main`, run all local gates:

   ```bash
   pnpm typecheck
   deno check supabase/functions/*/index.ts
   pnpm lint
   pnpm test
   DEPLOY_BASE_PATH=/business-japanese-hub/ pnpm build:pages
   supabase db start
   supabase db reset --local
   supabase test db --local supabase/tests
   supabase db lint --local --schema public --level warning --fail-on error
   ```

2. Authenticate and link the intended project, then inspect migration state:

   ```bash
   supabase login
   supabase link --project-ref <production-project-ref>
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```

   If the first-sale migration reports duplicate pending Orders, stop and
   reconcile those payment records manually. The migration deliberately refuses
   to guess or discard financial state.

3. Set Edge Function secrets through Supabase Secrets or an untracked local env
   file (`supabase secrets set --env-file <untracked-file>`). For the smallest
   first-revenue configuration, enable only PayPal/USD plus Resend:

   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=prod`,
     `PAYPAL_WEBHOOK_ID`
   - `DEPLOYMENT_ENV=production` — required. Missing, misspelled, or any value
     other than `production` disables live providers. A production deployment
     paired with `PAYPAL_ENV=sandbox` or `ECPAY_ENV=stage` is rejected before
     creating a checkout.
   - `ORDER_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, verified
     `ORDER_EMAIL_FROM`
   - `PUBLIC_SITE_URL=<canonical public site URL for this deployment>` (default:
     `https://davidkao-official.github.io/business-japanese-hub/`; use the exact
     custom-domain URL when applicable)
   - `SUPPORT_EMAIL`, `LEGAL_SELLER_NAME`, and a generated
     `SCHEDULED_JOB_SECRET`

   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not set
   or expose the service-role key in GitHub Pages variables. ECPay credentials
   may remain absent for the PayPal/USD first launch.

4. Before applying migrations to a database that contains commerce data, run
   this read-only preflight. Every query must return zero rows. Stop on any
   result and reconcile the duplicate/inconsistent facts before deployment;
   never delete financial rows merely to make a migration pass.

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

   The launch migrations build three unique indexes with ordinary write locks.
   That is appropriate for the empty or quiesced first-revenue database. If a
   target already has sustained writes or large ledgers, stop and prepare a
   reviewed online migration using `CREATE UNIQUE INDEX CONCURRENTLY` through a
   coordinated direct Postgres session; do not improvise it inside `db push`.

5. Apply migrations, then deploy all functions using the JWT settings in
   `supabase/config.toml`:

   ```bash
   supabase db push --linked
   supabase functions deploy --project-ref <production-project-ref>
   ```

6. In server-only SQL/operator context, replace both placeholder rows in
   `scheduled_job_config` with this project's deployed `repair-reconcile` and
   `order-email` URLs. Create Vault secret `scheduled_job_secret` with the exact
   same value as `SCHEDULED_JOB_SECRET`. Keep these exact active jobs:

   | Job | Schedule | Command |
   | --- | --- | --- |
   | `payments-repair-layer-b` | `*/10 * * * *` | `select public.scheduled_repair_call();` |
   | `payments-recon-layer-c` | `0 3 * * *` | `select public.scheduled_reconciliation_call();` |
   | `order-email-outbox` | `* * * * *` | `select public.scheduled_order_email_call();` |

   Verify the complete gate from server-only SQL before attempting checkout;
   do not substitute only the legacy email-readiness RPC:

   First compute only the digest in a trusted shell; the silent-read command
   keeps the raw secret out of shell history and SQL/query logs:

   ```bash
   read -r -s -p 'Scheduled job secret: ' BJH_SCHEDULED_JOB_SECRET
   printf '\n'
   BJH_SCHEDULED_JOB_SECRET_SHA256="$(
     printf %s "$BJH_SCHEDULED_JOB_SECRET" | openssl dgst -sha256 | awk '{print $2}'
   )"
   unset BJH_SCHEDULED_JOB_SECRET
   printf 'SHA-256: %s\n' "$BJH_SCHEDULED_JOB_SECRET_SHA256"
   ```

   Pass only that digest to the readiness query:

   ```sql
   select public.is_paid_launch_scheduler_ready(
     'https://<project-ref>.supabase.co/functions/v1/repair-reconcile',
     'https://<project-ref>.supabase.co/functions/v1/order-email',
     '<SCHEDULED_JOB_SECRET_SHA256>'
   );
   ```

   It stays `false` until the deployed workers have produced fresh durable
   success heartbeats (step 9), and must then return `true`. Seed the released catalog with
   `scripts/update-catalog.ts` only after reviewing its dry run.

   For the first-revenue profile, keep ECPay credentials absent and do not
   release a TWD catalog row. `FUNDING_RECON_CSV` is an operator-supplied parser
   seam, not an automated fresh report feed; ECPay/TWD requires a separate
   evidenced dated-upload or download workflow before it can be activated.

7. Configure Supabase Auth Site URL/redirect allow-list for the canonical Pages
   URL and confirm production email delivery. Configure the production PayPal
   webhook as
   `https://<project-ref>.supabase.co/functions/v1/paypal-webhook` and subscribe
   the complete capture/refund event list in
   `docs/payments/implementation-contract.md`; the browser return cannot replace
   these authoritative events.

8. Provision named finance access only for verified operator user IDs; never
   accept a role in a request body or share a buyer JWT:

   ```sql
   insert into public.finance_roles (user_id, role)
   values ('<verified auth.users id>'::uuid, 'finance_admin')
   on conflict do nothing;
   ```

   `GET /functions/v1/finance` with that user's bearer JWT returns bounded row
   samples for Order/Payment/Refund/Entitlement, callback, email, and audit
   inspection. Reconciliation and actionable-failure totals are exact
   full-ledger counts from the server-only `finance_status_counts()` RPC, so an
   older unresolved row cannot disappear merely because it falls outside a
   display sample. Durable scheduler health is returned separately.
   `finance_viewer` is read-only and receives redacted outbox/audit samples;
   only `finance_admin` can read their customer/audit payloads or request a refund.
   There is no operator action that can declare a refund successful without
   provider evidence.

   The first-launch operator surface is the authenticated finance API/CLI (no
   browser admin route). In a trusted shell, obtain a short-lived token for the
   named finance user and inspect it with these exact requests; do not paste the
   password, token, service-role key, or scheduled-job secret into Issues/logs:

   ```bash
   export BJH_SUPABASE_URL='https://<project-ref>.supabase.co'
   export BJH_SUPABASE_ANON_KEY='<production publishable/anon key>'
   read -r -s -p 'Finance user password: ' BJH_FINANCE_PASSWORD
   BJH_FINANCE_JWT="$(/usr/bin/curl --fail-with-body --silent --show-error \
     "$BJH_SUPABASE_URL/auth/v1/token?grant_type=password" \
     -H "apikey: $BJH_SUPABASE_ANON_KEY" \
     -H 'Content-Type: application/json' \
     --data "$(jq -nc --arg email '<named-finance-user@example.com>' \
       --arg password "$BJH_FINANCE_PASSWORD" '{email:$email,password:$password}')" \
     | jq -er '.access_token')"
   unset BJH_FINANCE_PASSWORD

   /usr/bin/curl --fail-with-body --silent --show-error \
     "$BJH_SUPABASE_URL/functions/v1/finance" \
     -H "Authorization: Bearer $BJH_FINANCE_JWT" | jq .
   ```

   For a reviewed PayPal full-refund request, copy the immutable local Payment
   UUID from that read model, confirm its amount/currency/provider, then run:

   ```bash
   /usr/bin/curl --fail-with-body --silent --show-error \
     "$BJH_SUPABASE_URL/functions/v1/finance" \
     -H "Authorization: Bearer $BJH_FINANCE_JWT" \
     -H 'Content-Type: application/json' \
     --data "$(jq -nc --arg paymentId '<payment-uuid>' \
       --arg reasonCode 'buyer_request' \
       '{action:"request_refund",paymentId:$paymentId,reasonCode:$reasonCode}')" | jq .
   unset BJH_FINANCE_JWT
   ```

9. Before checkout can become available, invoke `repair-reconcile` once with
   `{"mode":"repair"}`, once with `{"mode":"reconcile"}`, and invoke
   `order-email` with the configured `X-Scheduled-Job-Secret`. Confirm 2xx
   responses in Edge Function logs and retain the resulting counts. Each
   authenticated worker invocation records `scheduled_job_health`; checkout
   closes when repair (20 minutes), reconciliation (36 hours), or email (5
   minutes) lacks a fresh success, when the latest run failed, or while a newer
   run has no result. Per-item provider, finalizer, and persistence failures make
   the whole worker heartbeat fail even when the remaining scan continues. A
   cron row alone proves scheduling, not successful HTTP execution.

10. Confirm the server-only scheduler
   readiness RPC, legal/seller readiness, released catalog price, PayPal live
   webhook, and Resend sender. Activate the remaining fail-closed launch
   conditions in a controlled window, execute one low-value paid golden path,
   then verify Order, Payment, compliance snapshots, entitlement, Library
   delivery, confirmation email, refund/revocation, and financial
   reconciliation. Do not record a gate as passed without live evidence.

## 3. Rollback and observability

- **Pages:** inspect the `Deploy GitHub Pages` Actions run and `github-pages`
  environment. Roll back with a normal revert PR to the last known-good commit;
  merging it triggers a fresh validated deployment. Do not force-push `main`.
- **Edge Functions:** inspect Supabase Edge Function invocation/log views. A
  function-only rollback may redeploy a known-good Git SHA only after confirming
  it remains compatible with the current forward-only database schema.
- **Database:** inspect Postgres logs, migration history, `cron.job`,
  `payment_events`, `payments`, `orders`, `refunds`, `book_entitlement`,
  `order_email_outbox`, `scheduled_job_health`, and `admin_audit_log` from
  server-only/operator access.
  Never undo a production migration with `db reset` or by deleting
  financial rows. Use a reviewed forward repair migration; use the provider and
  database backup/PITR procedures for a genuine data incident.
- **Payments/email:** use the finance read model to correlate provider event IDs
  and local Payment/Order/Refund IDs. Treat `processingErrors`, unprocessed
  events, `duplicatePayments`, requested/processing/failed refunds, `emailDead`,
  reconciliation mismatches, and verification-pending attempts as actionable;
  never log secrets or customer email bodies. Dead/manual outbox jobs and
  verification-pending attempts require operator review rather than blind
  replay.

Canonical details remain in `docs/payments/implementation-contract.md` and
`docs/payments/decision-record.md`.
