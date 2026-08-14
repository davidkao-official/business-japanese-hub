# 作者出版工作流（Authoring, Validation, Preview, Publishing）

本文說明 issue #10 建立的內容作者與出版工作流：**作者 → 驗證 → 本機預覽 → 審查 → 出版**。

MVP 的設計目標是「最小成本、適合重複出版書籍」：不是完整 CMS。非工程師只要編輯 `books/` 底下的 JSON 與圖片檔，不需要寫 React。所有驗證、預覽、出版都由 repository 內建的 CLI 指令完成，結果輸出到 gitignored 的 `content-dist/`。

---

## 1. 總覽

```text
books/<slug>/book.json      ← 書籍內容（純 JSON，內容模型）
books/<slug>/manifest.json  ← 每本書的介面層元資料（含 preview boundary）
books/<slug>/assets/**      ← 書的圖片素材

            │ pnpm workflow:validate（驗證每一本書）
            ▼
  全書目錄合法嗎？ ──否──► 印出問題清單，exit 1（不能出版）

            │ pnpm workflow:preview（產生預覽 payload）
            ▼
  content-dist/preview/<slug>.json   ← 供本機／預覽環境渲染

            │ pnpm workflow:publish（審查通過後出版）
            ▼
  content-dist/books/<slug>/current.json   ← 平台載入的出版成品（self-contained）
  content-dist/books/<slug>/snapshots/<id>.json  ← 不可變快照
  content-dist/books/<slug>/history.json    ← 出版紀錄（append-only）
  content-dist/assets/books/<slug>/**      ← 目前出版版本的素材（publish／rollback 重建）
  content-dist/assets/snapshots/<slug>/<snapshotId>/**  ← 每版不可變素材快照（rollback 來源）

            │ pnpm workflow:rollback（需要時）
            ▼
  current.json 重新指向舊快照（快照永不刪除）
```

角色分工：

- **作者（非工程師）**：只碰 `books/<slug>/` 的 JSON 與圖片。
- **CLI（本工作流）**：驗證、預覽、出版、回滾，全部可重現、可被 CI 呼叫。
- **平台／閱讀器**：只讀 `content-dist/` 的成品，不讀作者原始檔。

---

## 2. 作者格式（非工程師也能做）

### 2.1 一本書 = 一個資料夾

新增一本書：

```text
books/my-book/
  book.json          ← 必填。書籍內容（結構見下）
  manifest.json      ← 建議。介面層元資料（含 preview boundary）
  assets/            ← 可選。書的圖片素材（.png/.jpg，參考 §4 資產規則）
```

書的 slug（資料夾名稱）必須是小寫英文、以連字號分隔，例如 `keigo-essentials`。

### 2.2 book.json 的結構

`book.json` 就是內容模型定義的 `Book`（見 `docs/content-model.md` 與 `src/content/types.ts`），結構為 `Book → Chapter → ContentBlock`，`schemaVersion` 目前為 `SCHEMA_VERSION`(=1)。完整範例見 `books/keigo-essentials/book.json`。

最小可用骨架：

```json
{
  "schemaVersion": 1,
  "id": "book-my-book",
  "slug": "my-book",
  "title": "書名",
  "subtitle": "副標題",
  "language": "ja",
  "description": "一句話簡介。",
  "authors": [
    { "id": "author-1", "name": "作者名", "role": "author" }
  ],
  "cover": {
    "src": "/assets/books/my-book/cover.png",
    "alt": "封面圖說明",
    "width": 1200,
    "height": 800
  },
  "edition": { "number": 1, "label": "第1版", "year": 2026 },
  "publication": { "status": "draft" },
  "price": { "tier": "paid", "amount": 300, "currency": "JPY" },
  "audience": { "levels": ["beginner"], "languages": ["zh-TW"] },
  "difficulty": { "level": 2, "label": "初級" },
  "tableOfContents": {
    "entries": [
      { "chapterId": "ch-1", "title": "第一章" }
    ]
  },
  "chapters": [
    {
      "id": "ch-1",
      "slug": "chapter-1",
      "order": 1,
      "title": "第一章",
      "summary": "本章簡介",
      "blocks": [
        { "id": "ch1-blk-01", "type": "heading", "text": "小節標題", "level": 2 },
        { "id": "ch1-blk-02", "type": "paragraph", "text": "內文段落。純文字，不寫 HTML。" }
      ]
    }
  ]
}
```

