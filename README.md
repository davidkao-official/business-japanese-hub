# Business Japanese Hub

Business Japanese Hub 是一個 **web-first、subscription-based 的日本求職與日本職場日文學習服務**，核心服務已具備一定日文能力、特別是 **JLPT N2～N1 程度的華語學習者**。

產品要解決的 gap 是：

> **從「考試日文」升級到「能用日文在日本求職、讀懂日本商業資料、進入日本企業並持續工作成長」。**

Business Japanese Hub **不是 JLPT preparation service**。N2／N1 是主要 entry point，不是學習終點。

Canonical user journey：

```text
準備日本求職 → 通過選考 → 進入日本企業 → 適應日本職場 → 提升專業商務日文能力
```

主要付費產品是 **Business Japanese Hub Plus**：Early Access **NT$299／月**；當 SPI 題庫、Business Reading、Vocabulary 與 Learning System 更完整後，Standard direction 為 **NT$399／月**。年繳之後可採約 10 個月月費的方向（約 **NT$3,990／年**），但不是 Early Access blocker。

## 產品角色

- **SPI / Web Test Practice = Acquisition** — 把正在準備日本求職的人帶進來。
- **Business Reading = Engagement** — 以持續更新的日本商業內容建立回訪習慣。
- **Work in Japan = Retention** — 入社後仍可學會議、報連相、email/chat、企業資料、職場溝通與職種日文。
- **Learning System = Subscription Justification** — 錯題、收藏、Vocabulary、Progress、弱點／review 與下一步，讓產品從 Content Site 變成真正的 Subscription Product。

User-facing learning architecture 仍由 canonical learning map 定義：

```text
Learn | Read | Practice | My Learning | Experience
```

Book / Universal Reader 是 `Read` 的 long-form editorial capability；Career Game 是 `Experience` 的獨立 bounded runtime。它們不是整個產品唯二的 user-facing mental model。

## Canonical 文件

- **[`docs/product-contract.md`](docs/product-contract.md)** — 最高層產品／商業 authority：受眾、user journey、Business Japanese Hub Plus、pricing direction、四個 product roles、free/member 原則、durable invariants。
- **[`docs/post-n1-learning-map.md`](docs/post-n1-learning-map.md)** — canonical「N1 之後的日文學習地圖」：Learn／Read／Practice／My Learning／Experience、職場能力 domains、內容分類與 taxonomy drift 規則。
- **[`docs/platform-architecture.md`](docs/platform-architecture.md)** — Library/Reader、Career Game 與 shared platform 的 bounded contexts、dependency direction、frontend/deployment topology。
- **[`docs/shared-backend-and-identity.md`](docs/shared-backend-and-identity.md)** — Supabase identity、origin/session topology、client/server secret boundary 與 product data isolation。
- **[`docs/learning-and-progress.md`](docs/learning-and-progress.md)** — 現有 shared skill/evidence seam、Library reading／Career Game progress isolation、version/reset 與 RLS contract。
- **[`docs/content-model.md`](docs/content-model.md)** — `Book → Chapter → ContentBlock` 的 Library／long-form editorial content model；不是全平台 schema。
- **[`docs/ui-ux-research.md`](docs/ui-ux-research.md)** — **視覺、Japanese typography、design tokens、Reader/editorial quality 與 accessibility 的 durable research/implementation guidance**。其中 2026-08 研究留下的 Storefront-first、Book-as-commerce-unit、`subscription-first` non-goal 或禁止 Practice/Progress IA 等產品假設已被 `docs/product-contract.md` 與 `docs/post-n1-learning-map.md` supersede，**不得再作為 current product IA / commerce authority**。
- **[`docs/authoring.md`](docs/authoring.md)** — Book/editorial authoring、validation、preview、publish、version/rollback workflow。
- **[`docs/private-content-delivery.md`](docs/private-content-delivery.md)** — proprietary production content 的 private source、server-only import/delivery 與 disclosed legacy Book boundary。
- **[`docs/deployment.md`](docs/deployment.md)** — Cloudflare Pages、production Supabase、secrets、migration/functions、smoke、rollback 與 observability runbook。

## 技術方向

- **React + TypeScript + Vite**
- **pnpm**
- Web-first；mobile web 適合通勤練習／閱讀，desktop 適合 focused learning / reading / reference
- **Cloudflare Pages** 作為 frontend deployment
- **Supabase modular monolith** 作為 shared、server-authoritative auth / database / Edge Functions boundary
- One repository；不因 Learn／Read／Practice／My Learning／Experience taxonomy 自動拆 backend 或 microservices

## Frontend topology 與本機開發

目前保留既有增量式雙 frontend topology。這是 deployment/runtime boundary，不是產品 IA：

| Runtime / capability | Entry / source | Vite config | Build output |
| --- | --- | --- | --- |
| Library / Reader | `index.html`、`src/` | `vite.config.ts` | `dist/` |
| Career Game | `apps/career-game/index.html`、`apps/career-game/src/` | `vite.career-game.config.ts` | `dist-career-game/` |

