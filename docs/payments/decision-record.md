# Payment Architecture Decision Record

> **狀態：canonical（唯一規範來源）。**
> 本文件是 Business Japanese Hub 的**唯一 canonical payment decision record**，也是 GitHub #9 實作的 contract source of truth。
> 原文來源：`Business Japanese Hub 支付架構研究與 GitHub #9 Engineering Contract.pdf`（29 頁，2026-08-14），已整理為可維護 Markdown，**不直接保留 PDF dump**。
> 6 頁初版研究《多幣種支付系統設計與 ECPay 首階段適配決策》已被本文件 **SUPERSEDED**，不再具規範效力；見 [research-v1-superseded.md](research-v1-superseded.md)。

```text
PROJECT:   Business Japanese Hub
REPOSITORY: davidkao-official/business-japanese-hub
ISSUE:     #8（research provider-neutral multi-currency payment architecture）
CTX:       #8 research remediation + canonical payment contract landing
STATUS:    READY_FOR_REVIEW（docs-only，未包含任何 production payment feature code）
```

---

## 1. Canonical decision

### 1.1 決策摘要

1. **付款架構是 provider-neutral**。`Book / Order / Payment / Refund / Entitlement` 領域不得耦合任何單一支付機構；provider 是 adapter，不是 domain model。
2. **ECPay（綠界）是第一支 TWD adapter**，不是平台架構。MVP 走 ECPay「全方位金流 All-In-One / AioCheckOut V5」的 hosted redirect flow，固定 `ChoosePayment=Credit`。
3. **TWD 第二 provider 候選是 NewebPay（藍新）**，僅在「diversification / reliability / business need 有明確理由」時列為 next；本決策不自動要求近期支援。
4. **Stripe 目前只是未來 adapter target**。Stripe 官方 global availability 未列出台灣，且明示不在支援國家的 businesses 尚不能使用 Stripe Payments；若未來 merchant legal entity 仍是台灣公司／台灣商戶，不能先假設能開 Stripe Payments。實際加入時必須重新確認。
5. **JPY / USD 的 launch provider 由本文件 §17 決定**，對應的 bounded adapter issues 見 §22。
6. **paid ownership 只能由 verified authoritative server event 驅動**；browser 結果永遠不能 mint entitlement。

### 1.2 Domain boundary

```text
Book / Order / Payment / Refund / Entitlement
                  │
                  ▼
          PaymentProviderAdapter
                  │
      ┌──────┬─────┼─────┬──────┐
      ▼      ▼     ▼     ▼      ▼
    ECPay NewebPay Stripe* PayPal*
              （Stripe*：待 merchant-country eligibility 確認；PayPal：USD primary per #21，見 §17.2／§22）
```

上圖示意 adapter boundary；provider 清單隨 approved adapter 擴充，不是封閉列舉。

ECPay 只提供 **payment evidence**；Payment domain 把經過驗證的付款事實轉成 `Order = paid`，然後 application/domain service 才建立 `Entitlement`。這正符合 #7 已建立的 provider-agnostic ownership boundary。

### 1.3 Provider priority

```text
MVP:       ECPay
           ↓
next:      NewebPay，if diversification/reliability/business need justifies it
           ↓
later:     Stripe，only after merchant-country eligibility is confirmed
```

這不是因為 ECPay 是 domain，而是因為目前 Business Japanese Hub 已有可用的 ECPay merchant setup；#1 本身也把 ECPay 定義為「current MVP payment-provider decision」，不是 product abstraction。

---

## 2. Core invariants

以下 invariant 應直接寫進 #9 acceptance tests，不是只寫在文件：

| Invariant | Engineering rule |
| --- | --- |
| Browser redirect 不可信 | `OrderResultURL` / `ClientBackURL` 永遠不能寫 `payments.status = succeeded` 或 grant entitlement |
| Client 不可解鎖 | Entitlement 只能由 server transaction 建立／啟用 |
| Callback 必須驗證 | ECPay `CheckMacValue` + local invariants + `QueryTradeInfo` confirmation |
| Callback 必須 idempotent | unique payment reference + event fingerprint + conditional state transition + unique entitlement |
| Secret server-only | `MerchantID` 可非秘密；`HashKey` / `HashIV` 永不進 bundle / browser / repository |
| 不保存卡片資料 | hosted ECPay page、`NeedExtraPaidInfo=N`，DB 不設 PAN / CVV / card token 欄位 |
| Provider-neutral domain | domain 不出現 `RtnCode`、`TradeNo` 等 ECPay-specific business decisions |
| 一次付款只產生一份 ownership | entitlement `UNIQUE(user_id, book_id)`；duplicate successful charge 進 finance review，不建立第二 ownership |

ECPay 官方自己也明確要求付款通知必須檢查 `CheckMacValue`、避免同一通知重複處理，且 `RtnCode != 1` 或 `SimulatePaid = 1` 不得出貨／履約。

---

## 3. ECPay authoritative result（必補 blocker B1）

### 3.1 ReturnURL vs OrderResultURL 語意

ECPay 對兩個 URL 的語意區分非常明確：

- **`ReturnURL` = server-side authoritative payment notification channel。** 是 ECPay server 對 Business Japanese Hub server 的 `POST`。付款判定必須以 `ReturnURL` 為主，因為 client 操作或網路問題可能導致 `OrderResultURL` 根本沒有送達；兩者到達順序也沒有保證。
- **`OrderResultURL` = browser UX channel only。** 是 browser/client-side 的 POST-return。**任何瀏覽器結果都不能直接更新 authoritative payment state 或 grant Entitlement。**
- **ATM / CVS / BARCODE 等非即時付款不得依賴 `OrderResultURL`。** ECPay 官方明示銀聯卡與非即時交易（ATM / CVS / BARCODE）**不支援此參數**。這些付款方式只等 `ReturnURL` 通知（官方不建議 polling，改等通知）。
- **`ClientBackURL` 更不能當付款證據。** ECPay 明確表示它只是「返回商店」按鈕，導回時根本不附付款結果。
- **repair / verification 使用官方允許的 query / reconciliation path**（`QueryTradeInfo` + `FundingReconDetail`，見 §6），不靠 OrderResultURL。

### 3.2 Browser-return endpoint contract

`#9` 不應讓 SPA 自己直接接 ECPay result 並解鎖。browser-return 處理流程：

```text
ECPay OrderResultURL
        │
        ▼
POST /api/payments/ecpay/browser-return
        │
        ├─ optional: verify CheckMacValue for diagnostics
        ├─ map MerchantTradeNo -> local opaque order id
        └─ 303 redirect
                ▼
/purchase/result?order=<local-order-id>
                │
                ▼
GET /api/orders/<id>/status   →   server DB state only
```

即使 browser POST 說 `RtnCode=1`，browser-return endpoint 也**不能**修改 `Order`、`Payment` 或 `Entitlement`。如果 server callback 尚未處理，UI 顯示「付款確認中」並 polling/refetch；這正是因為官方不保證 `ReturnURL` 與 `OrderResultURL` 的先後順序。

### 3.3 已刪除的錯誤描述

本文件不包含、且明確否決以下初版描述：

- ~~「以 ECPay 回調 (OrderResultURL) 為最終依據」~~ — 錯。authoritative 是 `ReturnURL`。
- ~~「ECPay 向商家系統 POST 訂單結果，或瀏覽器重定向到 OrderResultURL，皆可觸發 Succeeded」~~ — 錯。只有 verified `ReturnURL`（含 QueryTradeInfo 確認）可以觸發 `Succeeded`。

### 3.4 Required endpoints（#9 實作必須）

