# 私有 production content 與 server delivery

> **狀態：#132 的 forward-only delivery contract**

公開的 `business-japanese-hub` repository 是 platform/runtime/tooling；它不是 proprietary production learning content 的 canonical source。這個規則適用於原創 SPI/Web Test 題庫、Learn lesson、workplace vocabulary、Business Reading 的教學分析、Plus long-form source、資產、editorial draft/review 與私有 release history。

已在公開 Git history 的 Book、snapshot 與 asset 已經 disclosed。不要因為刪檔或搬檔而宣稱它們重新變成秘密，也不要重寫 history。它們的 inventory 固定於 [`.content-boundary/legacy-books.json`](../.content-boundary/legacy-books.json)：`email-manners`、`keigo-essentials`、`meeting-japanese`。這些 legacy release 繼續讓 Reader 與 historical Book commerce/audit 正常運作。

## Canonical private source

目前選定的 canonical authoring remote 是私有的 [`nurockplayer/business-japanese-hub-content`](https://github.com/nurockplayer/business-japanese-hub-content)。它與公開 platform repo 分開 checkout；production body、assets、research、review records 與 release history 都只可存在那裡或已核准的 private editorial systems。

該 remote 現由 `nurockplayer` 管理，而公開 repo 位於 `davidkao-official`；轉移 ownership、擴授 collaborators 或配置 deploy credentials 都需要相應 owner 的明確操作，不能由 public-repo CI 假設或印出。該 source repo 已包含 admitted 的 proprietary SPI corpus/release；它仍維持 private，尚未 production-import、member-activate，亦未暴露至 public repo 或 frontend artifacts。

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

`content-delivery` 讀取獨立的 server-only `plus_membership_access` projection；只有 verified user 且 projection 為 active、未過期時才會查詢/回傳 payload。缺少、過期、撤銷或其他 non-qualifying 狀態回傳 `403 active membership required`；projection query 失敗回傳 truthful `503 membership access unavailable`。browser request、local storage 或 client flag 永遠不能取得 payload。

私有資產目前沒有 server-delivery adapter；proprietary assets 不得暫時改走 `content-dist/assets` 或 Vite。private Book importer 會 fail closed，拒絕含 `cover` 或 `image` block 的 payload；擁有私有資產的 bounded runtime 必須先提供同等 server-authoritative asset authorization、immutable revision coverage 與 tests。

## Legacy static workflow is deliberately legacy-only

[`docs/authoring.md`](authoring.md) 所記錄的 `books/ → content-dist/ → Vite` 工作流只保留給上述 disclosed legacy Books。它的 full snapshot、asset 與 eager Vite import 因此不能作為 future Plus/member content delivery pattern；historical Book catalog price/audit projection 仍維持。

`pnpm check:public-content-boundary` 是 CI guard：它比較 `books/`、`content-dist/books/` 與 legacy asset directories 對 allowlist，並以 committed SHA-256 inventory 固定每個 legacy source、release、asset、learning catalog 與 Vite `public/` 檔案，同時驗證 Reader 的 static glob 沒有 private source/release store dependency。加入或更動 static public Book 必須刻意更新 inventory 並在 PR 說明其 non-proprietary/disclosed status；不能默默讓 #114/#125/#126 的 production corpus 走進 bundle。

對 Practice/Web Test，這個 source-control guard 也會在整個公開 checkout fail closed：四個 reserved authoring filename（`practice-question-bank.json`、`practice-question-bank.csv`、`practice-question-bank-base.json`、`practice-questions.csv`）以及帶有 documented question-bank／authoring CSV 結構的 renamed artifact 都不得存在。CSV adapter 接受 UTF-8 BOM，但不放寬其他 header 或 schema validation。這是 public-Git admission，不是對 developer machine 上任意 sibling path 的 artifact-isolation 證明。

Frontend artifact isolation 的 authority 是 clean hosted checkout：GitHub exact-head／merge-result CI 為 source/test admission，Cloudflare Pages clean checkout build 為目前 topology 的 authoritative frontend artifact build。private canonical content repository 必須不被 mount、checkout、copy 或以任何方式提供給這些 hosted frontend build environments。local build 的用途僅限 functional、visual 與 smoke QA；不得以 Vite/Rollup provenance、CSS/HTML/resource parser 或 local success 宣稱已證明 private artifact isolation。Cloudflare dashboard/project settings 是 external deployment evidence，public repo 無法自行證明其 mount topology；對任何 deploy setting 變更或 admission，owner 必須確認這項 clean-hosted-checkout contract。

## Issue reconciliation

- **#114**：original SPI questions、answers、explanations、review/provenance 與 source research 都在 private source；public repo 僅放 question schema/validator/converter/import tooling 與 small non-proprietary fixtures。36–48 題不得在此 repo 或 preview bundle 建立。
- **#125**：Business Reading article/analysis corpus 在 private source；公開端擁有 Read renderer、domain contract/tooling 以及 necessary non-proprietary example fixture。
- **#126**：workplace lessons/vocabulary corpus 在 private source；公開端擁有 Learn presentation、domain contract/tooling 以及 necessary non-proprietary example fixture。

這不建立第二 backend、microservice 或新的 cross-product content schema；它只在 one shared Supabase modular monolith 中增加 server-only delivery primitive。沒有 production source、member projection、approved private asset path 或 external delivery credentials 時，狀態是 unavailable/blocked，不得以 public fixture 假裝已發布。

## #114 Practice / Web Test private authoring path

`PracticeQuestionBank` 是 Practice runtime 自己的 schema，不是 `Book`、Career Game 或 learning evidence 的替代 schema。第一個 test family 可標記為 `spi`，但 `testFamily`、`deliveryProfile` 與 `practiceProfile` 都是可延展的內容欄位；不得把「外國人」或中文 support 寫成 core identity。日文題幹／解答是 core，`zh-Hant` support overlay 則以 question ID、question version 與 overlay version 個別釘選。

私有 checkout 的最小操作如下。這些命令只讀寫 public repository 之外的檔案，且不會印出題幹、選項或解說：

```text
private source: practice-question-bank-base.json + practice-questions.csv
        ↓ pnpm workflow:convert-private-practice-question-csv --source=/absolute/private/practice-questions.csv --output=/absolute/private/practice-question-bank.json
private source: practice-question-bank.json
        ↓ pnpm workflow:validate-private-practice-question-bank --source=/absolute/private --content-id=practice-web-test-spi-v1
        ↓ pnpm workflow:import-private-practice-question-bank --source=/absolute/private --content-id=practice-web-test-spi-v1
service-role-only private_content_release
        ↓ content-delivery Edge Function + verified server-only Plus projection
future bounded Practice renderer
```

CSV 是為 spreadsheet/editorial workflow 準備的 deterministic adapter；rich `answer`、`coreExplanation`、`itemAnalysis`、`provenance` 欄位以 JSON cell 保存，避免為不同 question input type 發明另一套 UI schema。`practice-question-bank-base.json` 保留 bank version 與 vocabulary catalog；converter 將 CSV rows 放入 question bank，之後 validator 才會檢查所有 cross-reference。

受控 import 僅接受 status 為 `released` 的題目，並要求 reviewer、release notes、originality attestation、Japanese prompt/explanation、deterministic answer contract、正確的 category/subcategory、support-overlay vocabulary refs 與禁止 source/recalled/leaked/official-test fields。`targetSeconds` 是 internal practice target；schema 沒有 official-time metadata，帶有這類 field 的 artifact 必須 fail closed。`content-delivery` 使用 server-only `plus_membership_access` projection：只有 active 且未過期才查詢／回傳 payload；missing、expired、revoked 或其他 non-qualifying 狀態回傳 `403` 且不查詢 payload；projection lookup failure 回傳 `503` 且不查詢 payload。browser flag 永遠不能 authorize。這是 delivery primitive；#107 的 recurring lifecycle/commercial/production activation 仍維持其既有邊界。

### #115 public discovery catalog and #116 runner handoff

`/practice/web-test` 的公開導覽只可消費 body-free discovery catalog。它是由已通過 strict released validator 的**外部 private source** deterministic 生成，最小欄位只有 release identity、test family、domain、category、released count 與 content-supported mode；同一 stable question ID 只計入最新 released version。不可包含 question ID、prompt、answer、explanation、vocabulary、review/provenance、private path 或 question-bank shape。公開 catalog 也必須使用 bounded family/category/mode registry；private authoring 的 free-form metadata 不能直接成為 browser label 或 route。

目前第一個 catalog 的受控生成命令如下；revision mismatch、non-released source、unknown family/category/mode 都必須失敗，而不是寫入過期或猜測的 counts：

```text
pnpm workflow:generate-practice-discovery-catalog \
  --source=/absolute/private/spi-v1 \
  --content-id=practice-web-test-spi-v1 \
  --expected-release-revision=<validated release revision> \
  --output=src/practice-web-test/released-discovery-catalog.json
```

Category route `/practice/web-test/:family/:domain/:category?mode=:mode` 是 #115 admitted stable direct-load entry contract：family/domain/category/mode 必須都仍在 catalog 中，未知或 stale selection 一律 fail closed。它只保留使用者的選擇並以 truthful unavailable state 呈現；不得載入題目、開始作答、推定 free/member access 或把 fixture 當 production。#116 才在這個相同 route 接上 interactive runner/scoring；#107 仍是任何 proprietary member payload delivery 的 server-authoritative gate。