常用指令：

| Command | 用途 |
| --- | --- |
| `pnpm dev` / `pnpm dev:library` | 啟動目前 Library/frontend dev server |
| `pnpm dev:career-game` | 獨立啟動 Career Game dev server |
| `pnpm preview` / `pnpm preview:library` | 預覽 Library build |
| `pnpm preview:career-game` | 預覽 Career Game build |
| `pnpm build:library` | build Library 至 `dist/` |
| `pnpm build:career-game` | build Career Game 至 `dist-career-game/` |
| `pnpm build:library:deploy` | 驗證並 build Cloudflare Pages Library artifact |
| `pnpm build:career-game:deploy` | 驗證並 build Cloudflare Pages Career Game artifact |
| `pnpm build` | 驗證 released Books、typecheck 全部 projects 並 build 兩個 frontends |

這個 topology 沒有新增第二 backend；兩個 artifacts 仍共用同一 Supabase modular monolith。未來 Learn／Practice／My Learning 可以在最小可維護範圍內加入既有 frontend 或形成新的 bounded presentation surface，但不得只為了產品 taxonomy 做大規模架構重寫。

## 關鍵決策摘要

- **Primary commercial model = Business Japanese Hub Plus recurring membership**，不是單本 Book purchase。
- **Early Access = NT$299／月**；**Standard direction = NT$399／月**，只有在產品成熟度經 explicit Product Owner decision 後才切換。
- Free 應提供真實 acquisition/value；Plus 的核心差異不只是「更多內容」，而是 persistent learning state + broader eligible learning access。
- Book 是 `Read` 的一種內容格式；`Book → Chapter → ContentBlock`、Universal Reader、released content 與 historical Book ownership 都保留。
- Career Game 是 `Experience` 的獨立 runtime，不強迫進入 Book／Learn schema。
- Payment architecture 保持 **provider-neutral**；membership access 必須 server-authoritative，既有 one-time ECPay／PayPal engineering 不等於 recurring-billing readiness。
- UI quality 是 **P0**；避免 generic SaaS/LMS、ebook marketplace 或 childish gamification。
- AI 不是 primary product abstraction，也不能產生 opaque mastery truth。
- Non-goals：native app current critical path、full LMS、leaderboard/streak economy、AI-chat-first、microservices、universal mega-schema、destructive migration。

## Current delivery direction

目前階段是 **subscription-product convergence / Plus Early Access preparation**。

舊的 `first paid Book sale` milestone 已 superseded。主要執行線為：

- SPI / Web Test Acquisition：#113–#117、#119–#120
- Product IA / visible skeleton：#108、#127
- Learning System / My Learning：#109
- Reusable Learn / Practice：#110
- Business Reading Engagement：#122 → #125
- Work in Japan Retention：#124 → #126
- Recurring membership commerce：#107
- Membership UX：#123
- Recurring legal/compliance：#112
- Membership Paid Launch：#111
- Deployment safety：#101/#102（獨立）
- Learning production readiness：#97（獨立）

## 部署

- **Canonical frontends**：Library/current main frontend 為 `https://business-japanese-hub.pages.dev/`；Career Game 為 `https://business-japanese-career-game.pages.dev/`。兩者是獨立 Cloudflare Pages projects；GitHub Pages 不是 deployment target。
- **Production build**：GitHub CI 的 `pnpm build` 驗證並 build 兩個 frontends；Cloudflare Pages 分別使用 `pnpm build:library:deploy` 與 `pnpm build:career-game:deploy`，上傳 `dist/` 與 `dist-career-game/`。
- **Cloudflare Pages Git integration**：production branch 使用 `main`；GitHub Actions `.github/workflows/ci.yml` 獨立負責 typecheck / lint / test / build quality gate。
- **SPA routing**：不要產生 GitHub Pages 式 top-level `404.html`；保持 Cloudflare Pages SPA fallback。
- **Frontend production variables**：兩個 Pages projects 使用 public `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 與需要時的 `VITE_EDGE_FUNCTIONS_BASE_URL`。Library 另設 `VITE_CAREER_GAME_ORIGIN`，Career Game 設 `VITE_LIBRARY_ORIGIN`。server-only secrets 絕不進 frontend。
- **Public/free mode**：缺少 production backend/payment configuration 時，public/free paths 可以存在，但 member/paid access 必須 fail closed；browser state 不能建立 membership。
- **Production smoke**：`pnpm smoke:deployment:production`，或分別執行 `pnpm smoke:deployment https://business-japanese-hub.pages.dev/ library` 與 `pnpm smoke:deployment https://business-japanese-career-game.pages.dev/ career-game`。

更多細節請見 [product contract](docs/product-contract.md) 與 [production deployment runbook](docs/deployment.md)。