```text
POST /api/checkout/books/:bookId        authenticated；忽略所有 client price / provider-success state；回傳 signed ECPay checkout instruction
POST /api/payments/ecpay/callback       public server callback；CheckMac required；durable + idempotent；authoritative payment processing；成功 ACK 精確為 `1|OK`
POST /api/payments/ecpay/browser-return browser navigation only；NEVER grants payment/entitlement；303 → frontend result page
GET  /api/orders/:orderId/status        authenticated owner/admin；只回傳 local authoritative state
GET  /api/admin/finance/*               finance role only
```

**Authorization 規則：opaque identifier 不是 authorization check。** `GET /api/orders/:orderId/status` 需要 authenticated session 並驗證 `order.user_id === auth.uid()` 後才回傳 order state；`/api/admin/finance/*` 需要 server-enforced `finance_viewer` / `finance_admin` role。若未來支援 guest checkout，改用 signed、scoped、one-time result token，而不是以訂單編號當授權。

> 本節 `/api/*` 是 **logical route name**；實際 deployed URL 為 `/functions/v1/<function-name>`，`verify_jwt` 設定見 §3.5 ingress contract。

### 3.5 Server execution boundary（#9 必補 blocker B2）

**決策：** §3.4 的全部 `/api/*` endpoints 以 **Supabase Edge Functions**（Deno / TypeScript）作為唯一的 server-only execution boundary 實作。

理由與一致性：

- 既有 server-authoritative 層已是 Supabase（managed Postgres + auth + RLS + security-definer SQL functions，見 `docs/accounts-and-entitlement.md` §1／§3）；Edge Functions 是 Supabase 原生 HTTP runtime，與 DB 同一專案，可正式部署（`supabase functions deploy`），本機以 `supabase start` + `supabase functions serve` 開發。
- 不為 #9 引入大型新 backend framework（無 Express / Fastify / Hono server、無獨立 hosting）。
- Payment domain 的純 TS 程式碼（`Money`、`PaymentProviderAdapter`、`ecpayCheckMac` helper，見 §5／§8／§10）不依賴 Vite / React，可直接被 Edge Function import，不重寫 domain 邏輯。

部署形狀（function 名稱與 deployed URL 的對應由下方 **Ingress contract** 定稿；#9 依此實作，不再延後）：

```text
supabase/functions/
  checkout/            -> POST /functions/v1/checkout/books/:bookId
  ecpay-callback/      -> POST /functions/v1/ecpay-callback
  ecpay-browser-return -> POST /functions/v1/ecpay-browser-return
  orders-status/       -> GET  /functions/v1/orders-status/:orderId/status
  finance/             -> GET  /functions/v1/finance
```

**Ingress contract（#9 implementation-ready）：**

Supabase 把每個 Edge Function 部署成獨立 endpoint `https://<project-ref>.supabase.co/functions/v1/<function-name>`，**不存在內建的 `/api/*` 路由**。本文檔其他章節使用的 `/api/*` 是 **logical route name**；實際 deployed URL 為：

| Logical route | Deployed Edge Function URL |
| --- | --- |
| `POST /api/checkout/books/:bookId` | `POST /functions/v1/checkout/books/:bookId` |
| `POST /api/payments/ecpay/callback` | `POST /functions/v1/ecpay-callback` |
| `POST /api/payments/ecpay/browser-return` | `POST /functions/v1/ecpay-browser-return` |
| `GET /api/orders/:orderId/status` | `GET /functions/v1/orders-status/:orderId/status` |
| `GET /api/admin/finance/*` | `GET /functions/v1/finance`（finance sub-route 在 function 內解析） |

- **決策：** SPA 與內部 callers 直接呼叫 deployed `/functions/v1/<function-name>` URL（Supabase platform gateway），**不依賴額外的 `/api/*` reverse-proxy rewrite**。每個 function 以 `/functions/v1/<function-name>` 為 base，路徑參數接在其後（如 `/functions/v1/checkout/books/<bookId>`），function 內以 URL Pattern 解析 request pathname。本機開發以 `supabase start` + `supabase functions serve` 提供 `/functions/v1/*`；Vite dev server 以 proxy 對應轉送。
- **Platform-level JWT 驗證（`verify_jwt`）：** `supabase/config.toml` 必須設定 `verify_jwt = false` **只** 對 `ecpay-callback` 與 `ecpay-browser-return`（兩者的 request 都不攜帶 Supabase user JWT：ECPay server POST 與 browser navigation 均無）。`checkout`、`orders-status`、`finance` 維持 `verify_jwt = true`（platform 在 function 執行前驗證 `Authorization` header，missing / invalid → 401），function 內再以 server-side JWT / session 驗證 ownership 與 role（見下方「Authenticated order-status / finance access」）。
- **public handler 仍必須自我驗證：** 即使 `ecpay-callback` / `ecpay-browser-return` 關閉 platform JWT check，handler 內仍必須驗證 ECPay `CheckMacValue`、local invariants（§4.4）與 browser-input，不可因關閉 `verify_jwt` 而省略。

**Secrets（provider secrets server-only）：** 以 `supabase secrets set ECPAY_MERCHANT_ID=... ECPAY_HASH_KEY=... ECPAY_HASH_IV=... ECPAY_ENV=...` 設定在專案層級，Edge Function 以 `Deno.env` 讀取；永不進入 repository / client bundle / build artifact（§15）。stage 與 production 使用**不同 Supabase 專案**，憑證不可混用（§16）。

**Service-role persistence：** Edge Function 內以 runtime 提供的 `SUPABASE_SERVICE_ROLE_KEY` 建立 service-role client（絕不使用 anon key）；所有 `orders` / `payments` / `refunds` / `payment_events` 寫入與 `grant_entitlement` 寫入點（沿用 `src/lib/persistence/grant.ts` pattern）都只透過此 client；service-role secret 永不進入瀏覽器。

**Authenticated order-status / finance access：** `checkout`、`orders-status` 先以 `Authorization: Bearer <JWT>` 在 Edge Function 內 server-side 驗證 Supabase session，再檢查 ownership（`order.user_id === auth.uid()`）；`finance` 額外要求 server-enforced `finance_viewer` / `finance_admin` role（§14）。Role 來源為 DB role-grant 表，由 Edge Function 查證；絕不信任 client 自稱的 role。

**Durable retry / reconciliation：** `verification_pending` 先 durable 寫入 DB 後才對 ECPay 回 `1|OK`（§4.5）。Layer B repair loop 與 Layer C daily reconciliation（§6）以 **Supabase scheduled jobs（pg_cron）** 觸發對應 Edge Function 的 secret-authenticated 內部呼叫，不依賴 RAM / background promise。Idempotency 依 DB constraints（§13），不依賴 runtime retry 語意。

**非 payment runtime：** `scripts/*.ts`（authoring / publishing workflow，`pnpm workflow:*`）是 operator/author 工具，不是 payment runtime，也不得持有 provider secrets。

---

## 4. ECPay All-In-One callback contract（必補 blocker B2）

### 4.1 Checkout API

| 項目 | STAGE | PRODUCTION |
| --- | --- | --- |
| AioCheckOut V5 | `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5` | `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5` |
| QueryTradeInfo V5 | `https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5` | `https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5` |

建立訂單使用 `POST application/x-www-form-urlencoded`；`MerchantTradeNo` 最長 20 字元且**必須唯一、不可重複**；`PaymentType` 固定 `aio`；`TotalAmount` 必須為**整數**且只支援**新台幣**；`ReturnURL` 為 mandatory server callback；`CheckMacValue` mandatory，`EncryptType=1` 即 SHA-256。

### 4.2 第一階段建議欄位

```text
MerchantID          = server config
MerchantTradeNo     = unique per PAYMENT ATTEMPT
MerchantTradeDate   = yyyy/MM/dd HH:mm:ss
PaymentType         = aio
TotalAmount         = server-side price in integer TWD
TradeDesc           = Business Japanese Hub book purchase
ItemName            = historical book title snapshot
ReturnURL           = backend ECPay callback endpoint
ChoosePayment       = Credit
CheckMacValue       = server-generated
EncryptType         = 1
OrderResultURL      = backend browser-return handler
NeedExtraPaidInfo   = N
Language            = CHT / JPN / ENG as appropriate
```

