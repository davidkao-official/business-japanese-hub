# Content Model：Book → Chapter → ContentBlock

> 本文件描述 Business Japanese Hub 的 content model：概念階層、資料結構、block vocabulary、runtime validation 與 versioning／migration 策略。文件以台灣正體中文撰寫；程式碼識別字與 API 名稱保留英文。
>
> 對應實作：`src/content/types.ts`、`src/content/validate.ts`、`src/content/fixtures/sample-book.ts`。
> 上位契約：`docs/product-contract.md`（§5 平台 abstraction、§6 book-agnostic 硬性約束）。

---

## 1. 概觀

內容模型是固定的三層階層，對應產品的核心抽象（contract §5）：

```text
Book
 └── Chapter[]          （有序章節）
      └── ContentBlock[] （有序內容單元）
```

- **Book**：一部獨立販售的書。攜帶書層 metadata（身分、作者、封面、行銷文案、版本、發行狀態、價格／存取、受眾、難度、目錄）與 chapters。
- **Chapter**：有序的 content blocks 與 navigation metadata（上一章／下一章）。
- **ContentBlock**：最小內容單元。以 `type` 欄位作為 discriminator 的 discriminated union，vocabulary 小而明確、可擴充（見 §6）。

### 設計原則

1. **主題無關（book-agnostic）**：任何 schema field 或 component 都不得假設第一本書的主題。任何新書只要提供新的 book metadata 與內容即可上架，不需修改平台程式碼。
2. **純資料**：content 是可序列化的 plain data。authoring 不需要手寫 React；content 內不得出現 React／JSX。所有欄位都是 JSON-safe（string／number／boolean／array／object）。
3. **Deterministic**：同一份資料在任何環境、任何 renderer 下都產生相同的 validation 結果與可預期的 rendering。Rendering 必須是「已驗證資料」的純函式。
4. **早期失敗**：validation 錯誤在 dev／build／publish 早期失敗，而不是 reader runtime 才失敗。
5. **可擴充**：新增 block type、新增選用欄位都有明確步驟與既有 pattern 可循。

---

## 2. 資料結構

### 2.1 Book

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `schemaVersion` | `typeof SCHEMA_VERSION` | ✔ | 必須等於 `SCHEMA_VERSION`（見 §5）。 |
| `id` | `string` | ✔ | 穩定且全書唯一（含章節與 block 的 id 共用同一個 namespace）。 |
| `slug` | `string` | ✔ | URL-safe single path segment（小寫字母、數字、以單一 `-` 分隔），用於 routing。 |
| `title` | `string` | ✔ | 書名。 |
| `subtitle` | `string` | | 副標。 |
| `language` | `string` | ✔ | 主要內容語言，BCP-47 language tag（RFC 5646 structural grammar，含 extlang／variant／extension／private-use／grandfathered exact；例如 `"ja"`、`"zh-cmn-Hans-CN"`）。 |
| `description` | `string` | | 短描述／行銷文案。 |
| `authors` | `Author[]` | ✔ | 非空；作者 metadata（見 2.4）。 |
| `cover` | `Cover` | | 封面 metadata（見 2.4）。 |
| `edition` | `Edition` | | 版本資訊（見 2.4）。 |
| `publication` | `PublicationState` | | 發行狀態（見 2.4）。 |
| `price` | `Price` | | 價格／存取 metadata（見 2.4）。 |
| `audience` | `Audience` | | 受眾 metadata（見 2.4）。 |
| `difficulty` | `Difficulty` | | 難度 metadata（見 2.4）。 |
| `tableOfContents` | `TableOfContents` | | 目錄；entry 的 `chapterId` 必須指向既存章節 id。 |
| `tags` | `string[]` | | 選用字串陣列；若有元素則每個元素不可為空（陣列本身可為空）。 |
| `chapters` | `Chapter[]` | ✔ | 非空；書的章節（見 2.2）。 |

### 2.2 Chapter

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `id` | `string` | ✔ | 全書唯一。 |
| `slug` | `string` | ✔ | 書內唯一、URL-safe single path segment（小寫字母、數字、以單一 `-` 分隔）。 |
| `order` | `number` | ✔ | 1 起始的顯示順序（整數 ≥ 1）。 |
| `title` | `string` | ✔ | 章名。 |
| `subtitle` | `string` | | 副標。 |
| `summary` | `string` | | 摘要。 |
| `blocks` | `ContentBlock[]` | ✔ | 非空；有序的內容單元。章內的 section 由 `heading` block 標示（見 2.3）。 |
| `navigation` | `ChapterNavigation` | | `{ previous?: chapterId, next?: chapterId }`；必須指向同書既存章節。 |

