# Design artifacts

**Canonical authority:** [`../design-system.md`](../design-system.md) — Business Japanese Hub design system「Source & Gloss」(v1, 2026-10-02).

## Current

- [`reference/`](reference/) — static, responsive reference compositions for the major surfaces (Home, Practice hub, Practice runner question/feedback, Learn lesson, Read article, My Learning, Plus) plus the system overview (`index.html`), the token spec (`tokens.css`) and reference component CSS (`reference.css`).
  - Run `python3 -m http.server 4810 --directory docs/design/reference` and open `http://localhost:4810/`. Append `?theme=dark` to any page.
  - [`reference/screenshots/`](reference/screenshots/) — 1440px desktop, 390px mobile (2x) and dark-mode captures of every reference page, plus `audit-live-*` evidence of the pre-redesign live site (2026-10-02).
  - Content is limited to published `non-proprietary-teaching-sample` material and original illustrative items marked 示意. No private canonical content.

## Superseded (historical, not authority)

- [`visual-redesign-reference.md`](visual-redesign-reference.md) — #74 premium editorial Library reference (Quiet Editorial).
- [`implementation-sequencing.md`](implementation-sequencing.md) — #74 sequencing.