固定 `ChoosePayment=Credit` 比 `ALL` 更適合 MVP。ECPay 官方提醒支付方式會持續增加／調整；若希望避免未來新付款方式造成 callback parsing 問題，建議固定指定 payment type。

`NeedExtraPaidInfo` 設為 `N`。官方只有在設 `Y` 時才要求額外付款資訊跟著 `ReturnURL` / `OrderResultURL` 回來；Business Japanese Hub 沒有必要為 ownership、finance dashboard 或 reconciliation 保存額外卡片相關欄位。

AioCheckOut 已正式支援 `Language=JPN`（也支援 ENG、CHT、KOR、CHI），因此對日本使用者可直接令 ECPay checkout 使用 JPN，不需要重造信用卡表單。

### 4.3 ReturnURL callback = form-encoded，不是 JSON

`AioCheckOut` 的 `ReturnURL` callback：

- `POST`
- `Content-Type: application/x-www-form-urlencoded`
- **必須以 form data 解析（`URLSearchParams` / querystring），不是 JSON。**

成功付款的核心 evidence 至少包含：`MerchantID`、`MerchantTradeNo`、`TradeNo`、`TradeAmt`、`PaymentDate`、`PaymentType`、`RtnCode`、`RtnMsg`、`SimulatePaid`、`CheckMacValue`。

**不得混入其他 ECPay API family 的 JSON contract。** 本文件鎖定 All-In-One（AioCheckOut V5）flow；除非日後明確改採其他 ECPay 產品，callback 一律是 form-urlencoded。

### 4.4 成功 predicate

`RtnCode == 1` 才代表成功；ECPay 要求保存 `TradeNo` 與 `MerchantTradeNo` 的關聯。`SimulatePaid == 1` 即使 `RtnCode == 1` 仍只是後台模擬通知，不是真的付款，也不會撥款，因此**絕不能 grant entitlement**。

Business Japanese Hub 在官方最低要求之上加入更嚴格的 local invariant checks：

```text
callback MerchantID        === configured MerchantID
MerchantTradeNo            exists locally
callback TradeAmt          === immutable Payment amount
local Payment provider     === "ecpay"
callback TradeNo           not owned by a different payment
RtnCode                    === 1
SimulatePaid               === 0
CheckMacValue              valid
```

這仍不是最終 entitlement threshold。ECPay 的 `QueryTradeInfo/V5` 官方文件直接寫明：「當取得付款結果通知時，請呼叫查詢訂單 API 驗證付款結果。」Query response 本身也要再次檢查 `CheckMacValue`；`TradeStatus=1` 才是已付款。

真正的 **ECPayPaymentVerified** success predicate 定義成：

```text
ECPayPaymentVerified =
    valid_callback_checkmac
    AND merchant_id_matches
    AND merchant_trade_no_matches
    AND amount_matches
    AND callback.rtn_code == 1
    AND callback.simulate_paid == 0
    AND valid_query_response_checkmac
    AND query.merchant_trade_no == callback.merchant_trade_no
    AND query.trade_no == callback.trade_no
    AND query.trade_amt == local_payment.amount
    AND query.trade_status == 1
```

只有 `ECPayPaymentVerified = true` 才可以 transition 到 `payment.succeeded`。

### 4.5 ACK 與 retry

- ECPay 要求 `ReturnURL` 正確回應純文字 **`1|OK`**。
- 沒有正確收到 `1|OK`，ECPay 會隔約 **5–15 分鐘重送，當日總計重複發送四次**；因此 **duplicate callback 是正常契約的一部分，不是 exception**。

Callback handler 策略：

```text
Invalid CheckMac / unknown MerchantTradeNo
    -> 4xx / do not acknowledge as successfully processed
Valid callback
    -> durable event insert
    -> attempt QueryTradeInfo
       ├─ confirmed paid
       │    -> transaction: Payment + Order + Entitlement
       │    -> 1|OK
       ├─ confirmed not paid/failed
       │    -> persist normalized state
       │    -> 1|OK
       └─ provider timeout / ambiguous
            -> Payment = verification_pending
            -> schedule our own QueryTradeInfo retry
            -> 1|OK only after durable pending record exists
```

關鍵：一旦向 ECPay 回 `1|OK`，後續 verification retry 就變成 Business Japanese Hub 自己的責任。所以 `verification_pending` 必須有 scheduled retry/reconciliation worker，不能只是 RAM / background promise。

反過來，如果 DB transaction 本身失敗，**不要先回 `1|OK`**。讓 ECPay 重送比承認一個沒有 durable ingest 的 callback 安全得多。

### 4.6 Required ECPay checkout rules（#9 實作必須）

```text
ChoosePayment       = Credit
PaymentType         = aio
EncryptType         = 1
NeedExtraPaidInfo   = N
MerchantTradeNo     = server-generated；<= 20 字元、alphanumeric；unique per Payment attempt；never reused
TotalAmount         = server-generated；integer TWD；Payment 建立後 immutable
ReturnURL           != OrderResultURL
```

`MerchantTradeNo` 產生器必須是 **server-side 產生**：定義生成規則、validation（長度 ≤ 20、alphanumeric 字元集）與 **collision retry**（若產生到已使用／保留的號碼則重新產生）；不得以 client 提供值或可預測順序直接當作 provider reference。每個 Payment attempt 用新的 `MerchantTradeNo`，永不重複使用舊號碼。

---

## 5. CheckMacValue canonicalization

`AioCheckOut` 的 `CheckMacValue` 不是單純 `SHA256(JSON)`。官方流程是：

```text
all params except CheckMacValue
        ↓
sort keys alphabetically
        ↓
join key=value with &
        ↓
HashKey=<secret>&...&HashIV=<secret>
        ↓
ECPay-compatible URL encode
        ↓
lowercase
        ↓
SHA-256
        ↓
uppercase
```

ECPay 警告不同語言內建的 URL encoder 未必與 ECPay/.NET 編碼完全一致；官方列出的替換包含 `%2d→-`、`%5f→_`、`%2e→.`、`%21→!`、`%2a→*`、`%28→(`、`%29→)`。收到 ECPay 資料時也必須驗證 `CheckMacValue`。

`#9` 應只有一個經 unit-test 的 helper：

```ts
ecpayCheckMac(params, hashKey, hashIV): string
```

建立 checkout、驗 callback、QueryTradeInfo response、以及未來需要 CheckMac 的 ECPay API 都應重用它，不要在各 endpoint 各寫一份 urlencode / signature code。

---

## 6. QueryTradeInfo 與 reconciliation（repair / verification path）

- **Query API**：STAGE `https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5`；PRODUCTION `https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5`。
- Query 的 `TimeStamp` 官方限制在約三分鐘有效；若 callback 沒有收到，信用卡/TWQR 官方建議付款後約十分鐘查一次，若仍為 `TradeStatus=0` 可再等十分鐘，或約四十分鐘後查詢，避免過度呼叫。呼叫太快可能收到 HTTP 403，官方要求降低頻率並等待。
- **Query HTTP 需要 finite deadlines**：定義 connect / read timeout（例如 connect ≤ 10s、read ≤ 15s）；retry 採 bounded backoff（配合官方 10/40 分鐘指引），不要無限重試。
- **`TradeStatus=0` 不是 terminal failure**：代表「訂單已建立但尚未付款」（銀行可能尚未回傳結果）。Query 回 `TradeStatus=0` → persist `verification_pending` + schedule retry；`failed` 保留給 terminal provider failure（例如 issuer refusal、額度不足、交易限制）。

MVP 三層 reconciliation：