### 2.3 ContentBlock 與 section

所有 block 共享基底欄位：

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `id` | `string` | ✔ | 全書唯一、非空。作為未來 annotation／localization 的附著點。 |
| `type` | `BlockType` | ✔ | discriminator；必須是 `BLOCK_TYPES` 之一。 |

**Section 的表示方式**：Chapter 內是平坦、有序的 `blocks` 陣列。`heading` block（`level: 2`）代表一個 section 的起點；下一個同層或更高層的 heading 代表 section 結束。也就是說 sectioning 由資料本身（heading 的階層）決定，reader 不需要額外的 container 結構。若未來需要真正的 section container，可新增一個 `section` block type（見 §6），不需改動既有 block。

### 2.4 Metadata 型別

- **Author**：`{ id?, name✔, role?, bio?, website? }`。`name` 必填非空；`id` 為選用、不與全書 id namespace 衝突檢查（獨立 namespace，供 byline 引用）。
- **Cover**：`{ src✔, alt✔, caption?, credit?, width?, height? }`。`width`／`height` 為正整數。
- **Edition**：`{ number✔, label?, year? }`。`number` 為整數 ≥ 1。
- **PublicationState**：`{ status✔, releasedAt? }`。`status` ∈ `draft | review | published | archived`；`releasedAt` 為 date-only ISO 8601 字串（`YYYY-MM-DD`，例如 `"2026-04-01"`），並驗證為真實曆日。
- **Price**：`{ tier✔, amount?, currency? }`。`tier` ∈ `free | preview | paid`；`amount` 為 ≥ 0 的有限數字（僅顯示用途，不做金額運算）；`currency` 為大寫 3 碼 ISO 4217（例如 `"JPY"`）。
- **Audience**：`{ levels?, languages?, description? }`。`levels`／`languages` 為選用字串陣列；若有元素則每個元素不可為空（陣列本身可為空）。
- **Difficulty**：`{ level✔, label?, description? }`。`level` ∈ 1–5（1 最易、5 最難）。
- **TableOfContents**：`{ entries: { chapterId✔, title✔ }[] }`；非空，`chapterId` 必須指向既存章節。

---

## 3. Block vocabulary

目前支援 14 種 block type（`BLOCK_TYPES`，見 `types.ts`）。「✔」= 必填，「？」= 選用。

| `type` | 用途 | 必要／選用欄位 |
| --- | --- | --- |
| `paragraph` | 段落／散文 | `text✔` |
| `heading` | 標題（同時標示 section） | `text✔`、`level?`（1–4，預設 2） |
| `image` | 圖片／figure | `src✔`、`alt✔`、`caption?`、`credit?`、`width?`、`height?` |
| `quote` | 引言／引文 | `text✔`、`attribution?` |
| `callout` | 註記／提示框 | `kind✔`（`note`/`tip`/`warning`/`info`）、`title?`、`text✔` |
| `table` | 結構化表格 | `caption?`、`columns✔`（非空）、`rows✔`（非空；每列欄數須等於 `columns` 長度） |
| `vocabulary` | 詞彙／術語 | `term✔`、`reading?`、`meaning✔`、`partOfSpeech?`、`example?` |
| `dialogue` | 對話（例如會議腳本） | `context?`、`lines✔`（非空；每行 `speaker✔`/`text✔`/`note?`） |
| `example` | 用法例句 | `text✔`、`translation?`、`note?` |
| `comparison` | 並排比較 | `title?`、`rows✔`（非空；每列 `label✔`/`points✔`（非空字串陣列）） |
| `caseStudy` | 情境案例 | `title?`、`scenario✔`、`questions?`、`outcome?` |
| `doDont` | Do／Don't 檢查表 | `title?`、`do✔`（非空字串陣列）、`dont✔`（非空字串陣列） |
| `exercise` | 練習／測驗 | `question✔`、`hint?`、`options?`、`answer?`、`explanation?` |
| `authorNote` | 作者／專家註記 | `author?`、`title?`、`text✔` |

範例使用全部 14 種 block type 的完整書見 `src/content/fixtures/sample-book.ts`。該檔案是純資料的 **sample fixture**（以「商務日語／敬語」為示範主題），不是真實商品內容；platform 不得依賴它。

---

## 4. Runtime validation

實作：`src/content/validate.ts`。**手寫 type guards／validator，零外部 runtime dependency**（不使用 zod 等，避免與 tooling 的依賴衝突），因此可在任何環境執行：dev、build、publish，以及 reader startup（fail-fast）。

### 4.1 API

