# Issue #80 visual evidence

## Screenshots

所有影像都是 requested viewport 的 1x PNG。每個 URL 都在獨立的
Chromium context 中載入，等待 `document.fonts` 與現有圖片完成後，以
`document.documentElement.style.scrollBehavior = 'auto'` 固定 scroll，最後用
viewport screenshot（不是 document-coordinate clip）擷取；因此每一張 scrolled
capture 都保留相同的 sticky header（viewport top = 0）。

- after captures 由 fresh Library dev server
  `http://127.0.0.1:41731/` 產生，server 使用 `--host 127.0.0.1
  --port 41731 --strictPort`；before captures 由獨立的
  `http://127.0.0.1:41732/` exact baseline server 產生。

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

實際 capture scroll record 如下；baseline 文件較短時，瀏覽器只在該 baseline
的最大 scrollY 取樣：

| pair | viewport | requested | baseline effective | after effective |
| --- | ---: | ---: | ---: | ---: |
| top | 1440 × 900 | 0 | 0 | 0 |
| top | 390 × 844 | 0 | 0 | 0 |
| mid | 1440 × 900 | 1760 | 1760 | 1760 |
| mid | 390 × 844 | 2520 | 2520 | 2520 |
| alternating | 1440 × 900 | 3560 | 2257 (clamped) | 3560 |
| alternating | 390 × 844 | 5600 | 3912 (clamped) | 5600 |

每個 scrolled capture 的 header 都在 viewport top = 0；1440px header 高度為
77px，390px responsive header 高度約為 162px。這保證 before / after 的
差異來自頁面內容，而不是不同的 screenshot clipping mode。

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

- CUA browser 以 `http://127.0.0.1:41731/`（`--strictPort`）檢查；兩個
  viewport 的 title 與 header brand 都是 `Business Japanese Hub`，頁面含已發布
  的 Library content，且沒有誤載其他產品頁面或品牌。
- CUA browser 已檢查 1440px 與 390px 的 light / dark themes；headless
  responsive pass 也確認兩種尺寸的 `document.scrollWidth` 沒有超出 viewport。
- 390px 下 document 維持 viewport-bounded；只有 sample viewport 擁有
  horizontal overflow，並設定 `scroll-snap-type: x mandatory`、touch scrolling，
  以及其中可 focus 的 links。CUA keyboard pass 從第一個 sample link 按 Tab
  到第二個 sample link，`scrollLeft` 由 0 變成 320；headless pass 同時確認
  focus 仍落在第二個 link。
- Accessibility tree 暴露新 feature list、sample region、real image alt text /
  captions、既有 header controls，以及未變更的 purchase / preview / Career Game
  destinations；catalog-derived Japanese / Traditional Chinese text 使用 nested
  language overrides。
- 未加入新的 motion；shared global reduced-motion rule 仍是唯一 authority。

## Exact-HEAD validation

以下 gates 在包含本 evidence package 與所有 source 修正的 final `HEAD` 重新
執行；push 後以 PR head SHA 作為不可變 exact-HEAD anchor，並在 PR / final
handoff 同時記錄 `git rev-parse HEAD`：

- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm test` — 108 files / 1,198 tests passed
- `deno check supabase/functions/*/index.ts` — pass
- `pnpm build` — release verification、Library build、Career Game build pass
- `pnpm smoke:built-frontends` — built Library / Career Game direct-route smoke pass
- `pnpm smoke:deployment:production` — canonical Library / Career Game origin smoke pass
- `supabase db start` + `supabase db reset --local` — clean local database pass
- `supabase test db --local supabase/tests` — transactional database contracts pass
- `supabase db lint --local --schema public --level warning --fail-on error` — pass
- `git diff --check origin/main...HEAD` — pass
- `git status --porcelain=v1` — clean after validation

Validation was run against the final relevant working tree after the evidence
capture was regenerated. `git status --porcelain=v1` was clean afterwards; the
immutable final commit SHA is recorded from the pushed PR head and the handoff
report, together with the command results above.