| Layer | 內容 |
| --- | --- |
| **Layer A — transaction-time** | `ReturnURL` → CheckMac → `QueryTradeInfo` → paid / entitlement |
| **Layer B — repair loop** | scheduled job：掃描 `verification_pending` / stale pending payments → `QueryTradeInfo` → repair missed/ambiguous callbacks |
| **Layer C — financial reconciliation** | daily production job：`FundingReconDetail` CSV → match local refs / amount → flag mismatch → discover confirmed refunds |

`FundingReconDetail` 是 production-only CSV API（`https://payment.ecPay.com.tw/CreditDetail/FundingReconDetail`），內容含請款與退款資訊（退款金額為負數），官方建議每日執行；stage 不會有真實授權，因此沒有可用的測試環境。`#9` 應用官方 schema 製作 fixture CSV 測 parser/matcher，production 才跑真實 download。

「尚未出現在 settlement report」與「真的 mismatch」要區分開（例如當日交易通常要到隔日 14:00 後才能取得相關資料），不要交易成功幾分鐘就報 reconciliation failure。

---

## 7. Refund source of truth（必補 gap A）

### 7.1 Canonical 決定：`refunds` 是退款事實來源

消除 `payments.status` 與 `refunds` 的雙重 source-of-truth。**MVP 採 bounded policy：**

1. **MVP 只支援 full refund。** 一個 Book entitlement 是 binary ownership；「退 30% 但書還能不能看」只會額外創造沒有產品需求的 domain ambiguity。**MVP 不定義 `PartiallyRefunded` 行為。**
2. **`refunds` 表是退款事實來源（source of truth）。** provider-confirmed refund 的事實落在 `refunds.status = succeeded`。
3. **provider-confirmed refund 後，由 orchestration 以明確 state transition 更新 derived state：**
   - 同一 transaction 內：`refunds.status = succeeded`（事實來源）
   - **若被退款的 payment 是該 Order 的 entitlement-bearing（primary）payment：**
     - `payments.status = refunded`
     - `orders.status = refunded`
     - `entitlements.status = revoked`，`revoked_reason = 'refund'`，保留 audit row（不刪除 row，未來重新購買可再 activate）
   - **若被退款的 payment 是 `duplicate_success` 重複付款（不是 entitlement-bearing）：**
     - 該筆 `payments.status = refunded`；`orders` 保持 `paid`；`entitlement` 保持 `active`
   - 以 primary / entitlement-bearing payment marker（或 `source_order_id` 關聯）區分兩者，避免把 duplicate charge 退款誤轉成 `orders.status = refunded` + `entitlement revoked`。

### 7.2 Refund 契約（ECPay 面向）

ECPay 全方位金流的信用卡退款不是單一「refund」動作。官方要求先查信用卡交易明細，依目前 settlement/close state 決定：

| Provider state | Full refund action |
| --- | --- |
| 已授權、尚未關帳 | `N` 放棄 |
| 要關帳 | `E` 取消，再 `N` 放棄 |
| 已關帳 | `R` 退刷 |

- 一般授權技術上可部分退刷；某些其他交易型態必須全額。MVP 只支援 full refund。
- **ECPay All-in-One refund API 測試環境無法做真實授權，因此沒有可用的 refund API sandbox。** 最安全的第一階段 contract 是：
  ```text
  MVP:
  Internal dashboard creates/refers to Refund record
        ↓
  operator executes full refund in ECPay portal
        ↓
  daily ECPay funding reconciliation sees refund
        ↓
  Refund = succeeded
        ↓
  Payment/Order = refunded（orchestration 更新）
        ↓
  Entitlement = revoked
  ```
  同時在 provider abstraction 中保留 `refund(input): Promise<ProviderRefundResult>`，之後再把 ECPay CreditDetail / DoAction 自動化。因為 automated refund 無法在 stage 完整驗證，上線前必須以 production 小額交易做 controlled smoke test。
- 不要把固定關帳時間寫進 domain rule。官方文件存在每日自動關帳時段描述差異；正確抽象是「query current credit-card transaction detail → derive current provider state → choose `N` / `E+N` / `R`」。
- **Entitlement 不應在使用者按下退款時立刻 revoke**，要等 provider refund 被確認後才 revoke。

---

## 8. Money contract（必補 gap B）

### 8.1 Canonical 定義（implementation-ready）

```ts
interface Money {
  /** Integer canonical amount in the currency's minor unit（JS safe integer，非負）。 */
  amount: number;
  /** Uppercase ISO 4217 code (registry-validated, see src/content/iso4217.ts). */
  currency: string;
}
```

1. **integer canonical representation**：payment domain 的 `Money.amount` 一律是該 currency minor unit 的整數。單一 runtime representation 為 JS `number`（必須通過 `Number.isSafeInteger(amount) && amount >= 0`）；DB 序列化為 Postgres `bigint`，JSON 序列化為 number。**不使用 `BigInt` 作為 canonical 表示**（避免序列化／DB binding 分歧）。
2. **currency 明確**：`Money.currency` 是 registry-validated ISO 4217 code。
3. **minor-unit semantics**：
   - TWD / USD：minor unit = 分（1/100）→ 例如 `TWD 790` 是 `{ amount: 79000, currency: 'TWD' }`。
   - **JPY：zero-decimal currency**，minor unit = 1 → `JPY 880` 是 `{ amount: 880, currency: 'JPY' }`。
4. **adapter 負責 provider-specific conversion**：`PaymentProviderAdapter` 在送出給 provider 前，將 canonical `Money` 轉成該 provider 接受的合法值。ECPay adapter **最終只能收到合法整數 TWD amount**（`if (payment.currency !== 'TWD') throw new UnsupportedCurrencyForProvider('ecpay')`）。
5. **amount/currency snapshot 在 Order 建立後 immutable**：`orders.amount` / `orders.currency` 為建立時鎖定值，之後不可變更。

### 8.2 與現有 `Price.amount` 的關係

**不得直接把 UI/display `Price.amount` 當 payment-domain amount。**

- `src/content/types.ts` 的 `Price.amount` 是 **major-unit display value**（例如 `¥1,500`、`TWD 790`），只用於顯示，不作為計算（見 `src/lib/price.ts`）。
- 建立 Order 時，server 從 Book/Product record 讀 authoritative server-side price，換算成 canonical `Money`（integer minor units）後鎖定快照。
- Client 只能送 `bookId`，不能送可信的 `price`。任何 client 提供的 amount 都必須被忽略／拒絕。
- 以 `price.test.ts` / adapter unit test 鎖死單位換算，避免把 `790` 誤送成 `790` 分或反過來。

### 8.3 Authoritative server-side price source（catalog / price seam）

**不變量：** client 提供的 `amount` / `currency` 永遠不是付款真相。Checkout 輸入至少為 `bookId`（§3.4），任何 client 提供的 price / amount 一律忽略／拒絕。Server 必須從 **server-side authoritative price source** 取價，不得從 SPA bundle、也不得從 client request 取價。

**Seam 決策：** 建立最小 **`catalog`** 表作為 server-side authoritative price seam。現有 static content（`books/` → `content-dist/`）是 authoring / display 來源，其 `Price.amount` 是 major-unit display value（`src/content/types.ts`；§8.2），不能直接被 server 當 canonical payment amount；且 SPA bundle 是 public artifact，不適合作為 server 取價來源。因此價格由 **publish workflow（`scripts/publish.ts`）以 service-role 寫入 `catalog`**，checkout Edge Function 以 service-role 讀取。（此 `catalog` 是 DB server-side price catalog，與 client-side `src/reader/catalog.ts` book registry 不同層。）

`catalog` 表 contract（migration 屬 #9 bounded migration，本節鎖 contract 與 DB constraints）：