- `validateBook(input: unknown): ValidationResult<Book>` — 完整驗證書（結構 + cross-reference）。
- `validateChapter(input: unknown): ValidationResult<Chapter>` — 單一章節（僅結構，不解析 cross-reference）。
- `validateContentBlock(input: unknown): ValidationResult<ContentBlock>` — 單一 block。
- `isBook(input): input is Book`／`isContentBlock(input): input is ContentBlock` — 以完整驗證為後盾的 type guard。
- `ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ContentIssue[] }` — discriminated result，不 throw。

### 4.2 錯誤格式

每個問題是 `ContentIssue { path, code, message }`：

- `path`：精確的 dot／bracket 路徑，統一以 `$` 為根前綴，例如 `$.chapters[0].blocks[2].text`、`$.tableOfContents.entries[0].chapterId`、`$.schemaVersion`。
- `code`：穩定、可程式化的錯誤碼（見下表）。
- `message`：人類可讀，含欄位名與實際值。

| code | 情境 |
| --- | --- |
| `invalid_root` | 根節點不是預期物件（`null`、數字、陣列…）。 |
| `schema_version_mismatch` | `schemaVersion` 不是本 validator 支援的版本。 |
| `missing_field` | 必填欄位缺漏。 |
| `empty_string` | 必填且非空的字串為空。 |
| `wrong_type` | 欄位型別錯誤。 |
| `invalid_enum` | 值不在允許集合內（callout `kind`、heading `level`、difficulty `level`…）。 |
| `invalid_number` | 數字不合約束（非有限值、非整數、低於下限…）。 |
| `invalid_format` | 字串欄位不符合文件定義的格式（slug、language、releasedAt、currency）。 |
| `not_json_safe` | 某值不是 JSON-safe plain data（BigInt、undefined、function、symbol、非有限數、循環引用、非 plain object）。 |
| `unknown_block_type` | block 的 `type` 不在 `BLOCK_TYPES`。 |
| `missing_discriminator` | block 缺少 `type` discriminator。 |
| `row_width_mismatch` | table 某列的欄數 ≠ `columns` 長度。 |
| `duplicate_id` | id 在全書範圍重複。 |
| `duplicate_slug` | 章節 slug 在書內重複。 |
| `reference_not_found` | TOC／navigation 引用了不存在的章節 id。 |
| `missing_items` | 必填且非空的陣列為空（`chapters`、`blocks`、`authors`、`columns`…）。 |

### 4.3 嚴謹度規則

- **必填欄位缺漏／型別錯誤／enum 不合**：一律拒絕。
- **id 全域唯一**：book id、所有 chapter id、所有 block id 共用單一 namespace，重複即拒絕。這為未來的 annotation／localization（以 id 附著）提供穩定的錨點。
- **cross-reference**：`tableOfContents.entries[].chapterId` 與 `chapter.navigation.previous/next` 必須指向既存章節 id。
- **結構約束**：table 每列欄數必須等於欄標題數；章節非空；章節 slug 唯一。
- **數字一律為有限值**：所有 numeric 欄位拒絕 `NaN`／`Infinity`／`-Infinity`（`invalid_number`），確保內容可被 JSON 安全序列化。
- **必填陣列非空**：`doDont.do`／`doDont.dont`／comparison row 的 `points` 與其他必填陣列（`chapters`、`blocks`、`authors`、`columns`、`rows`、TOC `entries`）不得為空（`missing_items`）。
- **文件化格式**：`slug`（URL-safe single segment）、`language`（BCP-47）、`publication.releasedAt`（date-only ISO 8601）、`price.currency`（大寫 3 碼 ISO 4217）；不符時回傳 `invalid_format`。
- **未知的額外欄位一律保留、不報錯**：這是 forward-compat 策略（見 §5）。因此「選用欄位的拼字錯誤」可能不會被抓到——這是為了相容未來版本而刻意接受的取捨；必填欄位拼錯仍會被 `missing_field` 抓到。但保留的未知 property 仍必須是 **JSON-safe plain data**（見下方「整棵 tree 必須 JSON-safe」）。
- **整棵 tree 必須 JSON-safe**：在成功回傳 validated value 前，validator 會遞迴走訪全部值（含未知的 forward-compatible property），拒絕 `BigInt`／`undefined`／`function`／`symbol`／`NaN`／`±Infinity`／循環引用／非 plain object（`not_json_safe`）。未知但 JSON-safe 的 property 照常保留，forward compatibility 不變。
- **Deterministic**：issue 依文件順序產生，cross-reference 檢查在結構走訪後進行；相同輸入永遠產生相同的 issue 清單（測試已驗證）。

### 4.4 使用時機

- **dev**：import 時／編輯時直接驗證。
- **build / publish**：CI 或 publish script 對每本要上架的書跑 `validateBook`，失敗即中止。
- **reader**：啟動時驗證一次（fail-fast）；不應在每個 block render 時才驗證。

