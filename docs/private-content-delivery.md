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
service-role temporal membership resolver
        ↓
bounded renderer (future integration)
```

`--source` 必須是公開 repository 之外的 absolute directory；tooling 會拒絕 public checkout 內的路徑。validator 不寫檔到 `books/` 或 `content-dist/`，也不把 title/body 印入 log。import 只在 private checkout + server-only `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 都可用時進行；它不是 public CI、PR preview 或 browser build command。

`private_content_release` 是 immutable、service-role-only 的 **delivery envelope**：它只管理 bounded runtime 已驗證 payload 的 identity/revision/access，而不定義 question、lesson、article、vocabulary 或 game 的 universal schema。新的 runtime 在 import 前必須帶自己的 validator；#114 的 question-bank contract、#125 的 Read contract、#126 的 Learn/vocabulary contract 不得被此 table 取代。

`content-delivery` 在 verified user 身分後呼叫 service-role-only `resolve_plus_membership_access` RPC。RPC 只取一次 database clock，依有效 initial-start selection key 選 stream，再檢查該 stream 的 server-owned paid windows；缺少 coverage、付款失敗 gap、future start 或 terminal cutoff 都回傳 `403 active membership required`，RPC failure 或 invalid payload 回傳 truthful `503 membership access unavailable`。`plus_membership_state` 和 `plus_membership_access` 是 lifecycle snapshots，不能授權 delivery。browser request、local storage 或 client flag 永遠不能取得 payload。

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

## #125 Business Reading source and publication path

`/read` 現在有一個明確標示為原創、架空、non-proprietary 的 Free 教學範例。它只證明 data-driven Read renderer 與下一步 Learn route；公開 catalog 目前沒有已發布的 Plus Reading 文章，也不能據此宣稱有 production editorial cadence。`src/reading/catalog.ts` 只放可公開的 body-free discovery metadata。正式文章的日文材料、繁體中文教學分析、研究與權利審查紀錄、review notes 和 private release history 均留在上述 private canonical source。

Reading 的 bounded authoring artifact 是 private checkout 內的 `reading-item.json`；public-content guard 會拒絕公開 checkout 中任何同名檔或具完整 Reading authoring 欄位的改名 JSON。它包含 draft/released 狀態、reviewer、release notes、rights basis 與 attestation。`released` 且 rights cleared 的 Plus item 才能用下列命令準備或匯入；`--source` 必須是 public checkout 之外的絕對路徑，symlink 的實際路徑也會檢查。命令不屬於 public CI 或 frontend build：

```text
pnpm workflow:validate-private-reading --source=/absolute/private/reading-item --content-id=<stable-reading-id>
pnpm workflow:import-private-reading --source=/absolute/private/reading-item --content-id=<stable-reading-id>
```

Import 另需 server-only `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`。Validator 將 private authoring fields 去除，只投影 text-only Reading runtime payload，計算 immutable revision 並寫入既有 `private_content_release` 的 `access_scope=member`。目前不接受 private image/cover/asset 欄位；需要資產時先建立有授權的 server delivery path。公開 catalog 的 Plus metadata 要與該 release 的 content ID、revision、title、source、日期等欄位一致；browser 只在 verified active membership 後呼叫 `content-delivery`，並重新驗證 kind、identity、revision 和 runtime 欄位。若 reference 尚未進公開 catalog，匯入本身不會使文章在 `/read` 顯示。

Runtime text 保留 authoring 內的空行作為段落界線、單行換行作為行內斷行；不用 HTML/Markdown 注入文章結構。這使長篇日文材料與繁體中文分析可以維持可讀性，同時維持純文字輸出。

Free production article 不能用 `access: free` 旗標繞過 member-only delivery；除已明確可公開的 non-proprietary fixture 外，Free publication 需要另外核准的 public delivery contract。#171 只為 active Plus member 增加 Reading item 的 server-owned save/remove preference 與 My Learning return seam；它不保存文章 body，也不表示已讀、完成或理解。逐段 resume、comprehension/review evidence、合法可持續的正式 editorial corpus 與 recurring return loop 仍屬 #122；renderer 不會把開啟文章或按下收藏偽裝成學習進度。

`reading_publication` 是 Reading 專用、service-only、body-free 的目前 publication projection。它以 stable item ID 保留單一目前 revision、`free`／`plus` 分類與 `available` 狀態；目前只 seed 原創架空 Free 教學範例。匯入 immutable `reading/member` release 不會建立 publication。受控 `publish_reading_item` 只接受同 ID 的 exact Reading member release；新 revision 取代舊 revision，沒有隱含歷史重疊。`retire_reading_item` 讓 Plus row unavailable。Browser 無法讀寫 projection 或呼叫 publisher。

