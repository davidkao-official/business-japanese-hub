# Business Japanese Hub — Premium Editorial Visual Reference v1

Issue: #74

Canonical direction: `docs/ui-ux-research.md` / Quiet Editorial Modernism.

This visual wave keeps the existing React/Vite Library frontend and does not change payment, entitlement, auth, Supabase, content-domain, or Career Game contracts.

## Review artifact

- Editable Canva design: https://www.canva.com/d/JZaqM-WwLeM7FGI
- View-only review link: https://www.canva.com/d/EsRiOI4SOJYPdGQ

The artifact contains six reference compositions:

1. Storefront — desktop
2. Storefront — mobile
3. Book Detail — desktop
4. Book Detail — mobile
5. Universal Reader — desktop
6. Universal Reader — mobile / dark reading mode

## Locked visual principles

- Books are publishing objects, not generic cards.
- Storefront leads with editorial curation, then catalog.
- Book Detail behaves like a publisher product page.
- Reader typography is the product; chrome retreats.
- Mobile is intentionally recomposed, not a squeezed desktop layout.
- Premium quality comes from typography, proportion, whitespace, art direction, and reading rhythm rather than gradient/glass/shadow density.
- Avoid generic SaaS/LMS/AI-template aesthetics.

## Implementation seams

- `src/app/HomePage.tsx`
- `src/app/BookPage.tsx`
- `src/components/BookCover.tsx`
- `src/components/BookCard.tsx`
- `src/components/BookActions.tsx`
- `src/reader/ReaderPage.tsx`
- `src/reader/ReaderShell.tsx`
- `src/styles/tokens.css`
- `src/styles/global.css`
- `src/styles/shop.css`
- `src/styles/reader.css`

The reference is directional. Existing functional semantics and accessibility contracts take precedence over exact pixel copying when they conflict.