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
  },
  {
    id: 'read',
    label: 'Read',
    href: '/read',
  },
  {
    id: 'practice',
    label: 'Practice',
    href: '/practice',
  },
  {
    id: 'my-learning',
    label: 'My Learning',
    href: '/my-learning',
  },
  {
    id: 'experience',
    label: 'Experience',
    href: '/experience',
  },
] as const

export type ProductModeId = (typeof PRODUCT_MODES)[number]['id']

export const PRODUCT_MODE_BY_ID: Record<ProductModeId, (typeof PRODUCT_MODES)[number]> =
  Object.fromEntries(PRODUCT_MODES.map((mode) => [mode.id, mode])) as Record<
    ProductModeId,
    (typeof PRODUCT_MODES)[number]
  >

export const CAREER_GAME_HREF = `${CANONICAL_CAREER_GAME_ORIGIN}/`
