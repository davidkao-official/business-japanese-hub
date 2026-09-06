# AGENTS.md — 給未來 implementation agents 的指引

本文件是本 repository 的 agent 快速入口與硬性規則。**在動任何 product / platform 程式碼之前，先讀完本文件與 [`docs/product-contract.md`](docs/product-contract.md)。**

## 專案身份

- Business Japanese Hub 是 **web-first、subscription-based 的日本求職與日本職場日文學習服務**。
- Primary audience：**已具備一定日文能力、特別是 JLPT N2～N1 程度，並希望在日本求職、讀懂日本商業資料或進入日本企業工作的華語學習者**。
- 核心 gap：從 **exam Japanese → Japan job-hunting / business reading / workplace Japanese**。
- Canonical user journey：`準備日本求職 → 通過選考 → 進入日本企業 → 適應日本職場 → 提升專業商務日文能力`。
- Business Japanese Hub **不是 JLPT prep service**；N2／N1 是 entry point，不是產品終點。

## Product invariants（摘要）

完整版以 `docs/product-contract.md` 為準。不可妥協的核心：

1. **Primary paid product = Business Japanese Hub Plus recurring membership**；不是單本 Book commerce。
2. **Approved pricing direction**：Early Access **NT$299／月**；產品成熟後 Standard direction **NT$399／月**；annual later 約 **NT$3,990／年**。NT$299→399 不得由 agent 自動依日期切換，必須有 explicit Product Owner decision。
3. **Four product roles**：SPI/Web Test = Acquisition；Business Reading = Engagement；Work in Japan = Retention；Learning System = Subscription Justification。
4. **User-facing learning architecture**：`Learn | Read | Practice | My Learning | Experience`；完整 taxonomy 以 `docs/post-n1-learning-map.md` 為準。
5. **Book / Reader boundary**：`Book → Chapter → ContentBlock` 仍是 Read / long-form editorial 的 durable model，但 Book 是內容格式，不是 primary commerce unit。
6. **Career Game boundary**：scenario/case → scene → choice/action → outcome/consequence → explanation/feedback → progression；它是 `Experience` 的獨立 bounded runtime，不塞進 Book/Learn schema。
7. **Learning System**：錯題、收藏、Vocabulary、Progress、review、weak-area signals、next step 必須 deterministic / explainable；不要做 fake mastery、opaque AI diagnosis 或 universal LMS event mega-schema。
8. **Shared backend**：預設 one repository + one shared Supabase modular monolith；不得因新增 learning mode 自動建第二 backend／microservices。
9. **Membership/payment access server-authoritative**：browser/client 永遠不能 mint paid access；payment provider mechanics 保持 provider-neutral。
10. **UI quality 是 P0**：premium、成熟、可信；避免 generic SaaS/LMS、ebook marketplace、childish gamification。
11. **AI 不是 primary product abstraction**；不得以 AI chat 或 opaque score 取代內容、practice 與 learning state。

## Product funnel authority

以下是 business role，不是第二套 curriculum taxonomy：

- **SPI / Web Test Practice = Acquisition**：優先降低第一次使用阻力並承接日本求職 intent；可有 bounded free sample。
- **Business Reading = Engagement**：持續更新的日本商業內容、企業／IR／產業／政府資料閱讀與 vocabulary / logic support。
- **Work in Japan = Retention**：入社後的報連相、meeting、email/chat、documents、workplace pragmatics、企業資料、職種日文。
- **Learning System = Subscription Justification**：Plus 必須讓系統持續理解 user learning state，而不只是解鎖更多文章。

新增 issue / UX / feature 時，應能說明它服務 user journey 的哪個 stage、learning mode 與 business role；如果無法說明，不要為了清 backlog 擴 scope。

## 關鍵程式碼位置

- **Library / long-form content model**：`src/content/` — `Book → Chapter → ContentBlock`；不是全平台 schema。
- **Design tokens**：`src/styles/tokens.css` — 色彩、排版、間距、陰影等集中於此；不要散落可重複 magic values。
- **Current main web app**：`src/` — React + TypeScript + Vite。
- **Career Game app**：`apps/career-game/` — 獨立 Experience frontend/runtime。

> 不要從本文件推導新的 monorepo folders、frontend split 或 DB schema。先看 live repository 與 `docs/platform-architecture.md`。

## 未來 agents 必須遵守的規則