---

## 5. Versioning 與 Migration 策略

`SCHEMA_VERSION` 是單一整數（目前為 `1`）。語意：

### 5.1 何時 bump（breaking）

只有**破壞性變更**才 bump `SCHEMA_VERSION`：

- 移除欄位。
- 變更欄位型別或語意。
- 必填 → 選用（反過來會讓舊資料缺欄位，需 migration）。
- 重命名 discriminator 或改動 enum 集合。
- 改變某個值的行為意義（例如 difficulty 的尺度）。
- 新增 **block type**（discriminated union 新增成員）——舊 validator 會以 `unknown_block_type` 拒絕、舊 renderer 無法渲染該 block。
- 新增 **enum 值**（例如 callout 新增 `kind`）——舊 validator 會以 `invalid_enum` 拒絕未知值。

### 5.2 何時不 bump（non-breaking）

- 新增**選用**欄位，且**舊 consumer 可安全忽略**（validator 對未知欄位是 forward-compat，見 4.3）。

### 5.3 Migration 流程（v2 之後適用）

目前只有 v1，但策略從第一天就納入：

1. 決定 bump：依 5.1／5.2 判斷是否破壞性。
2. 在 `types.ts` 將 `SCHEMA_VERSION` 改為 `2`，調整型別。
3. 新增 migration：`migrateBook(raw: unknown, targetVersion: number): Book`（或 v1→v2 的專用函式），把舊版資料轉成新版。保留舊版資料為「可被新版 migrator 讀取」的輸入。
4. validator 收到舊版 `schemaVersion` 時回傳 `schema_version_mismatch`（錯誤訊息含「本 validator 支援的版本」與實際版本），由 build／publish 工具偵測後路由到對應 migrator，而不是直接 throw。
5. migration 必須同樣經過 `validateBook` 驗證後才允許上架。

> 因為 validator 對未知欄位是 forward-compat，**舊版本 validator 讀新資料**通常不會立刻壞掉；但正式 pipeline 應要求「上架版本 == 平台支援版本」。

---

## 6. 如何新增一個 block type

以新增 `glossary`（延伸詞彙表）為例，步驟：

1. **`src/content/types.ts`**
   - 在 `BLOCK_TYPES` 加入 `'glossary'`。
   - 定義 payload interface，例如 `GlossaryBlock extends BlockBase { type: 'glossary'; entries: { term: string; meaning: string }[] }`。
   - 將它加入 `ContentBlock` discriminated union。
2. **`src/content/validate.ts`**
   - 在 `validateBlockRecord` 的 `switch` 新增 `case 'glossary':`，寫 `validateGlossary(record, path, ctx)` 並復用既有的 `readRequiredArray`／`readRequiredString`／`isRecord` helpers。
3. **`src/content/fixtures/sample-book.ts`**
   - 加入一個 `glossary` block（測試會斷言「fixture 涵蓋所有 block type」）。
4. **測試**
   - 在 `validate.test.ts` 為新 block 增加至少一正一負案例（例如缺 `entries`、錯誤的 entry 型別）。
   - 在 `model.test.ts` 的「fixture 涵蓋所有 block type」測試會自動涵蓋新 type。
5. **bump `SCHEMA_VERSION`**：新增 block type 是 breaking change（見 §5.1），必須 bump `SCHEMA_VERSION` 並依 §5.3 提供 migration——舊 validator／renderer 無法處理新 block。若你同時移除或改動既有 block 的必填欄位，也需要 migration。

新 block 的欄位請遵循既有慣例：`id`＋`type` 基底、camelCase 欄位、必填欄位使用非空字串／非空陣列、選用欄位用 `?`。

---

## 7. 未來方向（localization／annotation）

Day one **不強制**多語，但模型已為未來預留：

- 每個節點（book／chapter／block）都有穩定、全書唯一的 `id`，是附著翻譯／註解的天然錨點。
- `Book.language` 標記內容主要語言；未來可新增如 `translations?: { [locale]: ... }` 的選用欄位（non-breaking）。
- 新增欄位時優先以「選用、以 id 為 key」的方式設計，避免必須重寫既有內容。

---

## 8. 命名與準則

- block 的 `type` 值使用 camelCase 單字（`paragraph`、`caseStudy`、`doDont`）。
- 欄位一律 camelCase；型別以名詞命名（`CalloutBlock`、`Cover`）。
- content 保持 JSON-safe：不要放 class instance、function、Date 等不可序列化值。
- 任何新增欄位都必須考慮「是否假設第一本書的主題」；違反 book-agnostic 原則的欄位應改放到書的 metadata 或內容本身。
