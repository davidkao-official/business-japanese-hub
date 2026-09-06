import { CANONICAL_CAREER_GAME_ORIGIN } from '../lib/cross-product/careerGame'

/**
 * The five user-facing learning modes are the platform IA contract. They are
 * navigation/presentation labels, not evidence IDs or a shared runtime schema.
 */
export const PRODUCT_MODES = [
  {
    id: 'learn',
    label: 'Learn',
    href: '/learn',
    summary: 'Build a workplace capability from a real situation to a usable decision.',
    title: 'Learn',
    lead: 'Study the judgment, language, and context behind Japanese workplace communication.',
  },
  {
    id: 'read',
    label: 'Read',
    href: '/read',
    summary: 'Read Japanese business information and long-form editorial content in context.',
    title: 'Read',
    lead: 'Read business information directly in Japanese, with the existing Library and Reader as long-form paths.',
  },
  {
    id: 'practice',
    label: 'Practice',
    href: '/practice',
    summary: 'Repeat retrieval and judgment practice that connects language to workplace action.',
    title: 'Practice',
    lead: 'Practice is the home for repeatable retrieval and judgment surfaces as they become available.',
  },
  {
    id: 'my-learning',
    label: 'My Learning',
    href: '/my-learning',
    summary: 'Return to real progress, review, saved items, and the next useful step.',
    title: 'My Learning',
    lead: 'Your learning state will grow from real, explainable evidence rather than an invented score.',
  },
  {
    id: 'experience',
    label: 'Experience',
    href: '/experience',
    summary: 'Apply workplace judgment in a concrete story and see the consequences.',
    title: 'Experience',
    lead: 'Experience is the gateway to the separately deployed Career Game workplace simulator.',
  },
] as const

export type ProductModeId = (typeof PRODUCT_MODES)[number]['id']

export const PRODUCT_MODE_BY_ID: Record<ProductModeId, (typeof PRODUCT_MODES)[number]> =
  Object.fromEntries(PRODUCT_MODES.map((mode) => [mode.id, mode])) as Record<
    ProductModeId,
    (typeof PRODUCT_MODES)[number]
  >

export const CAREER_GAME_HREF = `${CANONICAL_CAREER_GAME_ORIGIN}/`
