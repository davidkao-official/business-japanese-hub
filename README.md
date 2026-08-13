# Business Japanese Hub

Business Japanese Hub 是 premium、web-first 的數位出版與學習平台，服務**進階專業日語學習者**，橋接從 **JLPT N1 語言能力 → 真實日本職場能力** 的 gap。

產品以**一本一本獨立販售的 Book** 為核心商業單元，平台必須能承載任意 business-Japanese 主題的書（book-agnostic），並同時吸引日本的大學生與年輕職場人士。

## 文件

- **[`docs/product-contract.md`](docs/product-contract.md)** — durable product contract。產品定位、受眾、商業模型、平台 abstraction、P0 優先級、payment 決策、MVP non-goals 的 canonical source of truth。
- **[`docs/content-model.md`](docs/content-model.md)** — 內容資料模型。`Book → Chapter → Content Blocks` 的具體定義與結構（由並行工作產出）。
- **[`docs/ui-ux-research.md`](docs/ui-ux-research.md)** — UI/UX 設計方向研究（canonical）。`Quiet Editorial Modernism` 設計方向、日本文排版規格、design tokens、content-block rendering grammar、anti-patterns，以及 #5 Universal Reader 的 measurable baseline。

## 技術方向

- **React + TypeScript + Vite**
- **pnpm** 作為套件管理
- Web-first：行動網頁支援通勤閱讀，桌面支援專注閱讀與查閱

## 關鍵決策摘要

- UI / Reader quality 是 **P0**（核心產品需求，不是 post-MVP polish）。
- 抽象為 `Book → Chapter → Content Blocks`，不是 LMS 的 `Course → Module → Lesson`。
- Payment provider 決策為 **ECPay（綠界）**；本輪不實作付款。
- AI 不是 MVP 必要項，不得成為主要產品 abstraction。
- MVP non-goals：原生 app、subscription-first、AI chat/agent 為主體驗、完整 LMS、book-specific hard-coded components。

更多細節請見 [product contract](docs/product-contract.md)。