重點：

- 區塊（`blocks`）目前有 **14 種型別**（`heading`、`paragraph`、`callout`、`vocabulary`、`comparison`、`quote`、`authorNote`、`dialogue`、`doDont`、`table`、`caseStudy`、`exercise`、`example`、`image`）。每種型別需要的欄位請直接參考 `books/keigo-essentials/book.json` 的對應範例，或 `src/content/validate.ts`。
- 不需要寫 React／TS。改 JSON 就等於改內容。
- 未知欄位會被容忍（forward-compatible），但缺少必填欄位或型別打錯，驗證會擋下。

### 2.3 manifest.json（介面層）

`manifest.json` 放「介面層」的元資料，**刻意不放進內容 schema**（見 `docs/ui-ux-research.md` §4.2 的 Preview-boundary contract；確切欄位由 content-model follow-up 定案）：

```json
{
  "book": "./book.json",
  "preview": {
    "boundary": { "kind": "chapter", "chapterId": "ch-1" }
  },
  "notes": "自由填寫的備註；管線會忽略它。"
}
```

- `book`：指到書內容檔的相對路徑（預設 `./book.json`）。
- `preview.boundary`：免費預覽的終點。詳見 §3.3。
- `notes`：給人類看的備註，不影響任何管線。

---

## 3. 驗證與預覽

### 3.1 驗證：`pnpm workflow:validate`

對 `books/` 下每一本書執行 `validateBook`（`src/content/validate.ts`）：

```bash
pnpm workflow:validate
# ok   keigo-essentials  (books/keigo-essentials/book.json)
# All 1 book(s) passed validation.
```

任何一本書不合法：

```bash
ERR  my-book: 2 issue(s)
     - $.language  [missing_field]  missing required field "language"
     - $.chapters[0].blocks[0].type  [unknown_block_type]  unknown content block type "nonsense-type"
# 1 of 2 book(s) FAILED validation.   （exit code 1）
```

- 問題清單格式為 `路徑 [code] 訊息`（`$.` 開頭的 dot/bracket 路徑，與測試約定一致）。
- exit code 非 0 → 可接 CI；**不合法內容在出版前就被擋下**。

### 3.2 本機／預覽渲染：`pnpm workflow:preview`

`pnpm workflow:preview` 為每一本「合法」的書產生預覽 payload，寫入
`content-dist/preview/<slug>.json`（`content-dist/` 已 gitignore，供本機與預覽環境使用）：

```bash
pnpm workflow:preview
# ok   keigo-essentials: preview = chapter ch-1; paid content starts at ch-2 / ch2-blk-01
# Preview artifacts written to content-dist/preview/.
```

輸出檔（schema `preview-v1`）：

```json
{
  "schema": "preview-v1",
  "slug": "keigo-essentials",
  "boundary": { "kind": "chapter", "chapterId": "ch-1" },
  "chapters": [ /* 有序的預覽章節前綴（免費部分） */ ],
  "paidStart": { "chapterId": "ch-2", "blockId": "ch2-blk-01" },
  "isPartial": true,
  "generatedAt": "2026-08-15T00:00:00.000Z"
}
```

- `chapters`：永遠是 `book.chapters` 的**有序前綴**（從第一章開始連續的一段）。
- `paidStart`：付費內容的起點。`null` 表示整本都是預覽（沒有隱藏內容）。
- `isPartial`：當有內容被 boundary 藏住時為 `true`。

### 3.3 Preview boundary（public vs paid 的明確界線）

界線宣告在 `manifest.json` 的 `preview.boundary`，支援兩種：

```json
{ "kind": "chapter", "chapterId": "ch-1" }
```
第 1 章到 `ch-1` 為預覽；之後的章節全為付費。

```json
{ "kind": "block", "chapterId": "ch-2", "blockId": "ch2-blk-03" }
```
預覽延伸到 `ch-2` 內、含 `ch2-blk-03`；其後的 block 與後續章節為付費。

