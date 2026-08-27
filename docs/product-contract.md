# Product Contract — Business Japanese Hub

> **狀態：** durable（長期有效）的產品契約，是產品層面的 canonical source of truth。
> 本文件的地位高於任何單一 issue / ticket / 實作 detail；與任何任務描述衝突時，以本契約為準。
> 變更本契約前，必須先有明確的產品層決策依據，不得僅因某次實作便利而修改。

## 1. 產品定義

Business Japanese Hub 是一個 **shared、premium、web-first 的 business-Japanese 平台**，服務對象是**進階專業日語學習者**。

- 平台包含兩個 first-class frontend products：
  - **Library**：premium digital publishing／Reader，以一本一本獨立販售的 **Book** 為 current 商業單元。
  - **Career Game**：story-driven workplace simulator，以工作情境的選擇、後果、回饋與 progression 建立真實職場能力。
- 兩個產品共享必要的平台能力，但各自保有內容模型、UI/navigation、state 與 release cadence；bounded-context contract 見 `docs/platform-architecture.md`。
- 使用者體驗必須具有 premium 日系 knowledge 產品的品質，**不是** generic LMS，也**不是**「外國人教科書」網站。Library 維持 editorial Reader grammar；Career Game 可採 distinct case-file／narrative grammar。

## 2. 核心問題陳述（gap）

平台要橋接的關鍵 gap 是：

> **從 JLPT N1 語言能力 → 真實日本職場能力。**

也就是說：使用者在考過 N1、具備高階語言能力之後，仍然缺少「在日本職場實際運用這套語言」的能力與產品。這是平台存在的理由。

## 3. 目標受眾

- **主要受眾：** 進階專業日語學習者（語言能力已接近或達到 JLPT N1）。
- **必須同時吸引：** **日本的大學生與年輕職場人士**；內容與產品呈現不能預設使用者是「外國人」。
- Library 的同一本 Book 必須對上述兩類讀者都有付費價值；Career Game 的同一 workplace experience 也必須對兩類使用者成立，不得把任一類當成次要對象。

## 4. 商業模型：Book-based commerce

- **Library 與 current Paid Launch 的商業單元是一本一本獨立販售的 Book**，不是 course / lesson pack / subscription。
- Library 不得以 subscription-first 或 bundling 為主要商業模式；current 購買粒度是單本 Book。
- Career Game Phase A 是 free validation。未來非 Book commerce 只被承認為待決問題：必須先有 #58 evidence，再由 #59 定義；本契約現在不指定 generalized commerce schema 或把 Book pricing/entitlement 強套到 Career Game。

## 5. 平台 abstraction

- 平台有兩個 bounded content abstractions，不存在一個強迫所有產品共用的 universal content schema：
  - **Library：** `Book → Chapter → ContentBlock`；明確不是 LMS 的 `Course → Module → Lesson`。
  - **Career Game：** generic scenario／case → scene → choice／action → outcome／consequence → explanation／feedback → progression。這是 semantic boundary，不在此鎖死 exact final type names。
- Library 的資料模型、rendering 與 navigation 以 Book abstraction 為基礎；Career Game 以自己的 narrative/state model 為基礎。不得把 game content 塞進 Book/Chapter/ContentBlock，也不得讓 Library 依賴 game concepts。
- 共用平台只抽取真實 consumer 需要的 narrow contracts；不得建立 generalized mega-schema。詳細 dependency direction 見 `docs/platform-architecture.md`。

## 6. Book-agnostic 平台需求（硬性約束）

- **本節是 Library bounded context 的硬性約束**；不代表 Career Game 必須使用 Book model。
- Library 必須能承載**任意 business-Japanese 主題**的書。
- Library platform **不得依賴第一本書的主題**；不得存在 first-book-specific code path。
- 具體而言，不得新增：
  - first-book 特有的 schema / 資料欄位
  - first-book 特有的 component
  - first-book 特有的 route / page
  - first-book 特有的 hard-coded content
- 任何新書都必須能只靠「提供新 book 的 metadata 與內容」上架，而不需要修改平台程式碼。

## 7. 平台 vs Book 的責任分界

**Shared platform 負責**（只在 consumer 實際需要時共用）：

- repository 與 tooling boundary
- shared Supabase/backend 與 secure server execution boundary
- durable account/user identity namespace
- shared assets 與 operational data
- catalog、commerce、entitlement、progress 的 narrow contracts；不得預設每個產品都需要或共享相同 shape

**Library platform 負責**（跨所有書通用的能力）：

- rendering
- navigation
- access（存取權）
- purchase state（購買狀態）
- library（書庫）
- reading state（閱讀狀態）
- search
- responsive（響應式）
- accessibility（無障礙）

**每本書負責**（Library 內容層）：

