# AGENTS.md — 給未來 implementation agents 的指引

本文件是給在本 repository 工作的 agents 的快速入口與硬性規則。**在動任何 platform 程式碼之前，先讀完本文件與 [docs/product-contract.md](docs/product-contract.md)。**

## 專案身份

- Business Japanese Hub：premium、web-first 的數位出版與學習平台，對象為進階專業日語學習者。
- 核心 gap：從 **JLPT N1 語言能力 → 真實日本職場能力** 的橋接。
- 必須同時吸引**日本的大學生與年輕職場人士**購買同一本書。

## Product invariants（摘要）

完整版以 `docs/product-contract.md` 為準，這裡是不可妥協的核心：

1. **Book-based commerce**：商業單元是一本一本獨立販售的 **Book**，不是 course / lesson pack / subscription。
2. **Abstraction 是 `Book → Chapter → Content Blocks`**，不是 LMS 的 `Course → Module → Lesson`。
3. **Book-agnostic platform**：平台不得依賴任何一本書的主題；不得有 first-book 特有的 schema / component / route。
4. **UI / Reader quality 是 P0**：核心產品需求，不是 post-MVP polish。
5. **Web-first**：行動網頁支援通勤閱讀，桌面支援專注閱讀與查閱；不做原生 app。
6. **Payment architecture 是 provider-neutral**；ECPay（綠界）是第一支 TWD adapter；paid ownership 只能由 verified authoritative server event 驅動（見 `docs/payments/decision-record.md`）。
7. **AI 不是 MVP 必要項**，不得成為主要產品 abstraction。
8. MVP non-goals：原生 app、subscription-first、AI chat/agent 為主體驗、完整 LMS（證書 / cohorts / live classes / 社群）、book-specific hard-coded reader components。

## 關鍵程式碼位置

- **Content model**：`src/content/` — `Book → Chapter → Content Blocks` 的資料模型與相關工具。
- **Design tokens**：`src/styles/tokens.css` — 設計 token（色彩、排版、間距、陰影等）集中在此，UI 樣式一律引用 tokens，不散落 magic values。
- **Web app**：`src/` — React + TypeScript + Vite 的應用主體。

> 若這些路徑在你接手時尚未存在，代表 platform 尚未建置；請依 contract 與 content model 建立，而不是另起架構。

## 未來 agents 必須遵守的規則

- **不得新增 first-book 特有的 schema、component、route 或 hard-coded content。** 任何新書必須能只靠「提供新 book 的 metadata 與內容」上架，不需改平台程式碼。
- 資料模型與 UI 一律依 **`Book → Chapter → Content Blocks`** 抽象，不要引入 Course / Module / Lesson 概念。
- **UI / Reader quality 是 P0**：不要以「功能先、介面後」的心態貶低 UI/reader 品質；它與功能正確性同等重要。
- 平台與書的責任分界：platform 負責 rendering、navigation、access、purchase state、library、reading state、search、responsive、accessibility；書負責其 metadata（title / cover / author / chapters / content / examples-exercises / audience / difficulty / price）。平台不得 embed 書的內容細節。
- 保持 web-first：不以原生 app 或 mobile-first-only 為主，兼顧行動通勤閱讀與桌面專注閱讀。
- 不要引入 subscription-first 商業模式，不要以 AI 作為主要產品 abstraction，不為 MVP non-goals（見 product contract §13）投入實作。
- Payment implementation（#9）以 `docs/payments/decision-record.md` 為唯一 contract；payment architecture 為 provider-neutral，ECPay（綠界）只是第一支 TWD adapter。Provider-specific mechanics 不得污染 Book / Reader / Library / Entitlement architecture；paid ownership 只能由 verified authoritative server event 驅動。所有 payment `/api/*` endpoints 都必須在 server-only execution boundary 執行（Supabase Edge Functions，見 decision-record §3.5）；client 永不可提供可信 amount/currency，server 以 authoritative catalog price seam 取價（見 §8.3）。
- 與 `docs/product-contract.md` 衝突的實作方向應被視為錯誤，先釐清再動手。

## 文件地圖

- `README.md` — 專案入口。
- `docs/product-contract.md` — durable product contract（canonical）。
- `docs/content-model.md` — 內容資料模型（`Book → Chapter → Content Blocks` 的具體定義）。
- `docs/payments/decision-record.md` — canonical payment decision record（provider-neutral payment architecture 的唯一規範來源；6 頁初版研究已 SUPERSEDED，見 `docs/payments/research-v1-superseded.md`）。
- `docs/accounts-and-entitlement.md` — accounts / ownership / reading-state persistence 契約。
- `docs/legal-tax-launch-brief.md` — legal / tax / entity structure launch brief（#11 研究成果；MVP 結構建議、A–G 比較、金流、launch compliance checklist、對 #9/#20/#21 的影響）。