- 修改 product positioning / pricing / free-vs-member / learning IA 前，先讀 `docs/product-contract.md`；implementation issue 不得擅自覆蓋 product authority。
- 修改 cross-product architecture 前先讀 `docs/platform-architecture.md`；shared contract 必須 narrow、consumer-driven，不得建立 universal content mega-schema。
- 新增／分類 Learn／Read／Practice／My Learning／Experience、Reading、SPI/Web Test、Career Game learning tags 前先讀 `docs/post-n1-learning-map.md`。
- Library **不得新增單一本書特有的 schema、component、route 或 hard-coded content**；新 Book 應靠 metadata/content pipeline 上架。
- Career Game 不得依賴 Book／Chapter／ContentBlock；Library 也不得依賴 scenario／scene／choice／outcome／progression。
- Learn／Practice 可抽 reusable surface，但不要一課一 runtime，也不要預先建立 full LMS framework。
- My Learning 必須只顯示真實 evidence；沒有足夠資料時顯示 truthful empty/insufficient-data state，不要製造 mastery%、AI weakness、streak 或 percentile。
- Free/public paths 可以存在並承擔 acquisition；不要因為 subscription pivot 就把每一頁都 login/paywall-only。
- Historical one-time Book Orders／Payments／Refunds／Entitlements 必須保持可稽核，不 destructive-convert 成 subscription records。
- Payment implementation 仍需尊重 `docs/payments/decision-record.md` 的 provider-neutral、安全、server-authoritative invariants；但其中 one-time Book business assumptions 如果和 `docs/product-contract.md` 衝突，僅視為 historical implementation context。Recurring membership lifecycle 以 #107 為 current execution contract。
- Provider-specific mechanics 不得污染 product domain；所有 payment `/api/*` endpoints 保持 server-only execution boundary（Supabase Edge Functions）。client 永不可提供可信 amount/currency/success/access state。
- **Canonical current main frontend origin**：`https://business-japanese-hub.pages.dev/`。GitHub Pages 不是 deployment target，也不得重新引入其 project-path build／top-level `404.html` artifact。
- **Canonical Career Game origin**：`https://business-japanese-career-game.pages.dev/`。兩個 SPA artifacts 可獨立 deploy／rollback；不得只為 URL symmetry 新增 custom gateway/path multiplexing。
- Library 的 `PUBLIC_SITE_URL`／payment CORS 只指向 current main origin；Career Game 只使用 dedicated `CAREER_GAME_SITE_URL`。不要因 shared account 放寬 payment CORS 或自己發明 cross-domain SSO。
- Supabase service role、payment secrets、webhook secrets、merchant credentials 永不進 client/repo。
- 與 canonical product/security/deployment contract 衝突的實作方向應先停止，回到 issue / Product Owner 決策，不要「照舊 code path」把舊 single-Book 模型重新變成產品 authority。

## 當前階段：Plus Early Access preparation

目前不是舊的 `Paid Launch / first paid Book sale` 階段。

Current goal：

> **把 Business Japanese Hub 從 ebook-store mental model 收斂成可持續訂閱的 Business Japanese Hub Plus learning service。**

主要 P0 線：

- **Canonical product convergence**：#105 + 本次 canonical docs。
- **Acquisition / SPI**：#113–#117、#119–#120。
- **Product IA**：#108。
- **Learning System / My Learning**：#109；Plus launch 不得把它降成「nice to have」。
- **Reusable Learn / Practice**：#110。
- **Recurring commerce / access**：#107。
- **Recurring legal/compliance**：#112。
- **Membership Paid Launch**：#111；必須證明 recurring lifecycle + authoritative access + 真實 learning value，而不只是可以扣款。
- **Deployment safety**：#101/#102，可獨立執行。
- **Learning production readiness**：#97，可獨立執行。

另外兩條 product lanes 必須持續建立 backlog：

- **Business Reading = Engagement**。
- **Work in Japan = Retention**。

舊 #45 first-Book-revenue、#59 generalized one-time commerce、#52「Library + Career Game 是整個產品」等 commercial assumptions 已 superseded。保留歷史與 reusable engineering，但不得再當 current delivery priority。

### Plus launch gate

不要把「recurring billing works」等同「subscription product ready」。Early Access 至少需要：

- 清楚的 Plus value proposition / approved price；
- 至少一條真實 acquisition → learning/practice → saved/progress/review → return path；
- 足以讓 N2～N1 華語學習者理解並使用的 content/practice；
- Learning System 有真實 persistent state，不是假 dashboard；
- recurring membership lifecycle / cancellation / failed renewal / access contract 正確；
- legal、merchant/KYC、email、deployment external gates 明確或已完成。

## 文件地圖

- `README.md` — 專案入口。
- `docs/product-contract.md` — **highest product/commercial authority**。
- `docs/post-n1-learning-map.md` — curriculum/content taxonomy authority。
- `docs/platform-architecture.md` — technical bounded contexts、shared platform、frontend/deployment topology。
- `docs/shared-backend-and-identity.md` — shared Supabase identity、origin/session、browser/server secret boundary。
- `docs/learning-and-progress.md` — 目前 Library／Career Game 的 bounded learning evidence implementation contract。
- `docs/product-validation-analytics.md` — bounded analytics vocabulary / privacy / trust boundary。
- `docs/content-model.md` — Library / long-form editorial `Book → Chapter → ContentBlock` model。
- `docs/payments/decision-record.md` — provider-neutral one-time payment implementation history與仍有效的 payment safety invariants；recurring membership另以 #107 收斂。
- `docs/accounts-and-entitlement.md` — historical accounts / Book ownership / reading-state persistence contract；不得把其 Book ownership當成新的 Plus model。
- `docs/legal-tax-launch-brief.md` — legal / tax / entity research；真實 launch 仍需依 recurring model重新確認相關要求。
- `docs/deployment.md` — Cloudflare Pages + production Supabase activation / rollback / smoke runbook。

## 本機 DB 驗證安全入口

- DB validation 一律使用 `pnpm validate:db`，先讀 [`docs/db-validation.md`](docs/db-validation.md)。此入口只建立本次專屬 disposable daemon；不接受既有 project／container／volume 作為目標。
- 不可使用 raw `supabase db start/reset/stop`、remote／linked reset 或修改 port／project ID 作為防護失敗的替代方案。不得沿用、重標籤或清理其他 worktree／worker 的資源。
- #98 事故原受影響 stack 保持原狀；禁止 reset、重啟、停止、刪除、prune、restore 或 recovery 嘗試。原資料損失及可恢復性沒有證據即為 UNKNOWN；任何原資料操作須由 owner 另行決定。
