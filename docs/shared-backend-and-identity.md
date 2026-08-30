# Shared Backend and Identity Boundary

> **狀態：** durable implementation contract，從屬於
> [`product-contract.md`](product-contract.md) 與
> [`platform-architecture.md`](platform-architecture.md)。

本文件定義 Library 與 Career Game 目前真正共用的 backend／identity
邊界。它不是 universal product schema，也不授權新增 Career Game commerce、
production hostname 或第二套 backend。

## 1. One backend, one durable user identity

- 兩個 frontend 連到同一個 Supabase project，durable user key 一律是
  `auth.users.id`。不另建 Career Game user、profile 或 identity table。
- `@business-japanese-hub/platform-auth` 是 browser-side 的 narrow shared
  contract：public Supabase client、session restore、email/password auth state
  與 signed-out fallback。它不得依賴任一產品的 UI 或 domain model。
- `library` 與 `career-game` application IDs 只作 request diagnostics；目前以
  `X-Client-Info` 傳送。這個值由 browser 控制，**不得**用作 identity、role、
  RLS、entitlement 或任何 authorization decision。
- Email 只供 account UI 顯示與現有 email/password flow 使用；authorization
  永遠以已驗證 JWT 的 `auth.uid()` 為準。

## 2. Current consumer and data-access matrix

| Consumer | Browser access | Durable data in this slice | Authorization boundary |
| --- | --- | --- | --- |
| Anonymous Library | public catalog／free reading | none required | catalog/access rules fail closed for paid content |
| Authenticated Library | Supabase Auth + existing Library repositories | Book entitlement、reading state、bookmark | existing owner-scoped RLS; verified server events alone grant paid ownership |
| Anonymous Career Game | local scenario runtime + `localStorage` checkpoint | none | no Supabase data path |
| Authenticated Career Game | Supabase Auth only | **none yet**; checkpoint remains device-local | no Library repository、Book entitlement、payment or finance access |
| Payment／finance／email operations | Supabase Edge Functions or operator-only server tooling | existing commerce/compliance records | service-role or DB-backed operator role; never browser claims |

Issue #55 introduces no table, RPC, Edge Function or RLS path. Therefore it does
not invent four-role SQL tests. Any later Career Game persistence path (owned by
#57) must ship its migration and explicit anonymous／owner／unrelated user／
privileged-role coverage together. A finance role remains an ordinary user for
Career Game data unless a separate, evidence-backed contract says otherwise.

## 3. Browser configuration and secret boundary

Both Vite builds load the same repository-root public values:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Career Game sets its Vite `envDir` to the repository root so local builds do not
silently select a second project. If either value is absent, each frontend gets
the null auth adapter: public Library reading and anonymous Career Game play
remain available, while authenticated persistence and paid flows fail closed.

Only `VITE_` public values may enter browser artifacts. Service-role keys,
provider credentials, email credentials and scheduler secrets stay in
server-only environments. The dual-build regression test compiles with public
and server-secret sentinels and scans both artifacts for this boundary.

## 4. Session and origin topology

Supabase's default project-scoped browser storage key is intentionally preserved;
the clients do not define a product-specific auth storage key.

| Deployment shape | Expected behavior |
| --- | --- |
| Both products under one browser origin | The default project session can be reused. Auth state changes, including local-session logout, propagate through Supabase's same-origin browser mechanisms. |
| Products on separate origins or subdomains | Browser storage is origin-isolated. The user signs in again with the same Supabase account; logging out one origin does not revoke the other origin or another device. Each request still revalidates its JWT and fails closed when expired or invalid. |

Product logout buttons explicitly use Supabase `scope: 'local'`: they end the
current browser session without unexpectedly revoking refresh tokens on every
device. They are not an account-wide "sign out everywhere" control. As with any
JWT session, an already issued access token cannot be revoked before its expiry;
server authorization must continue to validate it rather than trust UI state.

The only canonical production frontend origin currently decided is the Library
at `https://business-japanese-hub.pages.dev/`. Career Game's production hostname
and routing belong to #60. This implementation does not create cross-domain SSO,
add OAuth, widen payment Edge Function CORS, or change `PUBLIC_SITE_URL`.

Career Game exposes existing-account email/password sign-in and sign-out only.
It does not create accounts or initiate redirect-based auth. If #60 later assigns
a separate production origin, Supabase Auth Site URL／redirect allow-lists and
email-link behavior must be reviewed explicitly; that decision must remain
coordinated with the canonical Library origin and deployment runbook.

## 5. Product and operational isolation

- Library retains `Book → Chapter → ContentBlock`, Book entitlement, Reader state
  and all payment-provider boundaries.
- Career Game retains scenario/runtime/checkpoint semantics. Auth does not turn a
  local checkpoint into durable progression; #57 owns that consumer-driven seam.
- Shared styles are semantic design tokens, not shared product UI. Account
  presentation remains product-owned in each frontend.
- No shared asset service, audit table or generalized telemetry schema exists.
  Supabase request/auth evidence and existing payment/order identifiers remain
  the authoritative operational sources. Logs must not include tokens, passwords,
  secrets or raw provider error details shown to users.
- Career Game must not query Book entitlement, order, payment, finance or tax
  data. Adding an authenticated product does not widen any existing grants.

## 6. Change checklist

Before extending this boundary:

1. identify the concrete consumer and keep its domain data product-owned;
2. use `auth.uid()` rather than a client-supplied user ID;
3. add deny-by-default privileges/RLS and role-matrix tests with the migration;
4. keep all service-role/provider secrets and authoritative writes server-only;
5. prove anonymous Library and Career Game paths still work;
6. re-run Library auth, entitlement, payment and finance regressions; and
7. do not infer #59 commerce or #60 routing decisions from shared identity.
