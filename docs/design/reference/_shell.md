# Reference composition shell

The reference HTML pages in this folder repeat the same header, mobile tab bar and footer markup on purpose: they are static design references that open directly from disk or a static host without a build step.

- Append `#dark` / `#light` (or `?theme=dark` locally) to any page to force an appearance.
- State toggles use hash tokens (or `?state=` locally): `runner.html#question` / `#checkpoint` / `#feedback`, `game.html#decision` / `#strong` / `#mixed` / `#risky`. Combine with a dash, e.g. `game.html#risky-dark`.
- Dialogs open from their triggers, or directly with a hash token (or `?open=` locally): `practice.html#more` (その他 sheet), `read.html#note1` (long note), `runner-states.html#signin` (re-login inside the runner). They use native `<dialog>.showModal()` to demonstrate the `Dialog` contract in `docs/design-system.md` §6; production generalises `src/reader/ReaderDialog.tsx`.
- V1 is Japanese-first: every page is written in Japanese (`<html lang="ja">`).
- Pages contain only original teaching samples already published as `non-proprietary-teaching-sample` on the live site, Career Game content already public in `apps/career-game/src/content/upward-disagreement.ts` (`game.html`), or original sample content written for this reference (marked サンプル); Japanese 解説 on Learn/Read were written for the reference because current data stores zh-TW explanations. No private canonical content is used.
- Numbers on My Learning / result screens are illustrative layout data, not product claims.
