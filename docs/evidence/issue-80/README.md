# Issue #80 visual evidence

## Screenshots

The top-of-page before/after captures use the requested viewport sizes:

- `before-1440.png` and `after-1440.png`: 1440 × 900
- `before-390.png` and `after-390.png`: 390 × 844
- `after-mid-1440.png`: 1440 × 900, scrolled to the new numbered editorial index
- `after-mid-390.png`: 390 × 844, scrolled to the new horizontal sample strip

The before captures were rendered from the exact `origin/main` baseline
`ee068528a9e6e77f8d3b37f4ba12214401e98a3c`. The top-of-page after captures
remain intentionally stable because Issue #80 starts after the existing
featured Book and READ / PRACTICE / CONTINUE paths. The mid-page captures show
the new Issue #80 surface directly.

## Released content and assets

- The paid `meeting-japanese` sample is taken from its released preview
  chapter `成果から逆算する会議設計`; the displayed dialogue line and
  commentary are read from that public prefix only.
- The free `keigo-essentials` sample uses the released `敬語（けいご）`
  vocabulary block and its released `keigo-pyramid.png` figure.
- The free `email-manners` sample uses the released example
  `お手数をおかけしますが、ご確認のほどよろしくお願いいたします。`
  and its stored translation/note.
- Editorial media is resolved through the existing catalog asset seam under
  `content-dist/assets/books/`; no third-party download or generated artwork
  was added.
- No Stats section is published: the current repository contains no verified
  live counts suitable for a public claim.

## QA notes

- Light and dark themes were checked in the CUA browser at 1440px and 390px.
- At 390px, the document remains viewport-bounded; only the sample viewport
  owns horizontal overflow, with `scroll-snap-type: x mandatory`, touch
  scrolling, and focusable links inside each sample.
- The accessibility tree exposes the new feature list, sample region, real
  image alt text/captions, existing header controls, and unchanged purchase /
  preview / Career Game destinations.
- No new motion is required for this slice; the shared global reduced-motion
  rule remains authoritative.
