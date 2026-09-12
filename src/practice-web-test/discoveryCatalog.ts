import type { PrivatePracticeQuestionBankRelease } from '../content-delivery/privatePracticeQuestionBank'

export const PRACTICE_DISCOVERY_CATALOG_SCHEMA_VERSION = 1 as const

export type PracticeDiscoveryMode = 'untimed-learning' | 'timed-practice'

type RegisteredCategory = {
  label: string
  modes: readonly PracticeDiscoveryMode[]
}

type RegisteredFamily = {
  label: string
  domains: Record<'verbal' | 'nonverbal', Record<string, RegisteredCategory>>
}

/**
 * A public discovery projection is an explicit consumer, not a reflection of
 * unconstrained private authoring strings. Extending a family/category needs a
 * deliberate UI/route update here before its metadata can leave private source.
 */
const DISCOVERABLE_PRACTICE_CONTENT: Record<string, RegisteredFamily & { testFamily: string }> = {
  'practice-web-test-spi-v1': {
    testFamily: 'spi',
    label: 'SPI',
    domains: {
      verbal: {
        'vocabulary-in-context': { label: '文脈語彙', modes: ['untimed-learning'] },
        'semantic-relation': { label: '語句關係', modes: ['untimed-learning'] },
        'sentence-logic': { label: '句子邏輯', modes: ['untimed-learning'] },
        'reading-inference': { label: '閱讀推論', modes: ['untimed-learning'] },
      },
      nonverbal: {
        'percentage-profit-loss': { label: '百分比與損益', modes: ['untimed-learning'] },
        'rate-and-work': { label: '速率與工作量', modes: ['untimed-learning'] },
        'sets-and-counting': { label: '集合與計數', modes: ['untimed-learning'] },
        'conditions-and-ordering': { label: '條件與排序', modes: ['untimed-learning'] },
      },
    },
  },
}

export type PracticeDiscoveryCategory = {
  category: string
  releasedCount: number
  modes: PracticeDiscoveryMode[]
}

export type PracticeDiscoveryDomain = {
  domain: 'verbal' | 'nonverbal'
  categories: PracticeDiscoveryCategory[]
}

export type PracticeDiscoveryFamily = {
  testFamily: string
  domains: PracticeDiscoveryDomain[]
}

/**
 * Public discovery data is intentionally smaller than a runner payload. It
 * lets Practice navigation name released families/categories/counts without
 * exposing question IDs, bodies, answers, explanations, vocabulary, or
 * editorial review/provenance data.
 */
export type PracticeDiscoveryCatalog = {
  schemaVersion: typeof PRACTICE_DISCOVERY_CATALOG_SCHEMA_VERSION
  releaseIdentity: {
    contentId: string
    revision: string
  }
  families: PracticeDiscoveryFamily[]
}

const SUPPORTED_DISCOVERY_MODES = new Set<PracticeDiscoveryMode>([
  'untimed-learning',
  'timed-practice',
])

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en')
}

/**
 * Converts an already strict-validated private release into a body-free,
 * deterministic public discovery projection. The caller must never pass an
 * unvalidated raw source to this function.
 */
export function createPracticeDiscoveryCatalog(
  release: PrivatePracticeQuestionBankRelease,
): PracticeDiscoveryCatalog {
  const registeredFamily = DISCOVERABLE_PRACTICE_CONTENT[release.contentId]
  if (!registeredFamily) throw new Error('private release is not registered for public discovery')
  const grouped = new Map<string, Map<'verbal' | 'nonverbal', Map<string, {
    releasedCount: number
    modes: Set<PracticeDiscoveryMode>
  }>>>()

  // The source contract allows prior versions of a stable question ID. Discovery
  // counts the latest released version once, matching the future runner's
  // current-selection semantics without publishing question identities.
  const latestById = new Map<string, (typeof release.payload.questionBank.questions)[number]>()
  for (const question of release.payload.questionBank.questions) {
    const existing = latestById.get(question.id)
    if (!existing || question.version > existing.version) latestById.set(question.id, question)
  }

  for (const question of latestById.values()) {
    if (question.deliveryProfile !== 'web') continue
    const mode = question.practiceProfile as PracticeDiscoveryMode
    const categoryDefinition = registeredFamily.domains[question.domain][question.category]
    if (question.testFamily !== registeredFamily.testFamily || !categoryDefinition ||
      !SUPPORTED_DISCOVERY_MODES.has(mode) || !categoryDefinition.modes.includes(mode)) {
      throw new Error('private release contains a family, category, or mode not registered for public discovery')
    }
    const family = grouped.get(question.testFamily) ?? new Map()
    const domain = family.get(question.domain) ?? new Map()
    const category = domain.get(question.category) ?? {
      releasedCount: 0,
      modes: new Set<PracticeDiscoveryMode>(),
    }
    category.releasedCount += 1
    category.modes.add(mode)
    domain.set(question.category, category)
    family.set(question.domain, domain)
    grouped.set(question.testFamily, family)
  }

  if (grouped.size === 0) throw new Error('private release contains no released questions')

  return {
    schemaVersion: PRACTICE_DISCOVERY_CATALOG_SCHEMA_VERSION,
    releaseIdentity: {
      contentId: release.contentId,
      revision: release.revision,
    },
    families: [...grouped.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([testFamily, domains]) => ({
        testFamily,
        domains: [...domains.entries()]
          .sort(([left], [right]) => compareText(left, right))
          .map(([domain, categories]) => ({
            domain,
            categories: [...categories.entries()]
              .sort(([left], [right]) => compareText(left, right))
              .map(([category, metadata]) => ({
                category,
                releasedCount: metadata.releasedCount,
                modes: [...metadata.modes].sort(compareText),
              })),
          })),
      })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key))
}

