# Issue #81 visual and QA evidence

## Immutable anchors

- Baseline: `origin/main` at `81a5dfe812e37a78110311a0277a79bb0a920913`.
- Final implementation anchor: `5439452f13e11ab0c08b2903b115bc1da1e28f91`.
- The final evidence package is committed on the branch HEAD reported in the PR handoff; no merge was performed.

## Capture method

所有影像都是 1x PNG，使用獨立 Chromium context、固定 viewport、`document.fonts.ready`、viewport 內圖片完成後擷取；capture 前將 `scrollBehavior` 設為 `auto`。Before 與 after 使用不同的 production preview artifact，並以 `--strictPort` 固定埠：

- before：detached baseline worktree，`http://127.0.0.1:4183/`
- after：final branch，`http://127.0.0.1:4182/`

每個 context 都驗證頁面 title 與 header brand 為 `Business Japanese Hub`，避免 port collision 把其他產品頁面當成 Library 證據。

### 1440 × 900

| surface | before | after |
| --- | --- | --- |
| light top | ![before 1440 light](before-1440-light.png) | ![after 1440 light](after-1440-light.png) |
| dark top | ![before 1440 dark](before-1440-dark.png) | ![after 1440 dark](after-1440-dark.png) |
| closing surface | ![before 1440 closing](before-1440-closing.png) | ![after 1440 closing](after-1440-closing.png) |

### 390 × 844

| surface | before | after |
| --- | --- | --- |
| light top | ![before 390 light](before-390-light.png) | ![after 390 light](after-390-light.png) |
| dark top | ![before 390 dark](before-390-dark.png) | ![after 390 dark](after-390-dark.png) |
| closing surface | ![before 390 closing](before-390-closing.png) | ![after 390 closing](after-390-closing.png) |
| mobile menu, light | — | ![after 390 light mobile menu](after-390-menu-light.png) |
| mobile menu, dark | — | ![after 390 dark mobile menu](after-390-menu-dark.png) |

## Product and interaction QA

- Final CTA is one generic catalog projection: the first released Book whose declared price tier is `paid`; it reuses `Price`, `BookActions`, ownership/reading state, preview boundary, cover, and the provider-neutral purchase seam. No slug, amount, plan, subscription, tier, discount, bundle, badge, or payment logic was added.
- Mobile navigation keeps the existing Home / My Library IA and makes the existing Account / Appearance controls available inside the same overlay. The overlay uses the theme background token, visible close control, `role="dialog"`, `aria-modal`, focus entry, Tab / Shift+Tab containment, Escape, focus return, route-close behavior, body scroll lock, and background pointer blocking through the full-viewport surface.
- Light and dark themes were checked at 1440px and 390px. Intermediate responsive checks at 768px, 1024px, and 1280px also reported `document.scrollWidth === viewport width`; no unintended horizontal overflow was found.
- Existing legal links, pending seller disclosure, copyright note, Book purchase / preview links, Library route, Career Game origin, and `cross_product_link_clicked` analytics behavior remain source-backed. No separate related-product section, announcement, stats, Jabiko link, or #72 `/about` route was added.
- Accessibility QA: Lighthouse accessibility 100 at both requested viewports; semantic nav/dialog/footer landmarks, headings, link/button names, focus-visible treatment, contrast, and the shared reduced-motion rule remain active.
- Distinction compliance: no Distinction copy, assets, illustrations, videos, logo, icons, or composition were copied; the surface uses the repository's existing book assets and semantic LP/shared tokens.

## Lighthouse 13.4.1

Runs used the exact requested viewport emulation, device scale factor 1, and the same local production-preview method as the baseline. The historical #78 / PR #88 authority was desktop 100 / 100 and mobile 96 / 100; the fresh post-#80 baseline was rerun because the current main artifact is longer than that historical surface.

| run | Performance | Accessibility | Best Practices | SEO | LCP | FCP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fresh main before, 1440 × 900 | 100 | 100 | 96 | 92 | 0.8 s | 0.5 s |
| final after, 1440 × 900 | 99 | 100 | 96 | 92 | 0.8 s | 0.5 s |
| fresh main before, 390 × 844 | 83 | 100 | 96 | 92 | 4.4 s | 2.0 s |
| final after, 390 × 844 | 83 | 100 | 96 | 92 | 4.4 s | 2.0 s |

The final run is performance-parity with the fresh current-main baseline at 390px; the one-point desktop score difference is within the same 0.8 s LCP band. The 390px result is documented against both the fresh post-#80 baseline and the historical #78 authority rather than presented as a false 96-point reproduction.

## Exact-HEAD validation

The following repository-prescribed gates passed on the final implementation before the evidence commit, with the same source tree and no unrelated changes:

- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm test` — 109 files / 1,202 tests passed
- `deno check supabase/functions/*/index.ts` — pass
- `pnpm build` — release verification, Library build, and Career Game build passed
- `pnpm smoke:built-frontends` — Library and Career Game built-artifact direct-route smoke passed
- `pnpm smoke:deployment:production` — canonical Library and Career Game origin smoke passed
- `supabase db start` — already-running local database confirmed
- `supabase db reset --local` — pass
- `supabase test db --local supabase/tests` — 9 files / 259 tests passed
- `supabase db lint --local --schema public --level warning --fail-on error` — no schema errors
- `git diff --check origin/main...HEAD` — pass at the implementation anchor

The final branch HEAD and its exact PR head SHA are recorded in the final handoff after the evidence package is committed and pushed. CI and mergeability remain GitHub-authoritative; this task intentionally does not merge the PR.
