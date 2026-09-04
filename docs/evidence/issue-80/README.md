# Issue #80 visual evidence

## Screenshots

所有影像都是 requested viewport 的 1x PNG：

- `before-1440.png` / `after-1440.png`：1440 × 900，頁面頂部
- `before-390.png` / `after-390.png`：390 × 844，頁面頂部
- `before-mid-1440.png` / `after-mid-1440.png`：1440 × 900，固定
  `scrollY=1760`，對照新增的 numbered editorial index
- `before-mid-390.png` / `after-mid-390.png`：390 × 844，固定
  `scrollY=2520`，對照新增的行動版 numbered index
- `before-alternating-1440.png` / `after-alternating-1440.png`：1440 × 900，
  requested `scrollY=3560`，顯示 alternating text/image spreads
- `before-alternating-390.png` / `after-alternating-390.png`：390 × 844，
  requested `scrollY=5600`，顯示行動版的 content-first spread

Before captures 由 exact `origin/main` baseline
`ee068528a9e6e77f8d3b37f4ba12214401e98a3c` render。頂部 before/after 維持
相同，是因為 #80 的 bounded slice 從既有 Featured Book 與 READ / PRACTICE /
CONTINUE paths 之後開始；mid pair 使用相同實際 scroll position。Baseline
文件比 after 短，因此 alternating before capture 會被瀏覽器 clamp 到
baseline document end；這個差異本身證明新增 spread 位於既有 storefront 的
後續 continuation，而不是重畫既有 top surface。

## Released content and assets

- paid `meeting-japanese` 只從 released preview chapter
  `成果から逆算する会議設計` 的 public prefix 取樣；dialogue 與 commentary
  來自該 prefix。
- free `keigo-essentials` 使用 released `敬語（けいご）` vocabulary block
  與 released `keigo-pyramid.png` figure。
- free `email-manners` 使用 released example
  `お手数をおかけしますが、ご確認のほどよろしくお願いいたします。`
  及其儲存的 translation / note。
- Editorial media 透過既有 catalog asset seam 從
  `content-dist/assets/books/` 解析；沒有加入第三方下載或 generated artwork。
- 沒有發布 Stats section：repository 沒有可支持公開宣稱的 verified live counts。

## QA notes

- CUA browser 已檢查 1440px 與 390px 的 light / dark themes。
- 390px 下 document 維持 viewport-bounded；只有 sample viewport 擁有
  horizontal overflow，並設定 `scroll-snap-type: x mandatory`、touch scrolling，
  以及其中可 focus 的 links。
- Accessibility tree 暴露新 feature list、sample region、real image alt text /
  captions、既有 header controls，以及未變更的 purchase / preview / Career Game
  destinations；catalog-derived Japanese / Traditional Chinese text 使用 nested
  language overrides。
- 未加入新的 motion；shared global reduced-motion rule 仍是唯一 authority。

## Exact-HEAD validation

以下 gates 在包含本 evidence package 的 final commit 重新執行：

- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm test` — 108 files / 1,198 tests passed
- `deno check supabase/functions/*/index.ts` — pass
- `pnpm build` — release verification、Library build、Career Game build pass
- `pnpm smoke:built-frontends` — built Library / Career Game direct-route smoke pass
- `pnpm smoke:deployment:production` — canonical Library / Career Game origin smoke pass
- `git diff --check origin/main...HEAD` — pass
- `git status --porcelain=v1` — clean after validation

Validation was run against the final relevant working tree; the final commit SHA
is recorded in the PR and handoff report.
