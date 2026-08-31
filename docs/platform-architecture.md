# Platform Architecture — Library + Career Game

> **狀態：** durable architecture contract。
> 本文件界定 Business Japanese Hub 的產品 bounded contexts 與共用平台邊界；產品定位與 delivery priority 仍以 [`product-contract.md`](product-contract.md) 為 canonical source of truth。

## 1. Architecture decision

Business Japanese Hub 是**一個 shared、web-first 的 business-Japanese 平台**，包含兩個 first-class frontend products：

- **Library**：premium digital publishing 與 Reader。內容與單本商業單元遵循 `Book → Chapter → ContentBlock`。
- **Career Game**：story-driven workplace simulator。內容語意涵蓋 scenario／case、scene、choice／action、outcome／consequence、explanation／feedback 與 progression；這是 bounded-context boundary，不預先鎖死最終 type names。

預設架構是**一個 repository、一個 shared Supabase modular monolith**。目前沒有建立第二套 backend 或拆成 microservices 的需求；只有在可觀測到的 scale、security 或 operating boundary 證據支持時，才另作架構決策。

## 2. Bounded contexts

| Context | Owns | Must not own |
| --- | --- | --- |
| Library | Book catalog、Book/Chapter/ContentBlock、Storefront、Library、Reader、reading state、Book access 與 current single-Book commerce flow | Career Game scenario graph、choice/outcome、game progression |
| Career Game | workplace cases/scenarios、scenes、choices/actions、outcomes/consequences、feedback/explanations、game progression 與其專屬 UI/state | Book/Chapter/ContentBlock、Library Reader state、Book-specific purchase assumptions |
| Shared platform | repository/tooling、Supabase/backend boundary、durable account/user identity namespace、secure server boundary、shared assets 與 operational data；catalog、commerce、entitlement、progress 只提供實際 consumer 需要的 shared contracts | 取代兩個產品 domain model 的 universal content schema 或 universal UI grammar |

兩個產品各自保有 UI、navigation、state model 與 release cadence。Library Reader 必須維持 premium editorial surface；Career Game 可以使用 distinct case-file／narrative grammar。共用 design tokens 或 shell 不代表兩者必須長得相同。

## 3. Allowed dependency directions

```text
Library UI ────────> Library domain ───┐
                                       ├──> narrow shared platform contracts
Career Game UI ───> Career Game domain ┘

payment adapter -> provider-neutral payment core -> authoritative entitlement grant
```

- Product UI 依賴自己的 domain model；不得跨 context import 另一產品的 content/state model 來表達本產品資料。
- Shared contracts 必須 narrow、consumer-driven。沒有第二個真實 consumer 時，不得為了「未來共用」建立 mega-schema。
- Shared platform 可以提供 identity、server boundary、assets、telemetry/operations 等 primitives；它不得反向依賴 Library 或 Career Game 的 presentation。
- Catalog、commerce、entitlement 與 progress 只有在某個 product flow 實際需要時才接入。Library 的 Book entitlement 不自動成為 Career Game 的 access/progression schema。
- Payment provider mechanics 停在 adapter boundary；browser state 不得建立 paid ownership，server execution boundary 維持 Supabase Edge Functions。

## 4. Frontend topology

目前使用 incremental、非對稱的雙 frontend topology，避免為了加入 Career Game 而搬動已上線的 Library：

| Product | Source / entry | Build config | Artifact | Cloudflare Pages project / origin |
| --- | --- | --- | --- | --- |
| Library | repository root `index.html` + `src/` | `vite.config.ts` | `dist/` | `business-japanese-hub` / `https://business-japanese-hub.pages.dev/` |
| Career Game | `apps/career-game/index.html` + `apps/career-game/src/` | `vite.career-game.config.ts` | `dist-career-game/` | `business-japanese-career-game` / `https://business-japanese-career-game.pages.dev/` |

- Root `pnpm build` 驗證 released Books、typecheck 全部 projects，並 build 兩個 frontend；`pnpm build:library` 與 `pnpm build:career-game` 也可獨立產生互不覆寫的 artifacts。
- `pnpm dev`／`pnpm preview` 繼續代表 Library；兩個產品另有明確的 product-specific dev／preview commands。
- Library 保持既有 root routes、Reader imports、deployment base 與 canonical Cloudflare `dist/` contract。Career Game app shell 不依賴 Library providers、Book／Reader／purchase／entitlement code；目前只共用平台的 semantic design tokens 與 narrow `@business-japanese-hub/platform-auth` identity package。完整 auth／origin／data-access boundary 見 [`shared-backend-and-identity.md`](shared-backend-and-identity.md)。
- 此 frontend split 沒有新增第二 backend。兩個產品仍使用同一 shared Supabase modular monolith boundary，但保有 product-specific frontend state 與 release cadence。
- #60 選擇兩個 root-hosted Cloudflare Pages projects。這保留既有 Library URL，讓兩個 static artifacts 各自 deploy／rollback，並避免為了 same-origin path symmetry 新增 gateway、proxy 或耦合 artifact。兩個 projects 可以由同一 checkout build，且各自不產生 top-level `404.html`，因此 Cloudflare 的 SPA fallback 可處理各自的 direct reload。
- `dist-career-game/` 的 production root 是 `/`。stable Case route 由 Career Game 自己解析；Library 只持有明確 cross-product link，不 import Game runtime/content model。分離 origins 依 browser security model 隔離 session storage；兩個產品仍使用相同 Supabase project 與 `auth.users.id` identity。

## 5. Delivery boundary

Paid Launch／first revenue 仍是 current revenue priority，既有 Book purchase golden path、free/public Library reading、legal/compliance 與 fail-closed contracts 不得弱化。Career Game Phase A 可以並行做 free validation，但不得延後或繞過 Paid Launch。

Career Game 的非 Book commerce 只被承認為未來可能性：等 #58 的 evidence 後由 #59 決策。#60 的 static frontend origin 決策不定義 generalized commerce schema、Career Game entitlement、額外 DB schema 或 payment-provider 行為。

## 6. Architecture non-goals

- 把 Career Game content 塞進 Book／Chapter／ContentBlock。
- 把 Library navigation、Reader 或 commerce flow 改寫成 game concepts。
- subscription-first、完整 LMS、native app 或 AI-first engine。
- 第二 backend、microservices 或橫跨所有產品的 generalized mega-schema。
