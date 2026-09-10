# 私有 production content 與 server delivery

> **狀態：#132 的 forward-only delivery contract**

公開的 `business-japanese-hub` repository 是 platform/runtime/tooling；它不是 proprietary production learning content 的 canonical source。這個規則適用於原創 SPI/Web Test 題庫、Learn lesson、workplace vocabulary、Business Reading 的教學分析、Plus long-form source、資產、editorial draft/review 與私有 release history。

已在公開 Git history 的 Book、snapshot 與 asset 已經 disclosed。不要因為刪檔或搬檔而宣稱它們重新變成秘密，也不要重寫 history。它們的 inventory 固定於 [`.content-boundary/legacy-books.json`](../.content-boundary/legacy-books.json)：`email-manners`、`keigo-essentials`、`meeting-japanese`。這些 legacy release 繼續讓 Reader 與 historical Book commerce/audit 正常運作。

## Canonical private source

目前選定的 canonical authoring remote 是私有的 [`nurockplayer/business-japanese-hub-content`](https://github.com/nurockplayer/business-japanese-hub-content)。它與公開 platform repo 分開 checkout；production body、assets、research、review records 與 release history 都只可存在那裡或已核准的 private editorial systems。

該 remote 現由 `nurockplayer` 管理，而公開 repo 位於 `davidkao-official`；轉移 ownership、擴授 collaborators 或配置 deploy credentials 都需要相應 owner 的明確操作，不能由 public-repo CI 假設或印出。這個 source repo 現在只含 workflow 入口，尚未建立或匯入任何 production corpus。

## Smallest proven Book path

`Book` 仍屬 Reader bounded context。公開平台提供它的 existing validator 與一個只處理 Reader Book payload 的 private-source adapter；這不是跨 Learn/Practice/Read 的 universal content schema。

```text
private checkout: book.json + manifest.json
        ↓ pnpm workflow:validate-private-book --source=/absolute/private/book
public Book validator + preview-boundary validator
        ↓ pnpm workflow:import-private-book --source=/absolute/private/book
service-role-only private_content_release
        ↓ content-delivery Edge Function
verified #107 membership projection
        ↓
bounded renderer (future integration)
```

`--source` 必須是公開 repository 之外的 absolute directory；tooling 會拒絕 public checkout 內的路徑。validator 不寫檔到 `books/` 或 `content-dist/`，也不把 title/body 印入 log。import 只在 private checkout + server-only `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 都可用時進行；它不是 public CI、PR preview 或 browser build command。

`private_content_release` 是 immutable、service-role-only 的 **delivery envelope**：它只管理 bounded runtime 已驗證 payload 的 identity/revision/access，而不定義 question、lesson、article、vocabulary 或 game 的 universal schema。新的 runtime 在 import 前必須帶自己的 validator；#114 的 question-bank contract、#125 的 Read contract、#126 的 Learn/vocabulary contract 不得被此 table 取代。

目前 #107 的 authoritative Plus membership projection 尚未實作。因此 `content-delivery` 對任何已驗證 user 都回傳 truthful `503 membership access unavailable`，而且在該狀態不查詢/回傳 payload。這是刻意 fail-closed，不是 active-member claim。#107 必須以 verified server membership projection 替換 resolver，並在有真實 active/non-member/expired evidence 時才把 member release 接到 renderer。browser request、local storage 或 client flag 永遠不能取得 payload。

私有資產目前沒有 server-delivery adapter；proprietary assets 不得暫時改走 `content-dist/assets` 或 Vite。private Book importer 會 fail closed，拒絕含 `cover` 或 `image` block 的 payload；擁有私有資產的 bounded runtime 必須先提供同等 server-authoritative asset authorization、immutable revision coverage 與 tests。

## Legacy static workflow is deliberately legacy-only

[`docs/authoring.md`](authoring.md) 所記錄的 `books/ → content-dist/ → Vite` 工作流只保留給上述 disclosed legacy Books。它的 full snapshot、asset 與 eager Vite import 因此不能作為 future Plus/member content delivery pattern；historical Book catalog price/audit projection 仍維持。

`pnpm check:public-content-boundary` 是 CI guard：它比較 `books/`、`content-dist/books/` 與 legacy asset directories 對 allowlist，並以 committed SHA-256 inventory 固定每個 legacy source、release、asset、learning catalog 與 Vite `public/` 檔案，同時驗證 Reader 的 static glob 沒有 private source/release store dependency。加入或更動 static public Book 必須刻意更新 inventory 並在 PR 說明其 non-proprietary/disclosed status；不能默默讓 #114/#125/#126 的 production corpus 走進 bundle。

## Issue reconciliation

- **#114**：original SPI questions、answers、explanations、review/provenance 與 source research 都在 private source；public repo 僅放 question schema/validator/converter/import tooling 與 small non-proprietary fixtures。36–48 題不得在此 repo 或 preview bundle 建立。
- **#125**：Business Reading article/analysis corpus 在 private source；公開端擁有 Read renderer、domain contract/tooling 以及 necessary non-proprietary example fixture。
- **#126**：workplace lessons/vocabulary corpus 在 private source；公開端擁有 Learn presentation、domain contract/tooling 以及 necessary non-proprietary example fixture。

這不建立第二 backend、microservice 或新的 cross-product content schema；它只在 one shared Supabase modular monolith 中增加 server-only delivery primitive。沒有 production source、member projection、approved private asset path 或 external delivery credentials 時，狀態是 unavailable/blocked，不得以 public fixture 假裝已發布。
