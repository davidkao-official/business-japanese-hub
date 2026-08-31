# Shared Learning Evidence and Product Progress

> **狀態：** #57 durable implementation contract。上位契約為
> [`product-contract.md`](product-contract.md)、
> [`platform-architecture.md`](platform-architecture.md) 與
> [`shared-backend-and-identity.md`](shared-backend-and-identity.md)。本文件不建立
> LMS、mastery score、adaptive curriculum 或 shared presentation model。

## 1. 邊界

Library 與 Career Game 只共用同一個 durable user identity、少量穩定的
workplace-learning skill ids，以及以穩定內容 id 表示的 evidence。產品狀態仍分開：

- Library 的 `reading_state` 仍是 `Book.id + Chapter.id + Block.id/offset`；#57 不改其
  resume 語意。
- Career Game 的 `career_game_progress` 仍是 scenario-owned checkpoint，包含
  `scenario_id`、`content_version`、replay-valid state、pending outcome 與 CAS revision。
- `learning_evidence` 不存 Reader UI、Game UI、原文、對話、feedback、email 或任意
  JSON payload。固定欄位只記 user、skill、product/kind、stable content reference、
  server time，以及 Game 已有的 bounded outcome quality。

`@business-japanese-hub/learning` 是 data-only package。它只定義目前內容實際使用的
五個 stable ids 與 human-readable metadata：

```text
workplace-greeting
request-clarification
deadline-negotiation
meeting-disagreement
error-reporting
```

這不是階層 ontology。新增 skill 必須由已接受的內容需求驅動，更新 package metadata、
server catalog、authoring association 與測試；不得把任意 client tag 寫進 DB。

## 2. Library association registry

Library skill association 寫在 `books/<slug>/manifest.json` 的
`learning.chapters` metadata，以 stable `Chapter.id` 指向 skill ids。它不改
`Book → Chapter → ContentBlock` schema，也不重發或手改 immutable Book snapshot。

`pnpm workflow:update-learning-catalog` 從 manifest 與已 commit 的
`content-dist/books/*/current.json` 產生 deterministic
`content-dist/learning-catalog.json`。每個 released Book/Chapter 都帶 stable id、目前
release id、route slug 與 skill ids；沒有 timestamp 或內容原文。build verification
拒絕未知 Book/Chapter、未知或重複 skill，以及 stale artifact。新書只需內容、manifest
metadata 與既有 generation workflow，不需增加 platform code branch。

Library 的 evidence 語意只有 `chapter_opened`：已驗證 user 開啟一個實際可閱讀章節後，
Library adapter 送出 `{bookId, chapterId, eventId}`。Edge Function 以 committed registry
驗證 reference、derive release id、chapter access 與 skill ids；`access: entitled` 的章節
還必須找到該 verified user 的 active Book entitlement，不能只靠合法 id 偽造已閱讀。
Browser 不提供可信 user、skill、release、access 或 timestamp。匿名閱讀完全不呼叫此
API，且 evidence failure 不得中斷 Reader。

## 3. Authenticated Career Game progress

匿名流程維持既有 scenario/content-versioned `localStorage` checkpoint，並以 runtime
replay validation fail closed。登入不 import、merge、刪除或覆寫匿名 checkpoint；登出後
重新顯示該端末原有的 guest checkpoint。

登入流程只呼叫 product-owned `career-game-progress` Edge Function。browser 可提出
`load`、`start`、`choose`、`acknowledge`、`reset` action，每個 action 都必須宣告
當前 bundled scenario `contentVersion`，但不可提交完整 GameState、outcome、skill、
meter、history 或 user id。server：

1. 從 bearer JWT 取得 verified `auth.uid()`；
2. 載入 authoritative scenario 與儲存 checkpoint；
3. replay-validate state，並在 server 以 runtime 套用 choice；
4. 從 authoritative outcome derive skill ids、quality 與 stable references；
5. 以 optimistic revision RPC 在同一 transaction 更新 progress 與 evidence。