- title
- cover
- author metadata
- chapters
- content
- examples / exercises
- audience（受眾）
- difficulty metadata（難度資訊）
- price

Library platform 不應 embed 任何一本書的內容細節；書的內容與 metadata 由書本身提供。

**Career Game 負責**其 scenario/case、scene、choice/action、outcome/consequence、explanation/feedback、progression，以及 product-specific UI/navigation/state。它不依賴 Book schema；Library 也不依賴這些 game concepts。

預設 deployment topology 是 one repository + one shared Supabase modular monolith，不新增第二 backend 或 microservices。兩個產品仍保有自己的 release cadence；共用 backend 不等於共用所有資料表、domain objects 或 frontend release。

## 8. UI / Reader quality 是 P0

- **兩個產品的 UI quality 都是 P0**：屬於核心產品需求，**不是** post-MVP polish。
- Library Reader 與整體 editorial surface 的品質被視為產品主體；Career Game 可使用 distinct case-file／narrative grammar。兩者優先級都等同功能正確性，不要求同一套 presentation。
- 平台級品質目標：體驗要像 premium 日系 knowledge 產品，同時尊重各 bounded context 的 interaction grammar。

## 9. Web-first 策略

- **Web-first**；MVP 不做原生 iOS / Android app。
- **Library 行動網頁**必須支援通勤閱讀；桌面必須支援專注閱讀與查閱。
- Career Game 也必須在行動與桌面 web 提供適合其 narrative interaction 的 responsive experience。
- 響應式設計由各 product surface 與 shared primitives 共同承擔（見第 7 節），不得以 native-app-only 假設設計。

## 10. 付款：provider-neutral architecture

- **Payment architecture 是 provider-neutral**；ECPay（綠界）是第一支 TWD adapter，不是平台架構。
- JPY / USD 的 launch providers 依 `docs/payments/decision-record.md`（§17／§22）決定。
- Provider-specific mechanics 不得污染 Book / Reader / Library / Entitlement architecture。
- **Paid ownership 只能由 verified authoritative server event 驅動**；browser 結果永遠不能 mint entitlement。
- 全部 payment `/api/*` logical endpoints 必須在 server-only Supabase Edge Functions boundary 執行；client 不得提供可信 amount、currency、provider success 或 ownership evidence。
- **Payment 是 MVP 已定案的實作項目**：provider-neutral core 與 ECPay 第一支 TWD adapter 依 `docs/payments/decision-record.md` 實作。本節記錄 payment 方向與不可妥協的約束；實作 contract 由 decision-record 定義。
- 本節定義 current Library Book commerce，不提前定義 Career Game commerce。未來非 Book commerce 等 #58 evidence 後由 #59 決策，且不得弱化 authoritative payment/entitlement 原則。
- Canonical payment contract 見 `docs/payments/decision-record.md`。

## 11. AI 的角色

- **AI 不是 MVP 或 Career Game first slice 的必要項**，也**不得**成為主要產品 abstraction／engine。
- 不得把 platform 設計成以 AI chat / agent 為主要體驗（見第 13 節 MVP non-goals）。
- 若未來導入 AI，其定位是既有產品上的輔助能力，不能反客為主。

## 12. 第一本書的主題：out-of-scope

- **第一本書的主題／內容明確列為 Library platform implementation 的 out-of-scope。**
- Library 建置（rendering、navigation、content model、reader、purchase state、library 等）不依賴、也不應假設第一本書的主題。
- 第一本書的內容選擇與產出是另一個獨立的工作項，不在本契約內定義。
- Library platform 只負責「能承載任意書」；具體是哪一本書由內容側決定。Career Game content 由自己的 bounded context 表達，不以第一本書為 template。

## 13. MVP non-goals

以下項目**不是** MVP 範圍，MVP 不得為了它們投入實作：

- 原生 iOS / Android app
- subscription-first 商業模式
- 以 AI chat / agent 為主體的體驗
- 完整 LMS（證書、cohorts、live classes、社群）
- book-specific hard-coded reader components（任何針對特定書寫死的 Reader 元件）
- 第二 backend／microservices（預設維持 shared Supabase modular monolith）
- 跨 Library 與 Career Game 的 generalized content／commerce／progress mega-schema
- 以 AI 動態生成作為 Career Game first-slice engine

## 14. 不可變更的 product invariants（摘要）

未來任何 agent 在實作時，必須遵守以下不變量（與本契約衝突的工作應被標記為錯誤方向）：