| Field | Contract |
| --- | --- |
| `book_id` | content-model `Book.id`，PK（text，不設 FK——書 metadata 在 static bundle），NOT NULL |
| `slug` | 書的 slug，NOT NULL |
| `currency` | 大寫 ISO 4217 code（§8.1 registry-validated），NOT NULL |
| `amount_minor` | canonical `Money.amount`（integer minor units，Postgres `bigint`；§8.1），NOT NULL，`CHECK (amount_minor >= 0 AND amount_minor <= 9007199254740991)`（= `Number.MAX_SAFE_INTEGER`） |
| `published_revision` | immutable published snapshot id（`content-dist/books/<slug>/snapshots/<id>.json`），NOT NULL |
| `released_at` | 該 published snapshot 正式 release 時間，NOT NULL `timestamptz` |

- **寫入：** 僅 `service_role`（publish workflow 或 operator）。Display `Price.amount`（major unit）依該 currency 的 minor-unit semantics（§8.1）換算成 `amount_minor`（TWD 790 → 79000、JPY 880 → 880），換算以 unit test 鎖死（沿用 `price.test.ts` 的 pattern）。
- **讀取（released-only）：** checkout Edge Function 以 service-role client 依 `book_id` **只讀 explicitly released 的 row**：`WHERE book_id = $1 AND released_at IS NOT NULL AND released_at <= now()`。無該 book（未 publish／未 release／無價）→ refuse checkout。
- **Order snapshot 含 published revision：** 建立 `Order` 時，snapshot 除了 immutable `Money`（amount + currency）與 book reference（`book_id` / `item_name_snapshot`）之外，**必須一併持久化 `published_revision`**（或等價的 immutable catalog snapshot identifier）進 `orders`（§12），建立後不可變更（§8.1.5）；據此精確辨識實際售出的 published revision。
- **Access（no-read boundary）：** `catalog` 是 server-only authoritative price source；browser / anon / authenticated 一律不可讀寫。`catalog` 建在 `public` schema：`enable row level security`；**不建立任何 client SELECT policy**；`REVOKE ALL ON catalog FROM anon, authenticated`；僅 `GRANT SELECT ON catalog TO service_role`（service_role 以 RLS bypass 讀取，僅 checkout Edge Function 的 service-role client 使用）。`catalog` 不得被加入 Supabase Data API 的 exposed schemas（若放置於非 `public` schema 亦同）。Client 顯示價格仍用 static bundle 的 `Price`（§8.2），價格真相只在 server 側。

---

## 9. Existing Entitlement migration plan（必補 gap C）

本節定義 **bounded migration contract / follow-up scope**，本輪不做 production DB migration。

### 9.1 現況（ECPay-specific coupling）

- DB：`supabase/migrations/0001_accounts.sql` 的 `book_entitlement.provider` 有 `check (provider in ('manual','ecpay'))`。
- TypeScript：`src/lib/persistence/types.ts` 的 `EntitlementProvider = 'manual' | 'ecpay'`。
- 現有 schema 缺少 refund / revoke audit 所需資訊（無 `status`、`revoked_at`、`revocation_reason`、`source_order_id`）。

### 9.2 Target representation（provider-neutral）

```text
entitlements（target shape，provider-neutral）
  id
  user_id
  book_id
  source_order_id        # payment-provider neutral source order reference
  provider               # 'manual' | 'ecpay' | ...（新 provider 加值即擴充，無 CHECK 硬編碼單一 provider）
  provider_ref           # opaque generic grant provenance（例如 manual 授予的 operator 註記；不是 provider 交易參考）
  status                 # active / revoked
  granted_at
  revoked_at nullable
  revocation_reason nullable   # e.g. 'refund'
  unique (user_id, book_id)
```

**不得有 `ecpay_trade_no` 等 provider-specific 欄位。** `provider_ref` 保留為 generic grant provenance（例如 `manual` 授予的 operator 註記）；provider 交易參考（`MerchantTradeNo` / `TradeNo`）只存在 `payments.provider_*`。`#7` 已明確要求 ownership interface 不綁 ECPay。

### 9.3 Bounded migration plan

1. **Provider-neutral source/provider representation**：放寬 `book_entitlement.provider` CHECK 與 `EntitlementProvider` union，改為 provider-neutral（可列舉新 provider，或改為通用字串＋domain 校驗）。此步不涉及 FK。
2. **Existing data compatibility**：既有 `('manual','ecpay')` 資料可無損遷移；`manual` / `ecpay` 保留為合法值。
3. **Commerce tables 先建立**：建立 `orders` / `payments` / `refunds` / `payment_events`（§12）與 finance read model（§14）——`entitlements.source_order_id` 的 FK 才能存在。
4. **Entitlement active/revoked semantics**：新增 `status`（`active` / `revoked`）；既有 grant 全部視為 `active`。
5. **Source order/payment reference**：在 `orders` 表存在後，新增 `source_order_id`（nullable first）＋ FK constraint，讓 entitlement 對回 Order/Payment，provider-neutral。
6. **Refund → revoke transition**：新增 `revoked_at`、`revocation_reason`；revoke 由 orchestration 在 provider-confirmed refund 後觸發（見 §7）。
7. **Backfill**：既有資料 `status='active'`、`source_order_id=null`（歷史 manual grants 無對應 order）。
8. **Migration ordering 總則**：先建立被 reference 的 commerce tables，再加 FK；`source_order_id` 先 nullable 再補 constraint；同步更新 `grant_entitlement` 函式簽章與 `EntitlementProvider` / `Entitlement` type。不做 destructive migration；不 drop 既有欄位。

本輪只定義 contract / follow-up scope。實際 migration 是 #9（或 #9 內 bounded migration）的實作範圍。

---

## 10. Adapter boundary

### 10.1 Responsibility 切分

**PaymentProvider adapter** 只負責：

- initiate provider interaction（建立 checkout 指令）
- verify authenticity/signature（例如 ECPay `CheckMacValue`）
- parse provider payload（form 解析等）
- normalize verified provider event → `VerifiedProviderEvent` / `ProviderPaymentSnapshot`
- provider-specific query / refund operations

**Application/payment orchestration** 負責：

- state transitions（`created/pending/verification_pending/succeeded/failed/...`）
- persistence（durable event、conditional state transition）
- idempotency / duplicate / replay handling
- amount/currency/order validation
- entitlement side effects（grant / revoke）
- reconciliation

**Adapter 不得直接自行更新 `Order` / `PaymentAttempt` / `Entitlement`。** adapter 只回傳 normalized 結果；state mutation 一律由 orchestration 執行。

### 10.2 Adapter interface（#9 實作 target）

```ts
export interface PaymentProviderAdapter {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutInstruction>;
  verifyCallback(request: ProviderCallbackRequest): Promise<VerifiedProviderEvent>;
  confirmPayment(event: VerifiedProviderEvent): Promise<ProviderPaymentSnapshot>;
  refund(input: RefundInput): Promise<ProviderRefundResult>;
  reconcile?(input: ReconciliationRange): Promise<ProviderReconciliationData>;
}
```

Normalized types：

```ts
// Provider registry：隨 approved adapter 擴充（已定案：ecpay = first TWD adapter；paypal = USD primary per #21；newebpay / stripe = conditional future）。
type PaymentProvider = 'ecpay' | 'newebpay' | 'stripe' | 'paypal';
type PaymentStatus =
  | 'created' | 'pending' | 'verification_pending'
  | 'succeeded' | 'failed' | 'duplicate_success' | 'refunded';

interface ProviderPaymentSnapshot {
  provider: PaymentProvider;
  merchantReference: string;
  providerPaymentReference?: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'unknown';
  amount: Money;
  paidAt?: Date;
  rawStatusCode?: string;
}
```

ECPay implementation：`createCheckout` → AioCheckOut/V5 + CheckMacValue；`verifyCallback` → CheckMacValue + callback parse；`confirmPayment` → QueryTradeInfo/V5 + response CheckMacValue；`refund` → current-card-state query + `N` / `E+N` / `R`（MVP feature-gated）；`reconcile` → FundingReconDetail。

