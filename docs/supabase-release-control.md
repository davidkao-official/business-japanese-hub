# Controlled Supabase production release proposal

**Status: proposed and inactive.** This document is an operating contract for a
future owner-authorized release. It records no production setting change,
release authorization, successful deployment, or current production baseline.
The Supabase production automatic-deployment setting remains as last verified by
its owner; this repository cannot establish its current value. A reviewed,
immutable proposal or toggle-only transition may be owner-authorized before
merge. A backend release is authorized separately against the exact reviewed
SHA that equals the frozen current `main` tip.

This procedure covers Supabase production migrations and Edge Functions only.
It does not authorize a release, a schema or function rollback, frontend
deployment, private-content import/publication, credentials changes, or paid
launch. Follow the product, shared-backend, private-content and database
validation contracts linked from [`deployment.md`](deployment.md).

**Pre-main-merge gate:** while Supabase production auto-deploy is disabled, each
candidate for `main` must have an explicit pre-merge disposition showing it is
safe with the currently active backend, identified by its production migration
ledger and full deployed function/version/config inventory, and the actual
active Library and Career Game production SHAs/publication floors. If separately
authorized reads cannot establish that baseline, hold the merge. Both Cloudflare
projects remain on `main`, so this gate must pass before merge, not at later
backend release time. If unsafe, stage a backward-compatible expand merge,
separately authorized backend release and verification, then a separately
authorized frontend-activation merge.

## 1. Release authority and the separate toggle decision

Supabase's GitHub integration can apply migrations, configured functions and
declared storage changes. A main merge therefore can affect production even
when its diff appears documentation-only. The owner must authorize two distinct
decisions:

1. **Toggle-only transition:** disable only the Supabase project's automatic
   production deployment switch, from enabled to disabled. Keep the repository
   `davidkao-official/business-japanese-hub`, repository working directory
   `.`, production branch `main`, previews, CI and both Cloudflare
   projects/settings unchanged. This
   decision authorizes no production release.
2. **A later, specific release:** name the exact reviewed main SHA, migration
   and function manifests, operator, window, compatibility decision, recovery
   owner, and permitted effects. PR #188 is the currently selected one-time
   verification event; an owner must explicitly disposition that merge before
   it occurs, then its exact result must be checked for absence of observed
   Supabase backend effects. Future releases record a named verification event
   only when applicable.

The transition packet below is a template for the first decision only. The
owner approves the exact scope, operator and freeze/preconditions before the
change. Fill unknown operational fields only from verified evidence; append
actual readbacks and outcomes after the operator observes them. Do not prefill
outcomes as facts. Neither this document nor a toggle receipt substitutes for
the second decision.

### Toggle-only transition packet

The requesting owner approves the authorization fields before the operator
touches the setting. The operator appends baseline and outcome receipts as they
are observed:

```text
OWNER AUTHORIZATION (before change)
Decision: Supabase production automatic-deployment toggle only
Production project ref: apndyhorzaxgdbipbecq
Exact Supabase project/dashboard identity to verify: <expected identity>
Repository: davidkao-official/business-japanese-hub
Repository working directory: .
Production branch: main
Single permitted change: Deploy to production enabled → disabled
Explicitly preserved: repository, root, branch, previews, CI, Cloudflare projects/settings
Exact reviewed proposal candidate SHA: <full SHA>
Owner decision and record link: <record>
Operator: <named person>
Freeze scope and start condition: <approved scope>
Verification merge authority: separate owner decision required
Release authority: NOT GRANTED by this packet
Recovery/escalation owner and contact path: <record>

OPERATOR RECEIPT (append observed outcomes)
Verified project identity and pre-change setting, timestamp/evidence: <record>
Affected writers frozen and queued/running/retryable work drained: <evidence>
Post-change setting readback, timestamp and project identity: <evidence>
Readback confirming no other setting changed: <evidence>
Freeze end condition and authorized operator: <record>
```

The operator first freezes all merge and deployment writers that could reach
the target, including queued, running, retryable, manually dispatched and
integration-triggered work. Drain and inspect those operations before taking a
baseline: switching the setting off does not cancel work already accepted or
running. Preserve a pre-change readback and queue state. Change only the named
toggle, then read it back in the same project and capture timestamped evidence.
Stop if project identity, prior state, queue state or readback is uncertain, or
if another setting would need to change. Keep the freeze in place until the
owner records its exact end condition and authorized operator; do not silently
release held or queued work.

## 2. Preconditions for a separately authorized release

No production command is permitted by this proposal alone. The release owner
must approve an immutable exact candidate and complete the following evidence
before authorizing a window:

