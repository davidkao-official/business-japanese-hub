# AGENTS.md — 給未來 implementation agents 的指引

本文件是給在本 repository 工作的 agents 的快速入口與硬性規則。**在動任何 platform 程式碼之前，先讀完本文件與 [docs/product-contract.md](docs/product-contract.md)。**

## 專案身份

- Business Japanese Hub：一個 shared、web-first 的 business-Japanese 平台，對象為進階專業日語學習者。
- 核心 gap：從 **JLPT N1 語言能力 → 真實日本職場能力** 的橋接。
- 兩個 first-class frontend products：**Library**（premium digital publishing／Reader）與 **Career Game**（story-driven workplace simulator）。
- Library 的書籍必須同時吸引**日本的大學生與年輕職場人士**購買同一本書。

## Product invariants（摘要）

完整版以 `docs/product-contract.md` 為準，這裡是不可妥協的核心：

1. **Bounded contexts**：Library 與 Career Game 共用平台能力，但保有各自的 content model、UI/navigation、state 與 release cadence；詳見 `docs/platform-architecture.md`。
2. **Library abstraction**：`Book → Chapter → ContentBlock`；current commerce 是獨立販售單本 Book，不是 course / lesson pack / subscription。
3. **Career Game boundary**：scenario/case → scene → choice/action → outcome/consequence → explanation/feedback → progression；不要預先鎖死最終 type names，也不要塞進 Book model。
4. **UI quality 是 P0**：Library Reader 保持 premium editorial surface；Career Game 可採 distinct case-file／narrative grammar。
5. **Web-first**：兼顧行動與桌面；不做原生 app。
6. **Shared backend**：預設 one repository + one shared Supabase modular monolith；不另建 backend／microservices。
7. **Payment architecture 是 provider-neutral**；paid ownership 只能由 verified authoritative server event 驅動（見 `docs/payments/decision-record.md`）。
8. **AI 不是 first-slice engine**；不做 subscription-first、完整 LMS、native app 或 generalized mega-schema。

## 關鍵程式碼位置

- **Library content model**：`src/content/` — `Book → Chapter → ContentBlock` 的資料模型與相關工具；不是 Career Game schema。
- **Design tokens**：`src/styles/tokens.css` — 設計 token（色彩、排版、間距、陰影等）集中在此，UI 樣式一律引用 tokens，不散落 magic values。
- **Web app**：`src/` — React + TypeScript + Vite 的應用主體。

> 不要從本文件推導新的 monorepo folders 或 DB schema。Career Game production hostname 已由 #60 定案，見下方 deployment contract。

## 未來 agents 必須遵守的規則

- 修改 cross-product architecture 前先讀 `docs/platform-architecture.md`；shared contract 必須 narrow、consumer-driven，不得建立 universal content mega-schema。
- 新增或分類 Learn／Read／Practice／My Learning／Experience、課程模組、Reading、SPI/Web Test、Career Game learning tags 前先讀 `docs/post-n1-learning-map.md`。該文件是 curriculum/content taxonomy authority，但不得被誤用成新的 shared runtime schema。
- Library **不得新增 first-book 特有的 schema、component、route 或 hard-coded content**；新書應只靠 metadata 與內容上架。
- Career Game 不得依賴 Book／Chapter／ContentBlock；Library 也不得依賴 scenario／scene／choice／outcome／progression。
- Library 平台與書的責任分界：platform 負責 rendering、navigation、access、purchase state、library、reading state、search、responsive、accessibility；書負責 metadata 與內容。
- **UI quality 是 P0**：功能正確性、Library Reader quality 與 Career Game narrative UX 同等重要。
- 保持 web-first：不以原生 app 或 mobile-first-only 為主，兼顧行動通勤閱讀與桌面專注閱讀。
- 不要引入 subscription-first 商業模式，不要以 AI 作為主要產品 abstraction，不為 MVP non-goals（見 product contract §13）投入實作。
- Payment implementation（#9）以 `docs/payments/decision-record.md` 為唯一 contract；payment architecture 為 provider-neutral，ECPay（綠界）只是第一支 TWD adapter。Provider-specific mechanics 不得污染 Book / Reader / Library / Entitlement architecture；paid ownership 只能由 verified authoritative server event 驅動。所有 payment `/api/*` endpoints 都必須在 server-only execution boundary 執行（Supabase Edge Functions，見 decision-record §3.5）；client 永不可提供可信 amount/currency，server 以 authoritative catalog price seam 取價（見 §8.3）。
- **Canonical Library／Paid Launch production frontend 是 Cloudflare Pages**：`https://business-japanese-hub.pages.dev/`。GitHub Pages 不是 deployment target，也不得重新引入其 project-path build、`404.html` artifact 或 deployment workflow，除非先有新的明確 deployment 決策。
- **Canonical Career Game production frontend 也是獨立 Cloudflare Pages project**：`https://business-japanese-career-game.pages.dev/`。兩個 root-hosted SPA artifacts 可獨立 deploy／rollback；不得用 custom gateway 或 path multiplexing 把它們重新綁在一起。
- Library 的 `PUBLIC_SITE_URL`／payment CORS 保持只指向 Library origin；Career Game 只使用 dedicated `CAREER_GAME_SITE_URL`。分離 origins 不共享 browser session，使用者以同一個 Supabase account 在 Career Game 重新登入；不得為此新增 cross-domain SSO 或放寬 payment CORS。
- 與 `docs/product-contract.md` 衝突的實作方向應被視為錯誤，先釐清再動手。