NewebPay implementation 可以把同一 boundary 映射到其最新官方幕前支付整合的 MPG、Query、Cancel、Close/refund API，而不用改 Order 或 Entitlement。Stripe 也只能成為另一個 adapter；任何 Stripe-specific object ID 都只能存在 `payments.provider_*` 欄位，不得進 entitlements。

---

## 11. Domain model & state machines

### 11.1 Flow

`PurchaseIntent → Order → PaymentAttempt → PaymentProviderAdapter → verified provider event → Entitlement`

### 11.2 Payment attempt 與 Order 必須分開

一個 Order 可以有多個 Payment attempts。ECPay 要求每個 `MerchantTradeNo` 不可重複；使用者付款失敗後重新 checkout 時，**不應修改舊 ECPay transaction 後再重送相同 `MerchantTradeNo`**，應建立新的 Payment attempt 與新的 `MerchantTradeNo`。

```text
Order O1: book-abc, TWD 790
 ├─ Payment P1 / ECPay BJH...001 -> failed
 ├─ Payment P2 / ECPay BJH...002 -> pending（abandoned checkout；由 repair loop 解析）
 └─ Payment P3 / ECPay BJH...003 -> succeeded
                                    ↓
                             Entitlement active
```

未來 Stripe / 藍新也很自然：

```text
Order O2
 ├─ Payment P4 / ecpay
 └─ Payment P5 / newebpay
```

domain 不需要知道是哪個 provider 最後成功。

### 11.3 State machines

```text
Order.status:      pending → paid → refunded
                   pending → cancelled
                   （paid 不再回到 failed；晚到的 failed callback 不得將 succeeded 降回 failed）

PaymentAttempt.status（單一 persisted vocabulary）:
  created / pending / verification_pending / succeeded / failed / duplicate_success / refunded
  created → pending → verification_pending → succeeded
                 ↘ failed（terminal；可建立新 attempt 重試）
  succeeded → refunded（orchestration 於 provider-confirmed refund 後更新，見 §7）
  succeeded（第二筆真的刷卡成功）→ duplicate_success（finance review queue，不建立第二 entitlement）
  abandoned checkout 不新增 status：attempt 留在 pending，由 repair loop（§6 Layer B）以 QueryTradeInfo 解析為 succeeded / failed
  `review_required` 不是 payment status——它是 finance anomaly/review queue 的 metadata，與 `duplicate_success` 分開模型

Entitlement.status: active → revoked（refund / manual revoke，保留 audit row）
```

---

## 12. Data model（最小可用 DB contract）

以下不是把 ECPay schema 抄進 DB，而是 Business Japanese Hub 自己的 commerce ledger。

### orders

| Field | Contract |
| --- | --- |
| `id` | UUID / internal opaque ID |
| `user_id` | purchaser |
| `book_id` | purchased Book |
| `item_name_snapshot` | 購買當時書名 |
| `published_revision` | 購買當下 catalog 的 immutable published snapshot id（§8.3；辨識實際售出的出版版本） |
| `amount` | immutable domain amount（canonical `Money`，§8） |
| `currency` | ISO-like code，MVP=TWD |
| `status` | pending / paid / refunded / cancelled |
| `created_at` | local creation |
| `paid_at` | nullable |
| `refunded_at` | nullable |

價格必須由 server 讀 Book/Product record。Client 只能送 `book_id`，不能送可信的 `price`。

### payments

| Field | Contract |
| --- | --- |
| `id` | internal payment attempt ID |
| `order_id` | FK |
| `provider` | ecpay initially |
| `provider_merchant_ref` | ECPay `MerchantTradeNo` |
| `provider_payment_ref` | ECPay `TradeNo`, nullable until known |
| `amount` | immutable |
| `currency` | TWD for ECPay |
| `method` | credit |
| `status` | created / pending / verification_pending / succeeded / failed / duplicate_success / refunded |
| `provider_status_code` | e.g. ECPay RtnCode, opaque to domain |
| `provider_status_message` | sanitized |
| `created_at` | |
| `paid_at` | |
| `last_verified_at` | |
| `provider_fee_amount` | nullable, informational until recon |
| `reconciliation_status` | nullable / matched / mismatch |

ECPay 官方要求保留 `TradeNo` 與 `MerchantTradeNo` 的關聯，這正好對應 `provider_payment_ref` / `provider_merchant_ref`。

### refunds（退款事實來源，§7）

| Field | Contract |
| --- | --- |
| `id` | local refund ID |
| `payment_id` | FK |
| `provider` | inherited / explicit |
| `provider_refund_ref` | nullable, provider-specific |
| `amount` | MVP 必須等於 refundable full amount |
| `currency` | |
| `status` | requested / processing / succeeded / failed |
| `reason_code` | normalized |
| `requested_by` | operator user id |
| `provider_status_code` | nullable |
| `requested_at` | |
| `completed_at` | nullable |

### entitlements（target shape，§9）

| Field | Contract |
| --- | --- |
| `id` | |
| `user_id` | |
| `book_id` | |
| `source_order_id` | payment-provider neutral |
| `provider` | 'manual' / 'ecpay' / ... |
| `provider_ref` | opaque generic grant provenance（operator 註記）；不是 provider 交易參考 |
| `status` | active / revoked |
| `granted_at` | |
| `revoked_at` | nullable |
| `revocation_reason` | nullable |
| unique `(user_id, book_id)` | |

**不得有 `ecpay_trade_no` 等 provider-specific 欄位。** provider 交易參考（`MerchantTradeNo` / `TradeNo`）只存在 `payments.provider_*`；`#7` 已明確要求 ownership interface 不綁 ECPay。

### payment_events（reliability，MVP 必須）

| Field | Contract |
| --- | --- |
| `id` | |
| `provider` | |
| `payment_id` | nullable |
| `provider_merchant_ref` | |
| `event_fingerprint` | verified callback canonical payload 的 SHA-256 |
| `event_type` | |
| `signature_valid` | |
| `sanitized_payload_json` | 只 allowlist 財務／狀態欄位 |
| `received_at` | |
| `processed_at` | |
| `processing_result` | |
| UNIQUE `(provider, event_fingerprint)` | |

`sanitized_payload_json` 只 allowlist 財務／狀態欄位。不要「為了 debugging」把所有收到的 provider payload 永久原樣 dump 進 DB。

### 明確不保存

`card_number`、`PAN`、`CVV`、`card_expiry`、3DS password / OTP、ECPay `HashKey`、ECPay `HashIV`、merchant login password。

AioCheckOut 是導轉至 ECPay payment page 的方案，配合 `NeedExtraPaidInfo=N`，payment DB 只保存 provider transaction references 與財務狀態即可。

---

## 13. Idempotency（至少四層）

ECPay 官方要求 duplicate callback 要安全處理；Business Japanese Hub 應再從 DB constraints 做 defense in depth。

| 層 | Constraint |
| --- | --- |
| Payment attempt | `UNIQUE(provider, provider_merchant_ref)` |
| Provider transaction | `UNIQUE(provider, provider_payment_ref)` when non-null |
| Callback receipt | `UNIQUE(provider, event_fingerprint)` |
| Ownership | `UNIQUE(user_id, book_id)` |

- ECPay 沒有像某些 webhook provider 一樣提供獨立 event ID，因此 `event_fingerprint` 可由已驗證 callback canonical payload 做 SHA-256；**但不能只靠 fingerprint 防止 double fulfillment**。真正 entitlement guarantee 必須靠 state transition + unique entitlement constraint。
- 交易更新採 conditional state transition + `ON CONFLICT`（見 §6/§7 的 transaction 模式）。
- 已 `succeeded` 的 Payment 收到相同 callback 就 no-op；不可因晚到的 failed callback 將 `succeeded` 降回 `failed`。
- **double charge**（兩個 payment attempts 都真的刷卡成功）不是 duplicate webhook：第二筆 Payment 照實記成 `succeeded`，但 Order 已由第一筆完成；不得建立第二份 entitlement，而是標成 `duplicate_success`（進 finance anomaly/review queue），進行退款。**只有第一筆 qualifying successful payment 會呼叫 `grant_entitlement`；`duplicate_success` 處理不得再次呼叫 grant upsert，也不得覆寫既有 entitlement 的 `provider_ref` / `granted_at` provenance。** 這是 multi-attempt payment model 才能正確表達的情況。