多分頁／多裝置的 stale action 回傳 conflict，不覆寫較新 checkpoint。`choose` 與
`acknowledge` 都必須同時符合 server 最後回傳的 opaque checkpoint id 與 revision，
因此 reset／再 start 後即使 revision 重新從 1 開始，舊 tab 也不能對 replacement
attempt 行動。Pending outcome 必須先 acknowledge 才能再選；reset 只刪除該
user/scenario 的目前 progress，保留已發生的 evidence。Reset 還必須帶上 server
最後回傳的 stored version、opaque checkpoint id
與 revision；service-only RPC 在 row lock 內三者完全相符才刪除。這使 stale tab 與
先 reset／再 start 的 replacement attempt 都不能被舊 request 刪除。

### Version policy

- client bundled version 不等於 authoritative server scenario version：回傳
  `client-update-required`，UI 只要求完整 reload；不讀取、不提供 reset control，也不刪
  server progress。這是 staggered deploy／stale browser cache policy。
- stored version 等於目前 scenario version 且 replay valid：resume。
- stored version 不同：回傳 deterministic `content-version-mismatch` + `reset-required`，
  附 exact checkpoint CAS identity；UI 只能重置該 exact 舊 checkpoint，不自動 migrate 或盲刪。
- stored state 無法 replay：回傳 `invalid-persisted-progress` + `reset-required`；不把不可信
  state render 成 progress，且同樣需要 exact checkpoint CAS identity 才能 reset。
- 匿名 checkpoint 的版本隔離規則不變。

## 4. Evidence semantics

| Source | Kind | Trusted stable reference | Quality |
| --- | --- | --- | --- |
| Library | `chapter_opened` | Book id + released revision + Chapter id | `null` |
| Career Game | `outcome_reached` | Scenario id + content version + Outcome id | authored `strong` / `mixed` / `risky` |

`source_event_id` 使 retry idempotent；DB uniqueness 防止同一 logical action 重複寫入。
所有 recorded time 都由 server 產生。合法但沒有 `skillTags` 的 Game outcome 仍會正常
持久化 progress，只是不製造 evidence row 或 quality metadata。這一版沒有 derived
summary UI，因此刻意不建立
「最近練習」、推薦、completion aggregate、mastery score 或另一張 materialized read
model。未來只有在有實際 consumer 與 documented deterministic rule 時才新增 read seam。

Library 的一次 `chapter_opened` 以「當前 stable user id + 當前 Book/Chapter mount」為前端
觸發邊界；Supabase token refresh 即使產生新 user object，也不得在章節沒有重新開啟時
製造第二個 event。

## 5. Authorization

`career_game_progress` 與 `learning_evidence` 都開啟 RLS，並搭配 explicit grants：

| Role | Progress | Evidence | Server mutation RPC |
| --- | --- | --- | --- |
| `anon` | none | none | none |
| authenticated owner | SELECT own rows | SELECT own rows | none |
| unrelated authenticated user | zero visible rows | zero visible rows | none |
| finance-role user | only its own rows（ordinary user） | only its own rows | none |
| `service_role` | required server access | required server access | execute |

Browser 沒有 INSERT／UPDATE／DELETE grant；RLS owner policy 使用
`(select auth.uid()) = user_id`。Edge handler 以 service-role client 寫入，但 identity 每次
仍由 verified bearer token derive。RPC 從 `PUBLIC`、`anon`、`authenticated` revoke。

## 6. Cross-product links and deployment boundary

Game 的 `libraryLinks` 只攜帶 stable Book/Chapter/Block ids。canonical Library 的
`/library-link` route 由目前 released catalog 解析成 slug route；未知／被移除／不相符的
target 顯示 unavailable surface，不 crash、不猜 fallback。Game 只產生 canonical Library
origin link；Library 不依賴 Game runtime availability。

Library evidence function沿用 canonical `PUBLIC_SITE_URL` exact-origin CORS。Career Game
function只接受 dedicated optional `CAREER_GAME_SITE_URL` exact origin；未設定時 browser
request fail closed。這個 env seam 不決定 #60 的 production hostname，也不修改 payment
CORS 或 `PUBLIC_SITE_URL`。
