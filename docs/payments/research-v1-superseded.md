# 多幣種支付系統設計與 ECPay 首階段適配決策（6 頁初版）— SUPERSEDED

> **STATUS: `SUPERSEDED`（不具規範效力）**
> 本文件是 6 頁初版 payment research 的 repo 內記錄，明確標記為已取代。**不得作為任何實作的 contract source。**
> Canonical payment contract 以 [decision-record.md](decision-record.md) 為唯一規範來源。

```text
原文件標題：多幣種支付系統設計與 ECPay 首階段適配決策
原文件格式：6 頁 PDF（另存在一份同內容的 deep-research-report.md）
原始位置：~/Downloads/多幣種支付系統設計與 ECPay 首階段適配決策.pdf
取代者：docs/payments/decision-record.md（整理自 29 頁 Engineering Contract，2026-08-14）
取代日期：2026-08-15（#8 research remediation round）
```

## 為什麼被取代

本初版含**規格級錯誤**，經 DeepSeek adversarial review（VERDICT: BLOCKED）逐項驗證後，不能作為 #9 的 production architecture 規格。主要問題：

| 初版錯誤 | 正確 contract（見 decision-record.md） |
| --- | --- |
| 「以 ECPay 回調 (OrderResultURL) 為最終依據」 | `ReturnURL` 才是 authoritative；`OrderResultURL` 只是 browser UX channel（§3） |
| 「解析回調 JSON」 | callback 是 `application/x-www-form-urlencoded`，parse form data（§4.3） |
| 「數位商品銷售不享有賣家保障」（PayPal） | 現行官方政策：intangible/digital goods 可能符合 Seller Protection（條件式）（§18） |
| `ChoosePayment=ALL` | 固定 `ChoosePayment=Credit` 更適合 MVP（§4.2） |
| `PaymentAttempt.status` 含 `PartiallyRefunded` + 獨立 `RefundRecord` 並存 | MVP 只支援 full refund；`refunds` 是退款事實來源（§7） |
| `HandleCallback` 直接更新 PaymentAttempt（adapter 耦合） | adapter 只 verify/parse/normalize；orchestration 負責 state transition（§10） |
| 「Webhook 含 nonce/token（如 ECPay RtnTime）」 | ECPay callback 無 nonce；真正防重放靠 idempotency + event fingerprint（§13） |
| `#9.1 / #9.2 / #9.3` pseudo issues | 真正的 bounded JPY / USD adapter issues（§22） |
| 模糊的 `READY FOR #9` | 三層 readiness 分開判定（§23） |

## 初版仍被保留的結論

以下方向性結論仍有效，並已併入 canonical decision record：

- provider-neutral payment architecture（ECPay 是 adapter，不是 domain）。
- `PurchaseIntent → Order → PaymentAttempt → PaymentProviderAdapter → verified event → Entitlement` flow。
- ECPay 是 TWD 首階段支付管道；其他 provider 為後續擴充。
- browser 結果不能作為付款證據的總體方向。
- 沙盒／正式環境分離、secret 不放 client 等安全原則。

## 保留規範的原則

- 兩套 material contract 並存時，**precedence 一律以 decision-record.md 為準**。
- 任何舊文件（PDF、Markdown、issue 附件）與 decision-record.md 衝突時，以 decision-record.md 為準，並回報 drift。
- 不直接修改／追蹤本 SUPERSEDED 檔作為實作依據；實作只讀 decision-record.md。
