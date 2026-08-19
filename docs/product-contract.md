# Product Contract — Business Japanese Hub

> **狀態：** durable（長期有效）的產品契約，是產品層面的 canonical source of truth。
> 本文件的地位高於任何單一 issue / ticket / 實作 detail；與任何任務描述衝突時，以本契約為準。
> 變更本契約前，必須先有明確的產品層決策依據，不得僅因某次實作便利而修改。

## 1. 產品定義

Business Japanese Hub 是一個 **premium、web-first 的數位出版與學習平台**，服務對象是**進階專業日語學習者**。

- 核心定位是「出版平台」：以一本一本獨立販售的 **Book** 為核心商業單元，不是 course / lesson pack / subscription。
- 使用者體驗必須像 premium 日系 editorial / knowledge 產品，**不是** generic LMS，也**不是**「外國人教科書」網站。

## 2. 核心問題陳述（gap）

平台要橋接的關鍵 gap 是：

> **從 JLPT N1 語言能力 → 真實日本職場能力。**

也就是說：使用者在考過 N1、具備高階語言能力之後，仍然缺少「在日本職場實際運用這套語言」的能力與產品。這是平台存在的理由。

## 3. 目標受眾

- **主要受眾：** 進階專業日語學習者（語言能力已接近或達到 JLPT N1）。
- **必須同時吸引：** **日本的大學生與年輕職場人士**，並且願意為同一本書付費。
  - 這意味著內容與產品呈現不能預設使用者是「外國人」；同一本 Book 必須對日本年輕讀者也具有價值與吸引力。
- 因此任何一本書的 content 與 presentation 都必須同時服務上述兩類讀者，不得把任一類當成次要對象。

## 4. 商業模型：Book-based commerce

- **核心商業單元是一本一本獨立販售的 Book**，不是 course / lesson pack / subscription。
- 平台不得以 subscription-first 或 bundling 為主要商業模式。
- 購買粒度以「單本 Book」為單位。

## 5. 平台 abstraction

- 內容的基本抽象是 **`Book → Chapter → Content Blocks`**。
- **明確不是** LMS 的 `Course → Module → Lesson`。
- 平台層的資料模型、rendering 與 navigation 都必須以這個 abstraction 為基礎。

## 6. Book-agnostic 平台需求（硬性約束）

- 平台必須能承載**任意 business-Japanese 主題**的書。
- 平台**不得依賴第一本書的主題**；不得存在 product-specific（first-book-specific）的 code path。
- 具體而言，不得新增：
  - first-book 特有的 schema / 資料欄位
  - first-book 特有的 component
  - first-book 特有的 route / page
  - first-book 特有的 hard-coded content
- 任何新書都必須能只靠「提供新 book 的 metadata 與內容」上架，而不需要修改平台程式碼。

## 7. 平台 vs Book 的責任分界

**平台負責**（跨所有書通用的能力）：

- rendering
- navigation
- access（存取權）
- purchase state（購買狀態）
- library（書庫）
- reading state（閱讀狀態）
- search
- responsive（響應式）
- accessibility（無障礙）

**每本書負責**（內容層）：

- title
- cover
- author metadata
- chapters
- content
- examples / exercises
- audience（受眾）
- difficulty metadata（難度資訊）
- price

平台不應 embed 任何一本書的內容細節；書的內容與 metadata 由書本身提供。

## 8. UI / Reader quality 是 P0

- **UI / Reader quality 是 P0**：屬於核心產品需求，**不是** post-MVP polish。
- Reader 與整體介面品質被視為產品的主體，優先級等同於功能正確性。
- 平台級品質目標：體驗要像 premium 日系 editorial / knowledge 產品。

## 9. Web-first 策略

- **Web-first**；MVP 不做原生 iOS / Android app。
- **行動網頁**必須支援通勤閱讀（commute reading）。
- **桌面**必須支援專注閱讀與查閱（focused reading & reference）。
- 響應式設計是平台責任（見第 7 節）。

## 10. 付款：provider-neutral architecture

