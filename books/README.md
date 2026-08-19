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
| `meeting-japanese` | 会議の日本語 | Paid Launch 商業版（`tier: paid`、USD 12、第 1 章免費預覽） |
| `keigo-essentials` | ビジネス日本語：敬語の基礎 | Prototype 版（`tier: free`、全章無料公開）、涵蓋全部 14 種 block 型別 |
| `email-manners` | ビジネスメールの作法 | Prototype 版（`tier: free`、全章無料公開） |

## 操作

- **驗證**：`pnpm workflow:validate`
- **預覽**：`pnpm workflow:preview`（輸出到 gitignored `content-dist/preview/`）
- **出版**：`pnpm workflow:publish [--slug=<slug>]`
- **authoritative price dry run**：`pnpm exec tsx scripts/update-catalog.ts --slug=<slug> --dry-run`
- **回滾**：`pnpm workflow:rollback --slug=<slug> [--to=<snapshotId>]`

完整說明（含 authoring 格式、資產規則、版本／回滾、CMS 遷移路徑、#5 整合介面）見 [`docs/authoring.md`](../docs/authoring.md)。

`workflow:publish` 會產生並要求 commit `content-dist/` 的 content-addressed release。Vite 與 server catalog sync 都讀取同一份 `current.json`；依 snapshot 的 `catalog.order` 排序、綁定 preview boundary 與打包 release assets。新增一般書籍仍只需內容資料、publish artifact 與 assets，不需修改 platform code。