`save_reading_item` 在 transaction 內以 `FOR SHARE` 鎖定 publication row，並只接受 exact available revision。publication 更新或退休與 save 因此序列化；舊／cached catalog reference 回傳 stale，不能被默默升級到新 body。已存在的舊 save 保留為 member preference，仍可讀取並依 stable item ID 移除；它不代表已讀、完成或理解。HTTP save response shape 維持原欄位，沒有新增 client-facing status 欄位。My Learning 仍只在其 frontend catalog 有 exact revision 時提供 return link。

`content-delivery` 對 immutable release 先讀取不含 body 的 `content_kind`。Reading 類型只會呼叫 service-only `get_member_reading_release` RPC；該 RPC 使用 canonical `resolve_plus_membership_access` temporal membership semantics，並在同一資料庫函式中將 exact available Plus publication 與 exact immutable `reading/member` release join 後才回傳 payload。非會員、缺少／退休／錯 revision、錯 kind 與 RPC failure 都不回傳 body；失敗時沒有 unrestricted payload fallback。Book、Practice 與 Workplace 的 delivery path 保留原有 membership 與 release lookup 行為。

**Production deployment floor:** 第一篇 Plus Reading import／publication 前，必須先從 live Supabase integration evidence 確認 publication migration 與 publication-aware `content-delivery` Edge bundle 已套用。舊版 pre-contract `content-delivery` 會直接以 service role 讀取任何 imported release，不認識 `reading_publication`；所以不得在 Plus Reading 已匯入或發佈後，rollback Edge 到該舊 bundle。Frontend/Edge 與 cached client 混跑時，舊 revision 只會變成 stale/unavailable，不會改指新 body。若需回到比此 floor 更舊的 backend/Edge，必須先另行設計涵蓋所有 content families 的 server read/privilege migration；此 Reading contract 不宣稱任意 rollback 安全。Local/hosted source tests 本身不證明 production migration 或 Edge deployment 已達此 floor，且此文件不代表任何 production import、publication、deployment 或 rollback authorization。

## #126 Workplace Learn and vocabulary source

Workplace Learn 的 lesson 與 vocabulary 使用自己的 bounded schema、strict validator 與 body-free discovery catalog；它們不進入 Book、Reader、Career Game 或 universal content model。公開 repository 中的 Free lesson／vocabulary 是明確標示的原創、架空、non-proprietary 教學範例，不能冒充正式 Plus corpus。正式 workplace 日文、繁體中文解說、editorial review、權利紀錄及 private release history 留在 canonical private source。

Adapter 對每個 private source directory 只讀取 canonical `workplace-item.json`。它必須是 `released`、有 reviewer、rights cleared 的 Plus item，且只能使用 text-only runtime fields；sample、draft、Free 與 asset references 均拒絕匯入。`--source` 必須是公開 checkout 之外的絕對路徑，symlink 的實際路徑也會檢查。先在 private checkout 執行只讀驗證；受控匯入需要 server-only `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`，且不屬於 public CI 或 frontend build：

```text
pnpm workflow:validate-private-workplace --source=/absolute/private/workplace-item --content-id=<stable-workplace-id>
pnpm workflow:import-private-workplace --source=/absolute/private/workplace-item --content-id=<stable-workplace-id>
```

Adapter 去除 publication、reviewer 與 rights 欄位，驗證 bounded runtime，對 `{ workplaceLearn: runtime }` 計算 immutable SHA-256 revision，並以 `workplace-lesson` 或 `workplace-vocabulary`、`access_scope=member` 寫入既有 `private_content_release`。Import 本身不發佈 catalog entry；公開 Plus metadata 必須只指向相同 content id 與 revision，browser 只能在 verified active membership 後透過 `content-delivery` 讀取並重新驗證 payload。缺少 catalog reference、access、release 或合法 payload 時，UI 必須顯示 unavailable，不可回退到 private body 的公開 bundle copy。

Workplace Learn v1 runtime 必須明確提供 `titleLanguage`、`leadLanguage` 與相關內容 `labelLanguage`，值限 `ja`、`zh-TW`、`zh-CN`、`en`；consumer 依欄位標記語言，不可由 item kind、slug 或目前 fixture 推測。標示 `ZhTW` 的解說欄位必須使用繁體中文連續撰寫，不要把日文短語混入中文解說；日文原句、term、讀音保留在各自明確標記的日文欄位。v1 lesson 只能宣告 `practiceTypes: ["rewrite"]`；它對應頁面上明確標示未儲存、未評分的自我改寫欄位，不代表有已持久化 Practice evidence。