- **Payment architecture 是 provider-neutral**；ECPay（綠界）是第一支 TWD adapter，不是平台架構。
- JPY / USD 的 launch providers 依 `docs/payments/decision-record.md`（§17／§22）決定。
- Provider-specific mechanics 不得污染 Book / Reader / Library / Entitlement architecture。
- **Paid ownership 只能由 verified authoritative server event 驅動**；browser 結果永遠不能 mint entitlement。
- **Payment 是 MVP 已定案的實作項目**：provider-neutral core 與 ECPay 第一支 TWD adapter 依 `docs/payments/decision-record.md` 實作。本節記錄 payment 方向與不可妥協的約束；實作 contract 由 decision-record 定義。
- Canonical payment contract 見 `docs/payments/decision-record.md`。

## 11. AI 的角色

- **AI 不是 MVP 必要項**，也**不得**成為主要產品 abstraction。
- 不得把 platform 設計成以 AI chat / agent 為主要體驗（見第 13 節 MVP non-goals）。
- 若未來導入 AI，其定位是既有產品上的輔助能力，不能反客為主。

## 12. 第一本書的主題：out-of-scope

- **第一本書的主題／內容明確列為 platform implementation 的 out-of-scope。**
- 平台建置（rendering、navigation、content model、reader、purchase state、library 等）不依賴、也不應假設第一本書的主題。
- 第一本書的內容選擇與產出是另一個獨立的工作項，不在本契約內定義。
- 平台只負責「能承載任意書」；具體是哪一本書由內容側決定。

## 13. MVP non-goals

以下項目**不是** MVP 範圍，MVP 不得為了它們投入實作：

- 原生 iOS / Android app
- subscription-first 商業模式
- 以 AI chat / agent 為主體的體驗
- 完整 LMS（證書、cohorts、live classes、社群）
- book-specific hard-coded reader components（任何針對特定書寫死的 Reader 元件）

## 14. 不可變更的 product invariants（摘要）

未來任何 agent 在實作時，必須遵守以下不變量（與本契約衝突的工作應被標記為錯誤方向）：

1. 商業單元是**單本 Book**，不是 course / subscription / lesson pack。
2. 抽象是 **Book → Chapter → Content Blocks**，不是 Course → Module → Lesson。
3. 平台是 **book-agnostic**：不得有 first-book 特有的 schema / component / route。
4. **UI / Reader quality 是 P0**，不是後期 polish。
5. **Web-first**：行動支援通勤閱讀，桌面支援專注閱讀與查閱；不做原生 app。
6. Payment architecture 是 **provider-neutral**；ECPay（綠界）是第一支 TWD adapter；paid ownership 只能由 verified authoritative server event 驅動（contract 見 `docs/payments/decision-record.md`）。
7. **AI 不是 MVP 必要項**，不得成為主要產品 abstraction。
8. 平台與 Book 的責任分界依第 7 節：平台負責 rendering / navigation / access / purchase state / library / reading state / search / responsive / accessibility；書負責其 metadata 與內容。
9. MVP non-goals 依第 13 節，不得為了它們投入 MVP 實作資源。

## 15. 產品階段：Paid Launch（Prototype MVP 已完成）

本契約區分兩個不同的產品階段。兩者共享相同的 book-based commerce contract 與 platform architecture，但 delivery priority 與 product-stage boundary 不同。

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

未來 agent 決定實作優先級時，以 Paid Launch／first revenue 為當前 delivery target：先完成直接解鎖第一筆安全付費交易的 Book、pricing、payment、compliance、deployment 與 golden-path 品質；只支援未來 provider、額外 currency 或非必要擴張的工作不得阻塞。Prototype milestone 與 free/public reader path 必須持續回歸驗證。

---

*相關文件：`README.md`（專案入口）、`docs/content-model.md`（內容資料模型）、`docs/ui-ux-research.md`（UI/UX 設計方向，§8 的具體化）、`docs/payments/decision-record.md`（canonical payment decision record）。*