1. Business Japanese Hub 是一個 shared web platform，含 Library 與 Career Game 兩個 first-class products；預設 one repository + one shared Supabase modular monolith。
2. Library 商業單元是**單本 Book**；Library abstraction 是 **Book → Chapter → ContentBlock** 且 book-agnostic。
3. Career Game 的 semantic boundary 是 scenario/case、scene、choice/action、outcome/consequence、explanation/feedback、progression；不得強塞 Book model，也不在此鎖死 final type names。
4. 兩個 bounded contexts 不互相污染 model、UI/navigation 或 state，並保有 product-specific release cadence。
5. **UI quality 是 P0**：Library Reader 是 premium editorial surface；Career Game 可採 distinct case-file／narrative grammar。
6. **Web-first**：兩個產品兼顧行動與桌面；不做原生 app。
7. Payment architecture 是 **provider-neutral**；paid ownership 只能由 verified authoritative server event 驅動（contract 見 `docs/payments/decision-record.md`）。
8. **AI 不是 first-slice engine**，不得成為主要產品 abstraction。
9. Paid Launch／first revenue 仍是 revenue priority；Career Game Phase A free validation 不得弱化或延後 Book purchase golden path。
10. Future non-Book commerce 等 #58 evidence 後由 #59 決策；目前不得建立 generalized commerce schema。
11. MVP non-goals 依第 13 節，不得為了它們投入實作資源。

## 15. 產品階段：Paid Launch（Prototype MVP 已完成）

本節記錄 Library 的 Prototype／Paid Launch 階段，以及 Career Game Phase A 與 current revenue priority 的關係。兩個產品共享必要的平台 boundaries，但不共享同一個 content abstraction 或強制共用 commerce/progress schema。

### 15.1 Prototype MVP（已完成的里程碑）

Prototype 的成功條件是 **user-value validation**，不是 commerce readiness。此里程碑已完成：陌生訪客可以在不需要登入、結帳或付款的前提下，透過真實的產品流程體驗平台：

```text
Storefront → Book Detail → free read → Universal Reader → chapter navigation
```

- Prototype 公開 **1–2 本 free/public books**（或 prototype editions）。
- Public prototype reading **不需要 login**。
- 不得顯示 fake checkout UI 或 disabled payment CTA；改用清楚的 free-reading 語言。
- UI / Reader quality 維持 P0，遵循 `docs/ui-ux-research.md`（§8 的具體化）。
- 平台維持 book-agnostic；free/public access 必須以 generic catalog/access 語意表達（例如 `Price.tier: 'free'`），**不得 hard-code book slug**。
- Prototype 階段曾 deferred 的 payment／compliance／legal 工作現依 Paid Launch 優先級處理；完成狀態以 live GitHub 與 repository 為準。
- **既有 payment / entitlement / legal architecture 不得刪除、繞過或弱化**；free/public path 也不得因 Paid Launch 回歸。

### 15.2 Paid Launch（現階段目標）

Paid Launch 的成功條件是 **最快安全的第一筆真實營收**。依既有 provider-neutral payment core 與 server-authoritative entitlement contract（§10、`docs/payments/decision-record.md`）啟用商業化；Prototype 是已完成的前置里程碑，不取代長期 book-based commerce model。

- 至少一本真實、可信且可獨立販售的 paid Book，價格由 server-authoritative catalog 決定。
- 先上線最小可合法、安全啟用的 currency／provider 組合；不得為等待所有未來 provider 延後第一筆營收。
- Paid golden path 必須涵蓋 authentication、checkout、verified authoritative payment、exactly-one entitlement、Reader access、receipt／order confirmation、refund 與 reconciliation。
- Seller identity、tax status、merchant/KYC、credentials、專業法律核准與真實 sandbox/live 結果必須由真實證據提供；缺失時 fail closed，不得捏造或以 client state 代替。
- Free/public books 與免登入閱讀仍是正式產品能力，Paid Launch 不得破壞。
- UI / Reader quality、responsive、accessibility 與 production operability 仍為 P0。

### 15.3 Stage 判定

未來 agent 決定 revenue 實作優先級時，以 Paid Launch／first revenue 為當前 delivery target：先完成直接解鎖第一筆安全付費交易的 Book、pricing、payment、compliance、deployment 與 golden-path 品質；只支援未來 provider、額外 currency 或非必要擴張的工作不得阻塞。Prototype milestone 與 free/public reader path 必須持續回歸驗證。

Career Game Phase A 的 free validation 可以並行，並使用同一 repository 與 shared Supabase modular-monolith boundary，但不得刪除、繞過、弱化或延後 Book purchase golden path。Career Game 的 product-specific UI/navigation/state/release cadence 保持獨立；是否需要非 Book commerce 必須先取得 #58 evidence，再由 #59 決策。

---

*相關文件：`README.md`（專案入口）、`docs/platform-architecture.md`（bounded contexts 與 shared platform）、`docs/content-model.md`（Library 內容資料模型）、`docs/ui-ux-research.md`（Library UI/UX 設計方向，§8 的具體化）、`docs/payments/decision-record.md`（canonical payment decision record）。*
