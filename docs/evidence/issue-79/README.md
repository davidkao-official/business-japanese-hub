# Issue #79 visual evidence

The before and after captures use the requested viewport sizes:

- `before-1440.png` and `after-1440.png`: 1440 x 900
- `before-390.png` and `after-390.png`: 390 x 844

## Reused assets

- The feature visual is the existing released cover resolved by `BookCover` from the data-driven `listCatalogEntries()` result: `content-dist/assets/books/meeting-japanese/cover.jpg` at capture time.
- The compact shelf continues to use the released catalog assets for `keigo-essentials` and `email-manners`.
- No placeholder device mockup, provider mark, or new fabricated campaign artwork was added.

## Announcement

The announcement bar is intentionally omitted for this slice because the implementation handoff identified no approved current campaign copy. No dismissal state was added.

## QA notes

- Light-theme before and after captures were taken at both required viewports.
- Dark-theme mobile rendering was sanity-checked separately; the capture is not part of the shipped evidence set.
- The header remains sticky, the existing authentication and appearance controls remain available, and the three product paths stack cleanly below the feature on mobile.
