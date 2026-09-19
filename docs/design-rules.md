# Design Rules — Business Japanese Hub

This document is the visual QA contract for the public application shell and shared UI.

## 1. Japanese typography

### UI labels
Buttons, navigation links, tags, badges, account actions, and other compact controls must stay on one line.

Required behavior:
- `white-space: nowrap`
- `flex-shrink: 0`
- do not solve overflow by squeezing the control narrower than its text
- if the header no longer fits, collapse the header into the menu instead

Use `data-nowrap` on any compact UI element that is not already covered by the shared selectors.

### Headings
Japanese display headings must break only at natural phrase boundaries.

Baseline:
- `text-wrap: balance`
- `line-break: strict`
- `word-break: normal`
- use `word-break: auto-phrase` when the browser supports it

For critical display copy, wrap semantic chunks with `.phrase`:

```html
<h1 class="hero-title">
  <span class="phrase">ビジネス</span><span class="phrase">日本語</span><span class="phrase">ハブ</span>
</h1>
```

`.phrase` must be `inline-block` and `white-space: nowrap`. Do not hard-code viewport-specific `<br>` elements unless the content itself requires a mandatory break.

Never apply `overflow-wrap: anywhere` to headings.

## 2. Responsive type

Shared type sizes must use `clamp()` so that text changes continuously across viewport widths.

Avoid breakpoint rules that make a heading smaller when the viewport gets wider.

Display type should preserve hierarchy at 375 / 768 / 1100 / 1440px.

## 3. Header behavior

The header must never compress navigation or account actions until text wraps.

Rules:
- full desktop navigation is only shown when it fits comfortably
- below the desktop header breakpoint, use the menu
- theme controls live in the footer so they do not compete with primary navigation
- compact controls do not shrink
- no horizontal scrolling is allowed

## 4. Hero composition

The homepage hero must have an intentional visual center.

If there is no meaningful visual/content anchor for a second column, use a centered single-column composition rather than leaving an empty half of the viewport.

Hero title phrase units must remain intact at all supported widths.

## 5. Layout density

### 375px
- one-column reading flow
- controls remain single-line
- no horizontal page overflow

### 768px
- do not immediately force dense desktop 3-column editorial layouts
- use one or two columns where appropriate
- avoid large fixed gaps that leave text columns too narrow

### 1100px
- learning-mode cards must not be forced into five narrow columns
- header stays in compact/menu mode

### 1440px
- desktop header may expand
- hero remains visually balanced
- account action must stay on one line

## 6. Dark mode

Dark mode must preserve the same hierarchy as light mode.

Dividers, ghost controls, and menu outlines must remain visible against the dark background. Do not rely on extremely low-contrast borders for structure.

## 7. Visual QA matrix

Every homepage visual QA run covers:

- widths: 375, 768, 1100, 1440px
- themes: light, dark
- full-page screenshots

The regression test must also verify:
- no document-level horizontal overflow
- compact nowrap controls render as a single text line
- phrase-wrapped hero chunks do not break internally

## 8. Styleguide

`/styleguide` is the shared QA surface for typography and compact controls. It is not primary product navigation.

Each shared component class shown there should use a realistic longest Japanese string so wrapping regressions are visible before release.

Current stress strings:
- Button: `無料の学習を始める`
- Navigation: `マイライブラリ`
- Badge: `Early Access メンバー`
- Tag: `日本企業の公開資料`
- Hero: `ビジネス日本語ハブ`
- Section title: `日本企業の資料を文脈から読み解く`
