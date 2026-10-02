# Design artifacts

**Canonical authority:** [`../design-system.md`](../design-system.md) — Business Japanese Hub design system「Source & Gloss」(v2, 2026-10-02). V1 is Japanese-first for foreign learners who have passed JLPT N1 (approved premise, `docs/product-contract.md` §1).

## Current

- [`reference/`](reference/) — static, responsive, Japanese-language reference compositions for the major surfaces (Home, Practice hub, Practice runner question/checkpoint/feedback, Practice runner input and save-state matrix, Learn lesson, Read article with note dialog, My Learning, Plus, Career Game decision and strong/mixed/risky outcomes, the その他 sheet) plus the system overview (`index.html`), the token spec (`tokens.css`) and reference component CSS (`reference.css`).
  - Run `python3 -m http.server 4810 --directory docs/design/reference` and open `http://localhost:4810/`. Append `#dark` (or `?theme=dark` locally) to any page.
  - [`reference/screenshots/`](reference/screenshots/) — 1440px desktop, 390px mobile (2x) and dark-mode captures of every reference page, open-dialog states, keyboard focus on a choice row, 320/360px narrow headers, plus `audit-live-*` evidence of the pre-redesign live site (2026-10-02).
  - The reference pages are generated from shared markup; edit the pages directly or regenerate them consistently. Japanese 解説 on the Learn and Read references were written for the reference, because the current content data stores zh-TW explanations (#195).
  - Content is limited to published `non-proprietary-teaching-sample` material and original sample items marked サンプル. No private canonical content.

## Superseded (historical, not authority)

- [`visual-redesign-reference.md`](visual-redesign-reference.md) — #74 premium editorial Library reference (Quiet Editorial).
- [`implementation-sequencing.md`](implementation-sequencing.md) — #74 sequencing.