規則：

- Boundary 是**書層級的一般化元資料**，不是 `if bookId === firstBook` 之類的書本特定程式碼，也不建立第二個 renderer。
- Boundary 指向不存在的 chapter/block 時，管線回報結構化錯誤（`$.preview.boundary.chapterId`），不會默默成功。
- 書沒有宣告 boundary 時，`workflow:preview` 把**整本當預覽**並輸出 `warn`，確保付費書不會不小心被免費公開。出版前請務必檢查。

---

## 4. 資產（圖片）規則

- 圖片放在 `books/<slug>/assets/`，例如 `books/keigo-essentials/assets/cover.png`。
- `book.json` 內引用路徑一律寫 `/assets/books/<slug>/<檔名>`（**不是**相對路徑）：
  - 封面：`"src": "/assets/books/my-book/cover.png"`（建議 1200×800）。
  - 內容圖片（`image` block）：`"src": "/assets/books/my-book/diagram.png"`。
- `pnpm workflow:publish` 會把 `books/<slug>/assets/**` 複製到 `content-dist/assets/snapshots/<slug>/<snapshotId>/`（**每版不可變素材快照**，rollback 的來源），並重建 `content-dist/assets/books/<slug>/` 為該版的素材。`current.json` 的 `/assets/books/<slug>/...` 路徑永遠對應目前出版版本的素材。
- 請控制檔案大小（MVPN 階段建議單張 < 500 KB），避免 `content-dist` 膨脹。
- 新增／替換圖片後，重新執行 validate → preview → publish 即可；不需要平台程式碼改動。

---

## 5. 出版、版本與回滾

### 5.1 出版：`pnpm workflow:publish`

```bash
pnpm workflow:publish                          # 出版全部
pnpm workflow:publish --slug=keigo-essentials  # 只出版一本
```

流程（`scripts/publish.ts`）：

1. **先驗證整個目錄**：任何一本不合法，出版直接中止（exit 1），**不寫任何東西**。因為平台載入的是整個目錄，一本壞書不能進 live。
2. 對目標書計算下一個 `revision`（同 `(slug, edition)` 的遞增計數器）。
3. 用與 preview 相同的 boundary 產生預覽 payload。
4. 寫**不可變快照** `content-dist/books/<slug>/snapshots/<slug>@e<edition>-r<revision>.json`（已存在則拒絕覆寫）。
5. 重寫 `content-dist/books/<slug>/current.json` —— 平台載入的 self-contained 出版成品（schema `publish-snapshot-v1`）。
6. 在 `history.json` 追加一筆快照描述（append-only log）。
7. 快照 `books/<slug>/assets/**` → `content-dist/assets/snapshots/<slug>/<snapshotId>/`（不可變），並重建 `content-dist/assets/books/<slug>/`（目前版本素材）。

快照內容：`{ schema, descriptor, preview, book }`。其中：

- `descriptor`：`{ id, slug, editionNumber, revision, status: "published", releasedAt, createdAt }`。
- `preview`：§3.2 的預覽 payload。
- `book`：`publication.status = "published"` 且帶 `releasedAt` 的完整書籍資料。

### 5.2 版本模型

- `edition.number`：作者填寫（`book.edition.number`），重大改版時手動 +1。沒填時視為 1。
- `revision`：管線每次出版自動遞增（同 `(slug, edition)`），例如 `keigo-essentials@e1-r1`、`@e1-r2`。
- 快照**永不修改、永不刪除**；「目前出版版本」由 `current.json` 指標決定。

### 5.3 回滾：`pnpm workflow:rollback`

```bash
pnpm workflow:rollback --slug=keigo-essentials                    # 回到前一版
pnpm workflow:rollback --slug=keigo-essentials --to=keigo-essentials@e1-r1
```

- 移動 `current.json` 指標（快照保留），並**把 `content-dist/assets/books/<slug>/` 重建為目標快照的素材**（從 `content-dist/assets/snapshots/<slug>/<snapshotId>/`），確保「舊內容 + 舊素材」一致，不會出現新舊混雜的出版成品。
- 回滾**可逆**：再執行一次 `publish` 就會產生新 revision 的「新出版」。
- 原始碼層級的回滾由 git 負責（作者改壞了可 revert）。