- The reviewed frontend candidate was proven safe with the currently active
  production backend **before its main merge**. Both Cloudflare projects still
  deploy from `main`; compatibility discovered after merge is too late. If the
  candidate is unsafe with the current backend, split it into a
  backward-compatible expand merge, a separately authorized backend release
  and verification, then a separately authorized frontend-activation merge.
- The toggle-only transition is complete and read back as disabled. For this
  proposal, the owner explicitly dispositioned the selected one-time
  verification event (#188); timestamped observations show no Supabase
  migration, function or storage change caused by it. Record that event's exact
  SHA, CI result and both Cloudflare build/active deployment SHAs. Future
  receipts name a one-time verification event only when applicable.
- Before the first backend write, freeze main merges and every Cloudflare-
  changing writer, including main-triggered builds/deployments, manual
  deployments, rollbacks, project-setting and environment changes. Drain and
  read back queued, running and retryable Cloudflare operations too. This is
  operator coordination; keep Cloudflare automatic deployment enabled and its
  settings unchanged. Record the actual active Library and Career Game SHAs and
  their publication floors in the baseline, and keep both stable through full
  release reconciliation.
- The release SHA must equal the frozen current `main` tip. Before the first
  backend write and between each release step, recheck the binding tuple:
  reviewed release SHA equals frozen `main` tip, active Library SHA equals its
  recorded baseline, and active Career Game SHA equals its recorded baseline.
  Confirm both publication floors also remain unchanged. Stop on any drift or
  unknown value; an older SHA that is merely reachable from `main` is not
  eligible.
- A clean, isolated checkout is at that exact reviewed full SHA, with no local
  changes. Record repository, working directory, branch, SHA, operator,
  start time and host/session identity. Do not run release commands from a
  developer worktree or a checkout containing unrelated files.
- Supabase CLI is exactly `2.115.0`. Obtain it from the official release source;
  record download URL, platform, published checksum and independently computed
  checksum. Verify they match before use. Do not rely on a version label alone.
- Use only the approved sanitized operator environment and the repository's
  committed config from the isolated checkout. Inspect and remove unintended
  inherited Supabase or database connection overrides without printing secret
  values. Do not supply alternate config, workdir, import-map, database URL or
  other flags that redirect the CLI or replace committed per-function settings.
- The owner separately authorizes the exact project-link and authenticated
  read/preflight operations, including migration dry run, complete ledger and
  function inventory. A toggle decision or release direction alone does not
  authorize `supabase link`, credentials use or production queries.
- The operator explicitly links and verifies target ref
  `apndyhorzaxgdbipbecq` and the human-readable project identity using owner-held
  secure credentials. The repository's `project_id` is a local default, not
  proof of the linked production target. Credentials remain in the operator's
  approved secure session and are never added to GitHub, CI, this repository,
  logs or the receipt.
- Every possible deployment writer is frozen for the approved window, and all
  queued/running/retryable integration operations are drained and reconciled.
  Record the baseline immediately before release. Keep the freeze through
  outcome reconciliation and the owner-defined release end condition.
- The owner has reviewed the **entire** pending migration delta against the
  live production migration ledger, including the exact ordered identifiers,
  source-file SHA-256 digests, dry-run output, and the intended post-state. An
  unexplained ledger difference, unknown applied prefix, or unreviewed migration
  stops the release.
- Complete all migration-specific preflights and quiesce application writers
  required by the applicable migration contracts in `deployment.md` §§2.4–2.5.
  Deployment-writer freeze does not quiesce commerce or membership writers.
- Read-only production baselines are separately authorized work. Before any
  authenticated production query or inventory command, the owner records the
  exact project, operator, tool/query, fields, purpose and time window it may
  read. A release direction, toggle decision or this document grants no
  production-query authority. Keep those reads bounded; do not export private
  content or dump environment/credential values.
- The owner has reviewed a complete manifest of all Edge Functions configured
  at the candidate (**18 at this proposal base**): each slug, `verify_jwt`, effective entrypoint,
  hashes of all public local deployment inputs/configuration/entrypoints/import
  maps, and the literal external dependency specifiers. Reconcile this manifest
  with the full live deployed-function
  inventory and capture each live version/configuration and last deployment
  evidence. Do not infer inventory from a count. Unknown, missing or extra live
  functions require explicit reconciliation; do not delete or prune any
  function.
- In addition to the pre-merge gate above, the owner has assessed every
  backend-release intermediate state: new database schema with old Edge
  Functions, mixed old/new Edge Functions during sequential deployment, and
  relevant active/cached/rolled-back client publication floors. Include shared
  database and membership/access behavior where affected. Do not assume the
  final state proves intermediate safety.
- A named owner controls stop/recovery decisions. The release authorization
  states the migration and function scope, allowed effects, freeze duration,
  stop criteria, forward-repair authority and any separately permitted Edge
  rollback. It does not authorize schema-history repair, reverse migrations,
  data deletion, content publication or identity/access fabrication.

Use the official [Supabase CLI v2.115.0 deploy implementation](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/shared/functions/deploy.ts)
for the explicit-name and per-function configuration behavior. The
[Supabase GitHub integration guide](https://supabase.com/docs/guides/deployment/branching/github-integration)
defines the integration's migration, configured-function and declared-storage
scope. Recheck both references against the pinned CLI and current project setup
when preparing a real release.

## 3. Capture and reconcile the release manifest

Capture evidence from the exact clean candidate and the verified live target.
The following is a minimum manifest shape, not a claim about current production
state:

| Area | Required candidate evidence | Required live comparison |
| --- | --- | --- |
| Target | Full SHA, repository/working directory (`.`)/branch, explicit project ref and verified project identity | Project ref/name readback and current deployment settings |
| Migrations | Complete ordered pending identifiers; SHA-256 per source; reviewed dry-run and expected effects | Full migration ledger, applied/pending sets and any unknown entries |
| Edge Functions | All candidate-configured slugs (18 at this proposal base); JWT setting; effective entrypoint; SHA-256 for public local deployment inputs/configuration/import maps; literal external dependency specifiers | Full live inventory, slug, deployed version, JWT/configuration and timestamp/log evidence |
| Other integration scope | Confirm no storage changes are declared; any declaration stops this procedure pending a separately reviewed mechanism and authorization | No storage write under this procedure |
| Compatibility | Each intermediate state, clients/publication floors and rollback floor | Current frontend/backend/schema/function versions and relevant publication state |
| Quiescence | Freeze owner, start time, affected writers, drain evidence, end condition | Queue/running/retryable work re-read immediately before first write |

Generate the function manifest from committed `supabase/config.toml` and the
resolved files at the candidate, not from this document alone. This is the
current config inventory at the proposal base, included as a completeness
check; rederive and review it for every candidate:

| Function slug | `verify_jwt` |
| --- | --- |
| `checkout` | `true` |
| `orders-status` | `true` |
| `finance` | `true` |
| `career-game-progress` | `true` |
| `library-learning-evidence` | `true` |
| `content-delivery` | `true` |
| `practice-attempts` | `true` |
| `plus-membership` | `true` |
| `my-learning` | `true` |
| `reading-saves` | `true` |
| `workplace-saves` | `true` |
| `product-analytics` | `false` |
| `repair-reconcile` | `false` |
| `order-email` | `false` |
| `ecpay-callback` | `false` |
| `ecpay-browser-return` | `false` |
| `paypal-webhook` | `false` |
| `paypal-browser-return` | `false` |

At the proposal base, each function uses the default
`supabase/functions/<slug>/index.ts` entrypoint and no per-function import-map
override. Confirm that remains true at the candidate; record the effective
entrypoint, any configuration/import inputs and their hashes rather than
assuming the default. Hash every public local deployment input, config,
entrypoint and import map; record external dependency specifiers literally.
The manifest must retain the mixed JWT contract. Do not replace per-function
settings with a blanket override. Compare the expected live inventory one
function at a time. Reconcile every function configured at this candidate; a
matching function count alone is not successful reconciliation.

At this proposal base, 17 function imports use
`npm:@supabase/supabase-js@^2.112.3`, and no Supabase Edge lockfile is
committed. The CLI's `--use-api` source-upload path resolves external
dependencies; there is no evidence that it consumes `pnpm-lock.yaml`.
Consequently, the same Git SHA can produce a different remote bundle as
external dependencies resolve. Local source hashes and literal specifiers
establish input attribution only; they do not establish resolved dependency
hashes or byte parity with a compiled/deployed bundle.
Retain available provider deployment/version/artifact receipts, timestamps and
relevant logs separately. A deterministic bundle mechanism is a future,
separately qualified requirement; it is not a prerequisite for the toggle-only
transition.

## 4. Controlled apply sequence

Only after the owner grants the separate exact-SHA release authorization may the
named operator use the pinned CLI in the isolated checkout. Commands below are
illustrative for that authorization; placeholders must be filled from its
receipt, and production commands must not be copied into CI or a workflow.

1. Reconfirm the approved full SHA, clean checkout, CLI binary checksum,
   project identity/ref, disabled auto-deploy readback, writer freeze, drained
   Supabase and Cloudflare queues, migration ledger, function manifest and live
   inventory. Confirm the release SHA equals frozen current `main` tip, both
   active Cloudflare SHAs equal their baseline SHAs, and publication floors are
   unchanged. Recheck that tuple immediately before and after each mutating CLI
   command and between individually deployed function slugs; stop on drift or
   unknown state. Review compatibility across every migration prefix in the
   approved batch before applying it.
2. Capture the final migration dry run and compare every proposed identifier to
   the owner-approved ordered delta. If the CLI proposes anything else, stop.
3. After the separately authorized link is verified, run the final dry run with
   that isolated checkout's link, then apply only the approved migrations:

   ```bash
   supabase db push --linked --dry-run
   supabase db push --linked
   ```

   Treat `db push` as one mutating command: it may commit a migration prefix,
   and this procedure assumes neither an atomic batch nor per-migration pause
   and tuple inspection. Preserve compatibility across the entire approved
   migration batch. On failure or uncertainty, stop and use only the existing
   separately authorized ledger readback to reconcile the applied prefix.

4. `--use-api` uploads and deploys source, changing remote bundle/version
   state; it is not an API-bundle-only preflight. Deploy only the approved
   function slugs, one command per slug, using explicit project ref and one job
   at a time. Example form:

   ```bash
   supabase functions deploy <approved-slug> \
     --project-ref apndyhorzaxgdbipbecq --use-api --jobs 1
   ```

   Continue only while each command result and resulting live version/config
   readback matches the approved manifest. Recheck the frozen-main/Cloudflare
   tuple between individually deployed slugs; preserve `verify_jwt` from
   committed per-function configuration.
5. Read back the complete migration ledger and all live functions; compare
   source/version, JWT configuration and timestamps, and inspect relevant logs
   for observed effects. Counts or command exit status alone are insufficient.
   Confirm the recorded active Library and Career Game SHAs and publication
   floors stayed stable through complete release reconciliation before releasing
   any freeze.
6. The owner reviews the receipt and explicitly ends the freeze. Keep the toggle
   disabled unless a separate owner decision authorizes a different state and
   its consequences. Re-enabling automation is never an automatic recovery
   step.

Never use `--prune`, `--no-verify-jwt`, `--import-map`, `--db-url`,
`--include-all`, `--seed`, role changes, or migration-history repair as a
shortcut. Do not run a blanket `functions deploy` command. This procedure
covers migrations and functions only: if the candidate declares a Storage
change, stop for a separately reviewed deployment mechanism and owner
authorization. Do not alter the project's integration configuration,
repository, working directory, branch, previews, CI, Cloudflare settings,
secrets or credentials as part of this release.

## 5. Stop and recovery rules

Stop immediately on an unexpected migration, function, configuration or
storage change; a failed command; a timeout; a lost connection; ambiguous
readback; changed baseline; or any evidence that the operation may have applied
partially. Preserve output and timestamps without exposing secrets. Keep all
deployment writers frozen and notify the named recovery owner.

Reconcile the actual applied prefix before taking another action: compare the
live migration ledger and schema observations, per-function versions and JWT
settings, deployment timestamps/logs, storage state if applicable, and frontend
and publication floors. Establish which effects occurred and which remain
unknown. Do not blindly retry the full sequence, reset a database, repair the
migration ledger, reverse committed schema, delete data/functions, or toggle
automatic deployment back on.

Any repair must be a new, explicitly reviewed forward change with its own exact
manifest and authorization. An Edge rollback additionally requires a fresh
compatibility check against the **current** schema and publication floor, plus
specific owner authorization naming the functions and versions. A migration
rollback is not an available generic recovery path. If a safe state cannot be
established, leave the release frozen and escalate to the owner.

## 6. Release receipt

Keep one receipt with the owner decision and exact evidence links. Mark unknowns
as unknown; never fill absent production facts with an expected or proposed
value.

```text
Release decision/record:
Release scope and owner:
Operator and recovery owner:
Authorized window; freeze start/end condition:
Exact reviewed candidate SHA / repository / working directory (`.`) / branch:
CLI version / download URL / published checksum / verified checksum:
Project ref and human-readable identity readback:
Deploy-to-production toggle readback and timestamp:
Queue freeze and drained-operation evidence:
Named one-time verification event and owner disposition (if applicable), SHA,
  CI/Cloudflare receipts, and no-observed-Supabase-effect evidence:
Migration manifest link, ordered delta, per-file digests, dry run:
Pre/post full migration ledger and observed applied prefix:
Function manifest link (all candidate-configured slugs; 18 at proposal base;
  JWT, local-input/config hashes,
  literal external dependency specifiers):
Pre/post full deployed-function inventory and per-function versions/config:
Deployment timestamps/logs and observed effects:
Storage scope/reconciliation, if applicable:
Frozen main SHA; active Library and Career Game baseline SHAs and publication
  floors; evidence they remained stable through reconciliation:
Failures, uncertainty, stop/recovery actions or forward repair authorization:
Toggle final state / separate decision link:
Owner disposition: RELEASE PASS / HOLD / PARTIAL-RECONCILED
```

`RELEASE PASS` requires complete evidence against the exact authorized scope
and owner disposition. A successful command, green CI, a disabled toggle, or a
matching function count is not by itself release proof.