---

## 14. Finance dashboard / operator visibility

- **不要把「兩個人都能看財務」解成「兩個人共享 ECPay 主帳密」。**
- 正確設計：Tachiko / David 各自 `business-japanese-hub` app identity，server-side authorization 決定 `/admin/finance` 能否存取，背後是共享的 internal finance dashboard（commerce database）。
- 當需要 provider-level 操作時：ECPay 官方後台提供「廠商後台子帳號」，為不同權責人員建立專用帳號、個別設定功能權限與雙因子驗證；**不是共享主帳密**。ECPay portal 定位成 break-glass / provider-specific operations / manual refund / investigation；internal finance dashboard 才是 daily operational visibility。
- 最低顯示：sales summary、orders、payments、refunds、entitlement、reconciliation、provider health。
- 「營收」與「實際撥款」不要混成一個數字：verified successful payments = gross sales；refund success = refunded sales；provider fee 與真正 settlement/payout 以 reconciliation 資料為準。
- 權限最少分 `finance_viewer`（read orders/payments/refunds/reconciliation）與 `finance_admin`（read + request/refund operational actions + resolve reconciliation anomalies）。任何退款或人工 reconciliation override 寫入 `admin_audit_log`（actor、action、entity_type、entity_id、before/after state、created_at）。

---

## 15. Security & secrets

環境變數（僅存在 server-side secret/environment config）：`ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV`。

**Absolutely forbidden：** `NEXT_PUBLIC_ECPAY_HASH_KEY` / `VITE_ECPAY_HASH_KEY`、client-side signature generation、committed production `.env` secret、logs 含 `HashKey`/`HashIV`、共享 ECPay merchant password、PAN/CVV persistence。

Operational logs 只能含：local order id、local payment id、provider、`MerchantTradeNo`、`TradeNo`（when available）、normalized state、RtnCode、callback/event fingerprint、verification/reconciliation result、timestamp。無 secret、無 card data。

---

## 16. Sandbox contract

- ECPay 有獨立 stage vendor backend、stage MerchantID/HashKey/HashIV、一般與海外信用卡測試卡、固定 3D OTP=`1234`；正式環境憑證要從正式廠商後台「系統設定 → 系統介接設定 → 介接資訊」取得。stage 與 production credentials 不可混用。
- 測試要區分兩件事：
  1. 真正的 stage test-card purchase 可以測完整 checkout → card flow → verified payment path。
  2. 廠商後台「模擬付款」只適合測 `ReturnURL` 是否可收到；官方明確標示它產生 `SimulatePaid=1`，不是真的付款，**不能拿來測 entitlement grant**。
- `ReturnURL` 必須可從公網存取；ECPay 官方測試說明只支援 callback 到 80/443 port。本機測試應用真正的 HTTPS dev/staging endpoint，而不是只在 localhost 測。
- ECPay refund API 沒有可用 sandbox（無法真實授權）；MVP 預設「operator 於 portal 手動退款 + 對帳確認」，這要寫進 #9 的測試矩陣與 operator 文件。

---

## 17. 日本／海外客戶與 JPY / USD provider path

### 17.1 日本客戶使用 ECPay 的可行性

- 技術上 ECPay 對日本市場可行：AioCheckOut 的 `Language` 直接支援 JPN。
- **但 ECPay 交易金額仍是 TWD。** `AioCheckOut TotalAmount` 官方要求整數且僅限新台幣；即使日本使用者看到日文 checkout，ECPay order 仍必須建立 TWD 金額，不能把 JPY 3,000 當作 `TotalAmount=3000` 的 JPY 交易。domain 保留通用 currency；ECPay adapter 必須 assert `if (payment.currency !== 'TWD') throw new UnsupportedCurrencyForProvider('ecpay')`。
- **日本發行的信用卡屬海外卡**；既有 ECPay merchant 必須已開通海外卡收款。ECPay 官方目前明確表示只有特約賣家能開啟「海外（國外）信用卡交易」；一般賣家可收台灣卡。所以「我們有 ECPay 帳號」不等於「日本信用卡已可刷」——這是 production 前由 David 在現有 merchant account 確認的第一個 account-level gate。
- 海外卡退款多一層商業風險：官方警告海外卡原交易取消、全額／部分退刷可能產生匯率浮動價差等相關費用。
- AioCheckOut 官方提醒 iOS 內 Facebook/LINE 等 in-app browser 可能導致 POST ECPay checkout 失敗；前端應直接 full-page form POST，而不是 iframe/modal hack，並在偵測到問題時提示「請使用系統瀏覽器開啟」。

### 17.2 JPY / USD provider recommendation

- **JPY 主要路徑：Stripe JP（JP merchant）＋可選啟用 PayPay。** 前提是未來 merchant legal entity 有日本資格（受 #11 決定）；若 entity 仍是台灣，不能假設可開 Stripe Payments。替代路徑：PayPal 日本商戶接受 JPY（跨境計費，費率較高）。
- **USD 主要路徑：PayPal**（全球多幣種收款，支援 USD；跨國交易手續費 4.40% + 固定費）。
- 兩者都受 merchant / entity 資格 gating；**provider-selection 所需事實與 bounded adapter scope 見 §18 / §22，consumer/refund legal obligations 由 #11 處理。**

---

## 18. PayPal provider-selection facts（factual correction）

初版「數位商品一律沒有 Seller Protection」說法**過時且不精確**。依現行（2026）官方政策修正為：

- **Intangible / digital goods 可能符合 Seller Protection。** PayPal 已將 Seller Protection 延伸至無形商品；eligibility 是**條件式**：
  1. 交易在 PayPal Transaction Details 標示為 **eligible / partially eligible**（或 PayPal 以書面通知該 business category 符合資格）；且
  2. 能提供 **fulfilment/delivery evidence**——對無形商品指「compelling evidence」：例如連結到買家的 timestamped delivery email、download/access log（含 IP、時間、檔案）、member-area 登入／授權金鑰使用記錄、checkout 時接受的 terms/refund policy。證據必須可直接連結到特定買家（name / email / PayPal transaction ID / invoice ID），generic aggregate log 不足。
- **相關 exclusion 分開描述：**
  - **SNAD（Significantly Not as Described）claims 不在 Seller Protection 保障內**——這是數位商品最常見的爭議類型，屬於獨立風險。
  - 2024 起 PayPal 對直接向發卡行申訴的 chargeback 不再套用「未收到商品」的 Seller Protection 覆蓋。
  - 爭議視窗為 180 天。
- **低價數位商品另有自動 reversal 風險（與 Seller Protection 無關）：** PayPal Digital Goods Micropayments 相關條款允許對低於門檻的數位商品交易（例如 TWD 240、JPY 999）在特定條件下自動反轉交易。這是獨立的低價數位商品風險因子。
- 其他 provider-selection 事實：PayPal 支援 TWD / JPY / USD；台灣商家跨國交易手續費 4.40% + 固定費；具備 Sandbox、full/partial refund、Webhook。

只修正 provider-selection 所需事實，不把 #8 擴張成法律研究；consumer / refund legal obligations 仍由 #11 處理。

---

## 19. Test matrix（#9 關閉前必須）

