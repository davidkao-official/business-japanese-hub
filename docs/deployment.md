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

## 2. Production Supabase activation

Do not perform these steps until the production project and credentials are
provided by the owner. Never use `supabase db reset --linked` on production.

1. From an exact, reviewed `main`, run all local gates:

   ```bash
   pnpm typecheck
   deno check supabase/functions/*/index.ts
   pnpm lint
   pnpm test
   pnpm build
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
   - `ORDER_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, verified
     `ORDER_EMAIL_FROM`
   - `PUBLIC_SITE_URL=https://davidkao-official.github.io/business-japanese-hub/`
   - `SUPPORT_EMAIL`, `LEGAL_SELLER_NAME`, and a generated
     `SCHEDULED_JOB_SECRET`

   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not set
   or expose the service-role key in GitHub Pages variables. ECPay credentials
   may remain absent for the PayPal/USD first launch.

4. Apply migrations, then deploy all functions using the JWT settings in
   `supabase/config.toml`:

   ```bash
   supabase db push --linked
   supabase functions deploy --project-ref <production-project-ref>
   ```

5. In server-only SQL/operator context, replace the placeholder
   `scheduled_job_config` URLs with this project's deployed `repair-reconcile`
   and `order-email` URLs. Create Vault secret `scheduled_job_secret` with the
   exact same value as `SCHEDULED_JOB_SECRET`. Keep the one-minute
   `order-email-outbox`, ten-minute repair, and daily reconciliation cron jobs
   active. Seed the released catalog with `scripts/update-catalog.ts` only after
   reviewing its dry run.

6. Configure Supabase Auth Site URL/redirect allow-list for the canonical Pages
   URL and confirm production email delivery. Configure the exact PayPal webhook
   URL and events from `docs/payments/implementation-contract.md`.

7. Before enabling checkout, confirm the server-only scheduler readiness RPC,
   legal/seller readiness, released catalog price, PayPal live webhook, and
   Resend sender. Then execute one low-value paid golden path and verify Order,
   Payment, compliance snapshots, entitlement, Library delivery, confirmation
   email, refund/revocation, and financial reconciliation. Do not record a gate
   as passed without live evidence.

## 3. Rollback and observability

- **Pages:** inspect the `Deploy GitHub Pages` Actions run and `github-pages`
  environment. Roll back with a normal revert PR to the last known-good commit;
  merging it triggers a fresh validated deployment. Do not force-push `main`.
- **Edge Functions:** inspect Supabase Edge Function invocation/log views. A
  function-only rollback may redeploy a known-good Git SHA only after confirming
  it remains compatible with the current forward-only database schema.
- **Database:** inspect Postgres logs, migration history, cron jobs,
  `payments`, `orders`, and `order_email_outbox` from server-only/operator
  access. Never undo a production migration with `db reset` or by deleting
  financial rows. Use a reviewed forward repair migration; use the provider and
  database backup/PITR procedures for a genuine data incident.
- **Payments/email:** correlate provider event IDs and local Payment/order IDs;
  never log secrets or customer email bodies. Dead/manual outbox jobs and
  verification-pending attempts require operator review rather than blind
  replay.

Canonical details remain in `docs/payments/implementation-contract.md` and
`docs/payments/decision-record.md`.