## 當前階段：Paid Launch／first revenue

- **Prototype MVP 已完成**：陌生訪客可在手機與桌面免登入閱讀 free/public books，既有 public reading path 必須持續可用。
- 立即目標是 **Paid Launch／最快安全的第一筆真實營收**（見 `docs/product-contract.md` §15 與 #45）。優先完成最小可合法、安全上線的 Book／currency／provider 組合；不等待所有未來 provider。
- 第一個付費 Book 必須是真實、可販售的內容，不得只把 prototype flag 翻成 paid；catalog 價格、checkout、payment、entitlement、receipt 與 refund/reconciliation 必須維持 server-authoritative 與 fail-closed。
- #20 JPY 在 seller／merchant entity 與 provider eligibility 有真實證據前不阻塞第一筆營收。不得猜測 merchant eligibility、seller identity、tax status、credentials、專業法律核准或外部 account state。
- Free/public access 仍必須以 generic catalog/access 語意表達（例如 `Price.tier: 'free'`），**不得 hard-code book slug**，也不得讓 paid books 意外公開。
- **既有 payment / entitlement / legal architecture 不得刪除、繞過或弱化**；Paid Launch 必須沿用它們完成 production golden path。
- Cloudflare Pages frontend 已選定；Paid Launch 的 deployment 主線是把 production Supabase / Auth / Edge Functions / payment / email / legal gates 接到 canonical Cloudflare origin，而不是再建第二套 frontend hosting。
- UI / Reader quality 維持 P0，遵循 `docs/ui-ux-research.md`。
- Career Game Phase A free validation 可並行，但不得弱化或延後上述 golden path。非 Book commerce 等 #58 evidence 後由 #59 決策；現在不得先做 generalized commerce schema。

## 文件地圖

- `README.md` — 專案入口。
- `docs/product-contract.md` — durable product contract（canonical）。
- `docs/platform-architecture.md` — Library + Career Game bounded contexts、shared platform 與 dependency direction。
- `docs/shared-backend-and-identity.md` — shared Supabase identity、origin/session topology、browser/server secret boundary 與 data-access isolation。
- `docs/learning-and-progress.md` — Library／Career Game 的 bounded shared skill/evidence seam、authenticated Game resume、version/reset 與 RLS contract。
- `docs/post-n1-learning-map.md` — canonical curriculum / content taxonomy；定義 N1 之後學習地圖、learning modes、capability domains、cross-cutting dimensions、ticket naming 與 taxonomy drift guardrails。
- `docs/product-validation-analytics.md` — #60 的 bounded analytics event vocabulary、privacy 與 non-authoritative trust boundary。
- `docs/content-model.md` — Library 內容資料模型（`Book → Chapter → ContentBlock` 的具體定義；不是 Career Game schema）。
- `docs/payments/decision-record.md` — canonical payment decision record（provider-neutral payment architecture 的唯一規範來源；6 頁初版研究已 SUPERSEDED，見 `docs/payments/research-v1-superseded.md`）。
- `docs/accounts-and-entitlement.md` — accounts / ownership / reading-state persistence 契約。
- `docs/legal-tax-launch-brief.md` — legal / tax / entity structure launch brief（#11 研究成果；MVP 結構建議、A–G 比較、金流、launch compliance checklist、對 #9/#20/#21 的影響）。
- `docs/deployment.md` — Cloudflare Pages frontend + production Supabase activation / rollback / smoke runbook。
