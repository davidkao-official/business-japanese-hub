# Product-validation analytics contract

> **狀態：** #60 bounded operational contract。這不是 analytics warehouse、
> user profile、learning evidence 或 commerce ledger。

## 1. Purpose and trust boundary

這個 contract 只回答 Career Game first-slice 的產品驗證問題：使用者是否看到、開始、
完成或重玩 Case，以及 Library 與 Career Game 之間是否有實際移動。所有事件由 browser
提出，因此只作 directional product evidence；不得用來授權、建立 entitlement、修改進度、
判定付款、計費或建立個人 learning claim。

事件由同一個 Supabase modular monolith 的 `product-analytics` Edge Function 接收，寫入
sanitized structured function logs。它不新增 vendor、warehouse、browser-readable table 或
任意 JSON event store。

## 2. Exact event vocabulary

| Event | Required bounded fields | Meaning |
| --- | --- | --- |
| `case_viewed` | `eventId`, `scenarioId` | 一個有效 Case surface 在本次 page mount 顯示 |
| `case_started` | `eventId`, `scenarioId` | guest state 已建立，或 authenticated start 已由 server 接受 |
| `case_outcome` | `eventId`, `scenarioId`, `outcomeCategory` | 一次有效 choice 已到達 `strong`／`mixed`／`risky` outcome |
| `case_completed` | `eventId`, `scenarioId` | final feedback 已 acknowledge，且本次 attempt 進入 complete |
| `case_replayed` | `eventId`, `scenarioId` | completed attempt 的 reset 成功並回到 Case intro |
| `cross_product_link_clicked` | `eventId`, `scenarioId`, `direction` | 使用者啟動 `library_to_career_game` 或 `career_game_to_library` movement |

`eventId` 是 client 產生的 UUID，只用來在 log export／query 中 `distinct` 去除同一 logical
event 的重複 delivery。Server 使用自己的 timestamp。禁止 user id、email、account/session／
attempt／checkpoint id、choice、原文、feedback、URL、referrer、client timestamp、任意
properties 或 payment／entitlement data。

## 3. Delivery and privacy

- Browser client 是 best-effort、fire-and-forget；失敗不得阻塞 play、Reader 或 navigation。
- Handler 只接受 exact allow-list shape、bounded stable ids、`POST` 與小型 JSON body。
- `verify_jwt=false` 允許 Phase A anonymous validation；事件永遠不可信且不能影響產品 state。
- CORS 只接受 exact `PUBLIC_SITE_URL` 或 exact `CAREER_GAME_SITE_URL`。這是 browser exposure
  control，不是 authentication；無 wildcard，也不改 checkout／payment CORS。
- React StrictMode、rapid repeated input 與 remote conflict/retry 不得製造新的 logical event；
  restored completed progress 也不算新的 completion。

## 4. Small funnel

以 server log timestamp 選定觀察期間，先按 `event_id` distinct，再計算：

```text
start rate       = case_started / case_viewed
completion rate  = case_completed / case_started
replay rate      = case_replayed / case_completed
outcome mix      = case_outcome grouped by outcome_category
cross movement   = cross_product_link_clicked grouped by direction
```

這些是 aggregate interaction counts，不是 unique-user cohort。因為刻意不收 identity／session，
不得把它描述為個人 funnel、留存或 mastery。若未來需要 durable aggregates或 retention，必須先有
明確 consumer、privacy review 與新的 narrow decision；不得把 payload 無限制擴張。
