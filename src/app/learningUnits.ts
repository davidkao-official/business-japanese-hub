/**
 * Bounded Learn presentation registry.
 *
 * This is intentionally only the stable route identity and the small amount
 * of cross-surface metadata needed to connect a Learn unit to Practice. It is
 * not a content schema or a generalized learning event model.
 */
export interface LearningUnitRouteData {
  slug: string
  title: string
  courseLabel: string
  practiceSlug: string
}

export const COURSE_CORRECTION_SLUG = 'meeting-course-correction'

const LEARNING_UNITS: readonly LearningUnitRouteData[] = [
  {
    slug: COURSE_CORRECTION_SLUG,
    title: '議論を本筋に戻す',
    courseLabel: 'Course Correction',
    practiceSlug: COURSE_CORRECTION_SLUG,
  },
]

export function getLearningUnit(slug: string | undefined): LearningUnitRouteData | undefined {
  return LEARNING_UNITS.find((unit) => unit.slug === slug)
}
