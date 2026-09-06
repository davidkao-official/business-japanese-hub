# Cloudflare deployment identity and cache safety

This document is the narrow operational contract for proving that a Business
Japanese Hub Cloudflare Pages deployment is the exact repository commit an
operator intends to serve. The broader production activation and rollback
runbook remains `docs/deployment.md`.

## Three different states

Do not collapse these states into one:

1. **Merged to GitHub** — a commit is reachable from `main`.
2. **Cloudflare deployment completed** — the corresponding Pages project reports
   a successful build/deploy.
3. **Production exact head active** — the canonical origin serves HTML and
   `build-info.json` for that exact commit under the cache contract below.

A merge is not proof of a completed deployment. A green Cloudflare deployment is
not proof that a particular browser request received the new HTML. State 3 is
established by the repository deployment smoke.

## Artifact identity contract

Every Library and Career Game production build emits both:

- `build-info.json`, with exactly a versioned schema, product id, and 40-character
  repository commit SHA;
- a matching `<meta name="bjh-build">` marker in `index.html`.

Cloudflare Pages builds take the source identity from `CF_PAGES_COMMIT_SHA`.
Exact local/CI builds fall back to `git rev-parse HEAD`. Build identity contains
no timestamps, branch names, credentials, environment values, user data, or
commerce state.

The two copies are deliberate. `build-info.json` is a stable machine-readable
endpoint, while the HTML marker proves the shell returned to the requester is
from the same build. A new build-info response combined with stale cached HTML
therefore fails validation instead of looking healthy.

## Cache contract

The emitted Cloudflare `_headers` file applies only this repository-owned rule:

```text
/build-info.json
  Cache-Control: no-store
```

Do not add a broad `Cache-Control` rule for `/*` here. Cloudflare Pages' normal
HTML behavior should continue to revalidate instead of giving the browser a
positive freshness lifetime. The built-artifact smoke checks the exact bytes of
same-origin JS/CSS files referenced by the generated HTML.

The deployment smoke rejects:

- missing HTML `Cache-Control`;
- positive `max-age` / `s-maxage`;
- `immutable` on HTML;
- stale-serving directives such as `stale-while-revalidate` or `stale-if-error`;
- any present `CDN-Cache-Control`, `Cloudflare-CDN-Cache-Control`, or
  `Surrogate-Control` header that does not independently carry the complete
  HTML policy (`no-store`, unqualified `no-cache`, or `max-age=0` together
  with `must-revalidate`) or the
  build-info policy (unqualified `no-store`);
- `build-info.json` without `no-store`;
- same-origin built JS/CSS references that do not load as the expected asset
  media type;
- local built-artifact smoke responses whose JS/CSS path or bytes do not match
  the checked-out artifact map;
- a build-info SHA different from the expected commit;
- HTML whose embedded build identity differs from build-info.

The deployment smoke intentionally does not require a particular bundler
filename or hash shape. The frontend build contract test runs isolated
production-Vite baseline and test-only JS/CSS delta builds, then proves that
changed asset bytes receive changed HTML-referenced URLs. `smoke:built-frontends`
additionally maps every same-origin JS/CSS reference to the exact SHA-256 bytes
in the checked-out artifact and rejects a local response whose path or body is
not that map. Production smoke remains URL-shape agnostic while verifying the
emitted response and its cache/identity contract. Qualified directives such as
`no-cache="Set-Cookie"` do not count as full-response HTML revalidation.

The smoke validates only the client-visible response headers returned by the
URLs it requests. It cannot prove every Cloudflare Dashboard Edge Cache TTL or
Cache Rule, including rules that do not appear in that response or affect
other paths and variants. A dashboard-only suspicion requires operator
inspection of the Cloudflare configuration; it is not resolved by a passing
smoke alone.

When an alias or edge is briefly serving a prior valid build, the smoke retries
until `build-info.json` reports the expected commit and the HTML shell embeds
that same identity. It does not accept an HTTP-successful stale identity as a
final result.

## Exact-head verification

After the intended `main` commit has a successful Cloudflare deployment, check
out that exact commit and run:

```bash
git rev-parse HEAD
pnpm smoke:deployment https://business-japanese-hub.pages.dev/ library
pnpm smoke:deployment https://business-japanese-career-game.pages.dev/ career-game
```

`smoke:deployment` uses the checkout's exact Git HEAD as the expected commit by
default. To verify a known immutable SHA without changing checkout, pass it as
the optional fourth argument:

```bash
pnpm smoke:deployment \
  https://business-japanese-hub.pages.dev/ \
  library \
  <40-character-commit-sha>
```

Expected-revision precedence is:

1. explicit CLI SHA;
2. `EXPECTED_LIBRARY_DEPLOYMENT_SHA` or `EXPECTED_CAREER_GAME_DEPLOYMENT_SHA`;
3. generic `EXPECTED_DEPLOYMENT_SHA`;
4. the exact local Git HEAD.

The final fallback reads the checkout's Git HEAD directly, even if
`CF_PAGES_COMMIT_SHA` is present in the ambient environment. That Pages
variable identifies an emitted build; it does not change which revision an
exact-checkout smoke expects by default.

The product-specific variables matter because Library and Career Game have
independent deployment and rollback histories. To validate both canonical
origins when they intentionally serve different commits, use the existing
aggregate command with separate expected revisions:

```bash
EXPECTED_LIBRARY_DEPLOYMENT_SHA=<library-sha> \
EXPECTED_CAREER_GAME_DEPLOYMENT_SHA=<career-game-sha> \
pnpm smoke:deployment:production
```

Do not force one product back to the other's revision merely to make an
aggregate smoke green.

A successful smoke proves the requested origin returned the expected product,
exact build identity, safe HTML/build-info cache policy, loadable same-origin
assets, and the existing representative SPA routes. It does not replace
Cloudflare's own deployment status, broader CI, payment/security gates, or
human launch authorization.

## Diagnosing a stale-looking browser

If Cloudflare reports the intended deployment succeeded but the UI still looks
old:

1. Run the exact-head smoke above against the canonical origin.
2. Fetch `/build-info.json` and compare its `commitSha` with the intended Git
   commit. Do not treat a matching product title alone as deployment proof.
3. Inspect the root document response headers. Any positive browser/CDN cache
   lifetime or stale-serving directive is a configuration regression; inspect
   Cloudflare Cache Rules before changing application code. If the returned
   headers are safe but a dashboard-only TTL or rule concern remains, an
   operator must inspect the Cloudflare configuration directly.
4. If smoke passes but one browser tab remains visually old, reload/navigate and
   inspect that tab's document request. The artifact identity now distinguishes
   a stale browser response from a failed deployment.
5. Cache purging is an operator action, not an automatic repository side effect.
   Do not add purge credentials or deployment mutation to the smoke test.

## Rollback

Cloudflare rollback remains project-specific and follows `docs/deployment.md`.
After rollback, verify the rollback target by running the same smoke with the
rollback commit SHA. Library and Career Game keep independent deployment and
rollback histories; one product's rollback does not authorize replacing the
other product's artifact.
