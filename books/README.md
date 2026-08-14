# books/ — 作者內容目錄

這裡放**作者撰寫的書籍內容**（issue #10 的 authoring layer）。每一本書是一個資料夾：

```text
books/<slug>/
  book.json      ← 書籍內容（純 JSON，內容模型 Book → Chapter → ContentBlock）
  manifest.json  ← 介面層元資料（含 preview boundary；不屬於內容 schema）
  assets/        ← 書的圖片素材（引用路徑 /assets/books/<slug>/...）
```

目前收錄：

| slug | 內容 | 備註 |
| --- | --- | --- |
| `keigo-essentials` | ビジネス日本語：敬語の基礎 | 與 `src/content/fixtures/sample-book.ts` 結構同步的範例書，涵蓋全部 14 種 block 型別；第 1 章為免費預覽 |

## 操作

- **驗證**：`pnpm workflow:validate`
- **預覽**：`pnpm workflow:preview`（輸出到 gitignored `content-dist/preview/`）
- **出版**：`pnpm workflow:publish [--slug=<slug>]`
- **回滾**：`pnpm workflow:rollback --slug=<slug> [--to=<snapshotId>]`

完整說明（含 authoring 格式、資產規則、版本／回滾、CMS 遷移路徑、#5 整合介面）見 [`docs/authoring.md`](../docs/authoring.md)。

> 新增一本書時，請一併更新 `src/authoring/books.test.ts` 對「範例書」的結構同步守護，或確保你的書通過 `pnpm workflow:validate`。
