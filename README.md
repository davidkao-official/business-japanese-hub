# Business Japanese Hub

Business Japanese Hub 是 shared、web-first 的 business-Japanese 平台，服務**進階專業日語學習者**，橋接從 **JLPT N1 語言能力 → 真實日本職場能力** 的 gap。

平台包含兩個 first-class frontend products：**Library** 提供 premium digital publishing／Reader 與單本 Book commerce；**Career Game** 提供 story-driven workplace simulation。兩者共用 repository、Supabase/backend 與必要的 identity／operations primitives，但保有各自的內容模型、UI/navigation、state 與 release cadence。

## 文件

- **[`docs/product-contract.md`](docs/product-contract.md)** — durable product contract。產品定位、受眾、商業模型、平台 abstraction、P0 優先級、payment 決策、MVP non-goals 的 canonical source of truth。
- **[`docs/platform-architecture.md`](docs/platform-architecture.md)** — Library + Career Game bounded contexts、shared platform 邊界與 dependency direction。
- **[`docs/content-model.md`](docs/content-model.md)** — Library 內容資料模型。`Book → Chapter → ContentBlock` 的具體定義與結構；不是 Career Game schema。
- **[`docs/ui-ux-research.md`](docs/ui-ux-research.md)** — UI/UX 設計方向研究（canonical）。`Quiet Editorial Modernism` 設計方向、日本文排版規格、design tokens、content-block rendering grammar、anti-patterns，以及 Universal Reader 的 measurable baseline。
- **[`docs/authoring.md`](docs/authoring.md)** — 作者出版工作流。作者（非工程師）如何新增／編輯書籍、驗證、預覽、出版、版本／回滾。
- **[`books/`](books/README.md)** — 作者內容目錄（`books/<slug>/book.json` + `manifest.json` + `assets/`）。
- **[`docs/deployment.md`](docs/deployment.md)** — Cloudflare Pages frontend、production Supabase、secrets、migration/functions、smoke、rollback 與 observability runbook。

## 技術方向

- **React + TypeScript + Vite**
- **pnpm** 作為套件管理
- Web-first：行動網頁支援通勤閱讀，桌面支援專注閱讀與查閱
- **Cloudflare Pages** 作為 canonical Library／Paid Launch production frontend
- **Supabase modular monolith** 作為 shared、server-authoritative auth / database / Edge Functions boundary

## Frontend topology 與本機開發

目前採增量式的雙 frontend topology，保留既有 Library production path，同時讓 Career Game 可獨立啟動與 build：

| Product | Entry / source | Vite config | Build output |
| --- | --- | --- | --- |
| Library | `index.html`、`src/` | `vite.config.ts` | `dist/` |
| Career Game | `apps/career-game/index.html`、`apps/career-game/src/` | `vite.career-game.config.ts` | `dist-career-game/` |

從 repository root 執行一次 `pnpm install` 即可安裝兩個 frontend 所需的 pinned toolchain。常用指令：

| Command | 用途 |
| --- | --- |
| `pnpm dev` / `pnpm dev:library` | 啟動 Library dev server |
| `pnpm dev:career-game` | 獨立啟動 Career Game dev server |
| `pnpm preview` / `pnpm preview:library` | 預覽 Library build |
| `pnpm preview:career-game` | 預覽 Career Game build |
| `pnpm build:library` | 只 build Library 至 `dist/` |
| `pnpm build:career-game` | 只 build Career Game 至 `dist-career-game/` |
| `pnpm build` | 驗證 released Books、typecheck 全部 projects，依序 build 兩個 frontends |

這個 topology 沒有新增第二 backend；兩個產品仍共用既有 Supabase modular monolith。Career Game production hostname／routing 由 #60 決定，目前的 `dist-career-game/` 不代表 production deployment target。

## 關鍵決策摘要

- **Prototype MVP 已完成**；當前目標是 **Paid Launch／最快安全的第一筆真實營收**。保留陌生訪客免登入閱讀 free/public books 的正式能力，同時完成最小可上線的 paid Book、authoritative pricing、payment／entitlement、compliance 與 production activation（見 [product contract §15](docs/product-contract.md#15-產品階段paid-launchprototype-mvp-已完成)）。
- 第一個商業 Book 是 **《会議の日本語》**：USD 12，第 1 章免費預覽，其餘章節由 server-authoritative entitlement 保護；兩本 Prototype books 保持免費公開。
- Career Game Phase A free validation 可並行，但不得弱化或延後 Book purchase golden path；未來非 Book commerce 等 #58 evidence 後由 #59 決策。
- UI quality 是 **P0**：Library Reader 維持 premium editorial surface，Career Game 可採 distinct case-file／narrative grammar。
- Library 抽象為 `Book → Chapter → ContentBlock`；Career Game 使用自己的 scenario／scene／choice／outcome／feedback／progression bounded context，兩者不互相套用。
- Payment architecture 為 **provider-neutral**；**ECPay（綠界）是第一支 TWD adapter**，PayPal/USD 已實作；JPY adapter 不阻塞第一筆營收（見 [payment decision record](docs/payments/decision-record.md)）。
- AI 不是 first-slice engine，不得成為主要產品 abstraction。
- Non-goals：原生 app、subscription-first、AI chat/agent 為主體驗、完整 LMS、microservices、generalized mega-schema、book-specific hard-coded components。

## 部署

- **Canonical Library／Paid Launch frontend**：`https://business-japanese-hub.pages.dev/`（Cloudflare Pages）。GitHub Pages 不是 deployment target；Career Game production hostname 尚未決定。
- **Production build**：`pnpm build` 會驗證並 build 兩個 frontends；Cloudflare Pages 仍只上傳 canonical Library artifact `dist/`。Career Game 的 `dist-career-game/` 是獨立、非 production-routing 的 build artifact。Cloudflare Pages 使用 origin root `/`，因此 Library production 不設定 `DEPLOY_BASE_PATH`。
- **Cloudflare Pages Git integration**：production branch 使用 `main`；每次 production branch 更新由 Cloudflare 重新 build/deploy。GitHub Actions `.github/workflows/ci.yml` 獨立負責 typecheck / lint / test / build quality gate。
- **SPA routing**：不要產生 GitHub Pages 式的頂層 `404.html`。Cloudflare Pages 在沒有頂層 `404.html` 時會把未命中 static asset 的路徑交給 SPA root，讓 `BrowserRouter` deep links 可直接載入。
- **Frontend production variables**：Cloudflare Pages environment 設定 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`，以及需要時的 `VITE_EDGE_FUNCTIONS_BASE_URL`。後端 `PUBLIC_SITE_URL` 必須與 canonical frontend origin 一致：`https://business-japanese-hub.pages.dev/`。
- **Public catalog 模式**：未設定 Supabase 環境變數時，平台只提供 free/public books 的匿名閱讀；paid purchase fail closed。Paid Launch production 必須設定 Supabase 與 server-only payment/compliance integrations，才會啟用 account／persistence／purchase 功能。
- **Production smoke**：`pnpm exec tsx scripts/smoke-deployment.ts https://business-japanese-hub.pages.dev/`。

更多細節請見 [product contract](docs/product-contract.md) 與 [production deployment runbook](docs/deployment.md)。
