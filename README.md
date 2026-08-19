# Business Japanese Hub

Business Japanese Hub 是 premium、web-first 的數位出版與學習平台，服務**進階專業日語學習者**，橋接從 **JLPT N1 語言能力 → 真實日本職場能力** 的 gap。

產品以**一本一本獨立販售的 Book** 為核心商業單元，平台必須能承載任意 business-Japanese 主題的書（book-agnostic），並同時吸引日本的大學生與年輕職場人士。

## 文件

- **[`docs/product-contract.md`](docs/product-contract.md)** — durable product contract。產品定位、受眾、商業模型、平台 abstraction、P0 優先級、payment 決策、MVP non-goals 的 canonical source of truth。
- **[`docs/content-model.md`](docs/content-model.md)** — 內容資料模型。`Book → Chapter → Content Blocks` 的具體定義與結構（由並行工作產出）。
- **[`docs/ui-ux-research.md`](docs/ui-ux-research.md)** — UI/UX 設計方向研究（canonical）。`Quiet Editorial Modernism` 設計方向、日本文排版規格、design tokens、content-block rendering grammar、anti-patterns，以及 #5 Universal Reader 的 measurable baseline。
- **[`docs/authoring.md`](docs/authoring.md)** — 作者出版工作流（issue #10）。作者（非工程師）如何新增／編輯書籍、驗證、預覽、出版、版本／回滾，以及 #5 Universal Reader 的整合介面。
- **[`books/`](books/README.md)** — 作者內容目錄（`books/<slug>/book.json` + `manifest.json` + `assets/`）。

## 技術方向

- **React + TypeScript + Vite**
- **pnpm** 作為套件管理
- Web-first：行動網頁支援通勤閱讀，桌面支援專注閱讀與查閱

## 關鍵決策摘要

- **Prototype MVP 已完成**；當前目標是 **Paid Launch／最快安全的第一筆真實營收**。保留陌生訪客免登入閱讀 free/public books 的正式能力，同時完成最小可上線的 paid Book、authoritative pricing、payment／entitlement、compliance 與 production deployment（見 [product contract §15](docs/product-contract.md#15-產品階段paid-launchprototype-mvp-已完成)）。
- 第一個商業 Book 是 **《会議の日本語》**：USD 12，第 1 章免費預覽，其餘章節由 server-authoritative entitlement 保護；兩本 Prototype books 保持免費公開。
- UI / Reader quality 是 **P0**（核心產品需求，不是 post-MVP polish）。
- 抽象為 `Book → Chapter → Content Blocks`，不是 LMS 的 `Course → Module → Lesson`。
- Payment architecture 為 **provider-neutral**；**ECPay（綠界）是第一支 TWD adapter**（見 [payment decision record](docs/payments/decision-record.md)）。
- AI 不是 MVP 必要項，不得成為主要產品 abstraction。
- MVP non-goals：原生 app、subscription-first、AI chat/agent 為主體驗、完整 LMS、book-specific hard-coded components。

## 部署

- **Production build**：`pnpm build` → 輸出 `dist/`（`vite.config.ts` 使用絕對 base `/`）。
- **靜態 host 要求**：`BrowserRouter` 使用 root base，host 必須把未匹配的 route 都 serve `index.html`（SPA fallback），否則 nested route（如 `/books/:slug`）直接載入或重整會 404。
- **CI**：`.github/workflows/ci.yml` 在每次 push 到 `main` 與每個 PR 執行 typecheck / lint / test / build。目前沒有自動部署，build 產物由 host 部署。
- **Public catalog 模式**：未設定 Supabase 環境變數時，平台只提供 free/public books 的匿名閱讀（Storefront → Book Detail → Universal Reader），paid purchase fail closed。Paid Launch production 必須設定 Supabase 與 server-only payment/compliance integrations，才會啟用 account／persistence／purchase 功能。

更多細節請見 [product contract](docs/product-contract.md)。