function isMode(value: unknown): value is PracticeDiscoveryMode {
  return typeof value === 'string' && SUPPORTED_DISCOVERY_MODES.has(value as PracticeDiscoveryMode)
}

function registeredCategory(
  contentId: string,
  testFamily: string,
  domain: 'verbal' | 'nonverbal',
  category: string,
): RegisteredCategory | undefined {
  const family = DISCOVERABLE_PRACTICE_CONTENT[contentId]
  if (!family || family.testFamily !== testFamily) return undefined
  return family.domains[domain][category]
}

export function practiceDiscoveryFamilyLabel(contentId: string, testFamily: string): string | undefined {
  const family = DISCOVERABLE_PRACTICE_CONTENT[contentId]
  return family?.testFamily === testFamily ? family.label : undefined
}

export function practiceDiscoveryCategoryLabel(
  contentId: string,
  testFamily: string,
  domain: 'verbal' | 'nonverbal',
  category: string,
): string | undefined {
  return registeredCategory(contentId, testFamily, domain, category)?.label
}

/** Strictly validates the committed public projection before navigation uses it. */
export function validatePracticeDiscoveryCatalog(value: unknown): value is PracticeDiscoveryCatalog {
  if (!isRecord(value) || !hasOnlyKeys(value, ['schemaVersion', 'releaseIdentity', 'families'])) return false
  if (value.schemaVersion !== PRACTICE_DISCOVERY_CATALOG_SCHEMA_VERSION || !isRecord(value.releaseIdentity)) return false
  const releaseIdentity = value.releaseIdentity
  const contentId = releaseIdentity.contentId
  if (!hasOnlyKeys(releaseIdentity, ['contentId', 'revision']) ||
    typeof contentId !== 'string' || !DISCOVERABLE_PRACTICE_CONTENT[contentId] ||
    !/^[a-f0-9]{64}$/.test(String(releaseIdentity.revision)) || !Array.isArray(value.families) || value.families.length === 0) {
    return false
  }
  const familyIds = new Set<string>()
  return value.families.every((family) => {
    if (!isRecord(family) || !hasOnlyKeys(family, ['testFamily', 'domains'])) return false
    const familyId = family.testFamily
    const domains = family.domains
    if (typeof familyId !== 'string' || familyIds.has(familyId) ||
      practiceDiscoveryFamilyLabel(contentId, familyId) === undefined || !Array.isArray(domains) || domains.length === 0) return false
    familyIds.add(familyId)
    const domainIds = new Set<string>()
    return domains.every((domain) => {
      if (!isRecord(domain) || !hasOnlyKeys(domain, ['domain', 'categories'])) return false
      const domainId = domain.domain
      const categories = domain.categories
      if ((domainId !== 'verbal' && domainId !== 'nonverbal') || domainIds.has(domainId) ||
        !Array.isArray(categories) || categories.length === 0) return false
      domainIds.add(domainId)
      const categoryIds = new Set<string>()
      return categories.every((category) => {
        if (!isRecord(category) || !hasOnlyKeys(category, ['category', 'releasedCount', 'modes'])) return false
        const categoryId = category.category
        const modes = category.modes
        if (typeof categoryId !== 'string' || categoryIds.has(categoryId) ||
          typeof category.releasedCount !== 'number' || !Number.isSafeInteger(category.releasedCount) || category.releasedCount <= 0 ||
          !Array.isArray(modes) || modes.length === 0 || !modes.every(isMode) ||
          new Set(modes).size !== modes.length) return false
        const definition = registeredCategory(contentId, familyId, domainId, categoryId)
        if (!definition || (modes as PracticeDiscoveryMode[]).some((mode) => !definition.modes.includes(mode))) return false
        categoryIds.add(categoryId)
        return true
      })
    })
  })
}

export function findPracticeDiscoveryFamily(catalog: PracticeDiscoveryCatalog, testFamily: string | undefined) {
  return catalog.families.find((family) => family.testFamily === testFamily)
}

export function findPracticeDiscoveryDomain(
  catalog: PracticeDiscoveryCatalog,
  testFamily: string | undefined,
  domain: string | undefined,
) {
  const family = findPracticeDiscoveryFamily(catalog, testFamily)
  return family?.domains.find((candidate) => candidate.domain === domain)
}

export function findPracticeDiscoveryCategory(
  catalog: PracticeDiscoveryCatalog,
  testFamily: string | undefined,
  domain: string | undefined,
  category: string | undefined,
) {
  return findPracticeDiscoveryDomain(catalog, testFamily, domain)?.categories.find(
    (candidate) => candidate.category === category,
  )
}