### 5.4 更新一本已出版書籍（不需平台程式碼改動）

1. 編輯 `books/<slug>/book.json`、`manifest.json` 或 `assets/`。
2. `pnpm workflow:validate`（確認合法）→ `pnpm workflow:preview`（確認界線正確）。
3. `pnpm workflow:publish --slug=<slug>` → 產生新 revision，`current.json` 更新。
4. 平台重新讀 `current.json` 即看到新內容。

---

## 6. 未來的 CMS 遷移路徑

MVP 的作者端是「檔案 + JSON + CLI」，**CMS 不是目前的工作流依賴**。

遷移路徑：

- 未來的 CMS 只需扮演「**來源 adapter**」：產出與現在相同的 `book.json` / `manifest.json` 契約，或直接產出 `content-dist/books/<slug>/current.json`。
- 驗證（`validateBook`）、預覽（`derivePreview`）、出版管線都與 CMS 無關，可直接沿用。
- 因此遷移到 CMS 時，平台端與出版邏輯不需改動；`books/` 資料夾可以變成 CMS 的「匯出」目標。

---

## 7. #5 Universal Reader 的整合介面

平台（Universal Reader + 單一 entitlement gate）**只讀出版成品**，不讀作者原始檔。

要載入一本書，讀：

```text
content-dist/books/<slug>/current.json   （schema: publish-snapshot-v1）
```

介面合約：

| 欄位 | 用途 |
| --- | --- |
| `book` | 完整書籍（`publication.status = "published"`、`releasedAt`）。entitlement gate 通過後顯示的完整內容。 |
| `book.chapters` | 章節順序（`order`）、章節導覽（`navigation`）、block 內容。 |
| `preview.chapters` | 免費預覽的**有序章節前綴**。entitlement gate 未通過時只顯示這些。 |
| `preview.paidStart` | 付費內容起點 `{ chapterId, blockId }`；`null` = 整本免費。gate 用這個決定「從哪裡切付費」。 |
| `preview.isPartial` | 是否有隱藏內容。 |
| `descriptor` | 快照 id（`slug@eN-rM`）、`releasedAt` 等版本資訊，可用於顯示版本／更新提示。 |

gate 的規則保持**單一**：未解鎖 → 渲染 `preview.chapters`，並在 `preview.paidStart` 顯示付費提示；已解鎖 → 渲染 `book`。preview boundary 是書層級的一般化元資料，閱讀器不需要針對單一書寫特例。

---

## 8. 驗證矩陣

| 指令 | 守護什麼 | 建議時機 |
| --- | --- | --- |
| `pnpm typecheck` | TypeScript（`tsc -b`，含 app / node / scripts 三個專案） | 每次改動後 |
| `pnpm lint` | ESLint（含 `src/authoring/**` 測試） | 每次改動後 |
| `pnpm test` | Vitest 全部測試（含 `src/content/**`、`src/authoring/**`） | 每次改動後 |
| `pnpm build` | `tsc -b` + Vite build | 出版前／CI |
| `pnpm workflow:validate` | 內容模型合法性（`validateBook` on 每一本書） | **每次改 book.json 後，出版前必做** |
| `pnpm workflow:preview` | 預覽 boundary 是否可解析、paidStart 是否正確 | 出版前 |
| `pnpm workflow:publish` | 全目錄先驗證，不合法直接中止 | 審查通過後 |
| `pnpm workflow:rollback` | 回滾目標存在、可回到前一版 | 需要時 |

---

## 9. 快速上手（新增一本書的 checklist）

```bash
# 1. 建立資料夾與檔案
mkdir -p books/my-book/assets
#    寫 book.json（複製 books/keigo-essentials/book.json 當範本改）
#    寫 manifest.json（宣告 preview.boundary）

# 2. 驗證 + 預覽
pnpm workflow:validate          # 必須全部 ok
pnpm workflow:preview           # 檢查 paidStart 是否正確

# 3. 自己審查（可先跑 pnpm typecheck / lint / test / build）

# 4. 出版
pnpm workflow:publish --slug=my-book
```