#174 的 Workplace save 是 owner-scoped preference，只保存 stable item id、kind、current revision 與 server timestamp，不包含教材或練習文字。Service-only publication projection 是可保存與可返回的 publication authority；immutable private release import 不會自動發布。GET 的 current flag 必須來自該 projection（Plus 另需 exact `workplace-lesson`/`workplace-vocabulary` member release），而 UI 還需將 id/kind/revision/access 與本機 body-free catalog 精確比對才可連結；stale preference 仍可移除。**#124 首次 Plus Workplace publication、revision 變更或 rollback 前**，必須驗證 publication projection、Edge cache、frontend catalog、cached client 與 rollback 的組合：新版本只在明確發布後可保存；舊版/retired save 不可指向新 body；rollback 只恢復明確指定的相容 revision。不得以 private release 存在或舊 Edge/catalog cache 推定 publication。

`check:public-content-boundary` 拒絕公開 checkout 內的 canonical filename、改名後的完整 private authoring JSON、完整 Plus runtime JSON 及其 delivery wrapper。這是 public-Git guard；private artifact isolation 仍以 clean GitHub／Cloudflare hosted checkout 和 owner 確認的 build environment 為準。首次正式 Plus corpus publication、revision 變更與 rollback 必須先確認 frontend、Edge、cached client 對 catalog／release 的相容性；不要把 immutable release 的存在當成當前可發佈狀態。Free production publication 也需要另外的公開來源與權利審查決策，不能靠 `access: free` 繞過 member delivery。

`content-delivery` 對 `workplace-lesson` 與 `workplace-vocabulary` 先讀取不含 body 的 immutable `content_kind`，再只呼叫 service-only `get_member_workplace_learn_release`。該單一資料庫函式使用 `resolve_plus_membership_access` 的 canonical temporal coverage，並以 `workplace_learn_publication` 的目前 `available` Plus revision 和 item kind，join exact immutable `private_content_release`；lesson／vocabulary 分別只接受 `workplace-lesson`／`workplace-vocabulary`。未發布、退休、舊 revision、錯 kind、非會員與 RPC failure 均不回傳 body，且沒有 unrestricted release lookup fallback。Book、Practice 與 Reading 的 delivery routing 維持各自既有 contract；Free Workplace samples 仍由原公開 fixture/catalog 提供。

**Production deployment floor for Workplace Plus:** 第一次 Plus Workplace import/publication 前，必須由 live Supabase integration evidence 確認 Workplace publication migration、#184 delivery RPC 與 publication-aware `content-delivery` Edge bundle 均已套用。此前的 Edge bundle 會在 active membership 後直接讀取任何 exact imported release，並不檢查 Workplace publication；因此在 Plus Workplace release 已匯入或發佈後，不得 rollback 到該 bundle。前端、Edge、cached catalog 與 rollback 混跑時，只有 exact currently published revision 可被這條 Edge delivery path 讀取；舊 revision、退休或缺少 projection 會 unavailable，不會升級到新 body。若需回到比此 floor 更舊的 backend／Edge，先另行設計涵蓋所有 content families 的 server read/privilege migration。Source tests 不證明 live migration 或 Edge bundle 已達 floor；本文件也不授權 production import、publication、deployment 或 rollback。

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
        ↓ content-delivery Edge Function + verified server-only temporal Plus resolver
future bounded Practice renderer
```

每次受控 Practice import 由單一 service-only transaction RPC
`import_practice_question_release` 寫入 immutable release 並更新目前 release 的 stable question id/version
projection。缺席於新 release 的 identity 會被標為 unavailable；`practice_review_queue`
只 join 目前 available identity，因此 retired/removed 題目不再 actionable，而
 `practice_attempts` 永遠不會被更新或刪除。projection 只接受已 import 的 release，並以
monotonic `questionBank.version` 拒絕回退；browser 沒有 availability table 或 RPC mutation 權限。

CSV 是為 spreadsheet/editorial workflow 準備的 deterministic adapter；rich `answer`、`coreExplanation`、`itemAnalysis`、`provenance` 欄位以 JSON cell 保存，避免為不同 question input type 發明另一套 UI schema。`practice-question-bank-base.json` 保留 bank version 與 vocabulary catalog；converter 將 CSV rows 放入 question bank，之後 validator 才會檢查所有 cross-reference。

受控 import 僅接受 status 為 `released` 的題目，並要求 reviewer、release notes、originality attestation、Japanese prompt/explanation、deterministic answer contract、正確的 category/subcategory、support-overlay vocabulary refs 與禁止 source/recalled/leaked/official-test fields。`targetSeconds` 是 internal practice target；schema 沒有 official-time metadata，帶有這類 field 的 artifact 必須 fail closed。`content-delivery` 透過 service-role-only temporal membership resolver：只有所選 stream 在 database clock 時刻具有 paid-window coverage 才查詢／回傳 payload；gap、future start、failure 或 terminal cutoff 回傳 `403` 且不查詢 payload；resolver failure 回傳 `503` 且不查詢 payload。browser flag 永遠不能 authorize。這是 delivery primitive；#107 的 recurring lifecycle/commercial/production activation 仍維持其既有邊界。

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
