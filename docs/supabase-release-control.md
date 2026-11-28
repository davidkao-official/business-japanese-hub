# Supabase production release

Merging to `main` automatically releases the production backend through
[Deploy Supabase production](../.github/workflows/supabase-deploy.yml). The
workflow also supports manual dispatch from `main` and runs one deployment at a
time. The GitHub `production` environment requires `SUPABASE_ACCESS_TOKEN` with
access to project `apndyhorzaxgdbipbecq`. The CLI uses a temporary database login
role, so the workflow uses the access token alone.

1. Print the linked migration ledger, apply pending migrations, then print and
   verify the ledger again.
2. Deploy each `supabase/functions/*/index.ts` through the Supabase API with its
   `verify_jwt` setting from `supabase/config.toml`.
3. Run the Library and Career Game smoke checks on the canonical Cloudflare
   origins, waiting for each to serve the workflow commit SHA.

Cloudflare and Supabase deploy concurrently. Migrations must be
backward-compatible with the frontend currently live. Expand the schema first,
then drop or rename objects in a later PR after no live code uses them. Verify
new backend behavior in production before merging frontend code that requires it.

If a run fails after migrations or functions start deploying, use its logs to
identify what applied before deciding on a forward repair. Keep committed
migrations in place and follow the [rollback runbook](deployment.md#5-rollback-and-observability).
Content publication and paid launch have separate admission gates.