| Test | Expected |
| --- | --- |
| stage card successful purchase | exactly one entitlement |
| browser success before callback | UI pending, no entitlement |
| forged browser result | no entitlement |
| forged callback CheckMac | rejected |
| callback wrong amount | no entitlement |
| callback unknown MerchantTradeNo | no entitlement |
| `RtnCode != 1` | no entitlement |
| `SimulatePaid=1, RtnCode=1` | no entitlement |
| same callback twice | one payment transition, one entitlement |
| callback four times | same |
| Query says unpaid | no entitlement |
| callback says paid, Query unavailable | `verification_pending` |
| later Query confirms | entitlement granted exactly once |
| user retries failed checkout | new Payment + new `MerchantTradeNo` |
| two payment attempts both actually succeed | one entitlement + duplicate-charge finance alert |
| refund confirmed | entitlement revoked once |
| already-owned book purchase CTA | backend refuses / returns owned state |
| stage secrets never work against production config | fail |
| client modifies price | ignored / rejected |
| unauthenticated finance access | denied |
| normal authenticated customer visits finance API | denied |

`SimulatePaid=1` 必須特別覆蓋，因為 ECPay 警告它可攜帶 `RtnCode=1` 但仍不代表收到款項。

---

## 20. Production go-live unknowns（不阻塞 coding #9，但 production checkout 開啟前必須解掉）

| Unknown | Required decision / confirmation |
| --- | --- |
| Existing ECPay account type | 確認實際 merchant 已啟用 AioCheckOut credit-card payments |
| Overseas cards | 若日本是 launch market，確認帳戶是合格特約賣家且「海外信用卡交易」已開通 |
| Merchant credentials | 從 provider backend 取得 production MerchantID / HashKey / HashIV；不得貼進 issue/PR |
| Separate operators | 建立 David + Tachiko ECPay 子帳號，least privilege，不共享主帳密 |
| Refund automation | stage 無法測試實際 refund API；MVP 預設 manual ECPay refund + reconciliation，或 production 小額 controlled smoke test 後才啟用 API refund |
| Auto-close timing | 官方文件不一致；不編碼固定關帳時間，refund 前一律 query 目前 state |
| Chargeback / dispute lifecycle | 官方沒有可安全設計的 dispute webhook；視為 provider-portal / reconciliation 操作，直到 ECPay 確認 account-specific contract |
| E-invoice / tax | #8 本身把 Taiwan invoice/tax 視為獨立決策；payment success 不代表 invoice obligations 已解決（#11） |
| Stripe | 不在台灣 merchant assumption 下排 Stripe implementation，未重新確認 merchant-country eligibility 前不排 |

以上都不要求 ECPay 滲透進 domain architecture；它們是 environment / account / operations gates。

---

## 21. #9 final scope

`#9` 只包含：

- **provider-neutral payment core**：create Order、create/persist PaymentAttempt、route through adapter、persist provider-neutral order/payment/refund state、idempotent verified event processing、grant entitlement exactly once、pending/success/failed/cancelled/refunded states 反映到 storefront/book detail/library。
- **ECPay first TWD adapter**：AioCheckOut V5 + CheckMacValue + ReturnURL callback verification + QueryTradeInfo confirmation + duplicate/replay-safe handling + sandbox/production credentials separation + MVP refund/revocation policy。
- **sandbox / test integration**：stage card purchase path、test matrix（§19）。
- **operator read model**：orders / payments / refunds / entitlements / reconciliation（§14）。
- **bounded entitlement/payment migration required for implementation**：§9 的 migration plan 是 #9 前置資料層工作。

`#9` 不含 JPY/USD adapter（各自是獨立 bounded issue，§22）；`#9` 不等於完成 multi-currency launch。

---

## 22. Follow-up adapter issues

依本決策記錄的 recommendation，建立真正的 bounded JPY / USD adapter issues（不用 `#9.1` 之類 pseudo issue；不自動建立 NewebPay issue——NewebPay 只有在 final recommendation 需要近期支援時才列，目前列為 conditional next）：

1. **JPY adapter**：以「Stripe JP（＋PayPay via Stripe）」為主要路徑、PayPal JP 為替代；precondition = merchant/entity eligibility（#11）。Scope 對齊 #9：實作該 provider 的 `PaymentProviderAdapter`（createCheckout / verifyCallback / confirmPayment / refund / reconcile）＋ sandbox/test integration，並以本 decision record 為 contract。
2. **USD adapter**：以 PayPal 為主要路徑；scope 同上，provider-neutral core 不重寫。

---

## 23. Readiness（final #8 verdict）

分開判定，不用模糊的 `READY FOR #9`：

- **`PROVIDER-NEUTRAL CORE: READY`**
  Order / PaymentAttempt / Refund / Entitlement、四層 idempotency、adapter contract、sequence、三層 reconciliation 皆已定義且可實作；補上 §7（refund source of truth）、§8（Money）、§9（migration）後即可無歧義執行。
- **`ECPAY SANDBOX IMPLEMENTATION: READY`（一個已知限制）**
  Stage endpoint、測試卡、`SimulatePaid`、QueryTradeInfo stage 都已驗證存在；**但 ECPay refund API 測試環境無法做真實授權（官方明示），refund 自動化無法在 sandbox 驗證**——MVP 已正確預設「operator portal 手動退款 + 對帳確認」，需寫進 #9 測試矩陣與 operator 文件。
- **`SERVER EXECUTION BOUNDARY: READY`（#9 unblocker）**
  Server-only boundary 定案為 Supabase Edge Functions（§3.5）；**ingress contract 已定稿**（deployed `/functions/v1/<function-name>` mapping、`verify_jwt` 僅對 public handler 關閉）；secrets 管理、service-role persistence、authenticated finance access、pg_cron durable retry/reconciliation 均已定義；authoritative price seam（`catalog`）已鎖定（§8.3，含 released-only read、`published_revision` snapshot、no-read boundary）。
- **`PRODUCTION PAID LAUNCH: NOT READY`**
  既有 ECPay 帳戶的 AioCheckOut 信用卡資格、海外卡是否開通（特約賣家）、正式憑證、子帳號/2FA、e-invoice/稅務與 entity 結構（#11）都未定。這些不阻塞 core architecture implementation（§21），但必須在 production checkout 開啟前全部解掉。

---

## 24. Sources

- ECPay Developers｜綠界科技：API技術文件 — https://developers.ecpay.com.tw/
- 產生訂單（AioCheckOut） — https://developers.ecpay.com.tw/2862/
- 付款結果通知 — https://developers.ecpay.com.tw/2878/
- 全方位金流付款 — https://developers.ecpay.com.tw/2864/
- 檢查碼機制說明 — https://developers.ecpay.com.tw/2902/
- 查詢訂單（QueryTradeInfo） — https://developers.ecpay.com.tw/?p=2890
- 信用卡請退款功能 — https://developers.ecpay.com.tw/2885/
- 下載信用卡撥款對帳檔（FundingReconDetail） — https://developers.ecpay.com.tw/2898/
- 測試介接資訊 — https://developers.ecpay.com.tw/2856/
- 廠商後台子帳號 — https://support.ecpay.com.tw/7494/
- 母子特店雙因子驗證設定說明 — https://support.ecpay.com.tw/19345/
- 信用卡交易設定 — https://support.ecpay.com.tw/4839/
- Stripe global availability — https://stripe.com/global
- 藍新金流 API 文件下載 — https://www.newebpay.com/website/Page/content/download_api
- PayPal Seller Protection（官方政策，2026 update） — https://pep.paypal.com/legalhub/paypal/seller-protection
- PayPal Digital Goods Micropayments Purchases Agreement — https://www.paypal.com/ca/legalhub/paypal/digital-goods-micropayments-agreement

---

*相關文件：`docs/accounts-and-entitlement.md`（entitlement boundary）、`docs/product-contract.md`（product contract）、`AGENTS.md`（implementation guidance）、[research-v1-superseded.md](research-v1-superseded.md)（已取代的 6 頁初版研究）。*
