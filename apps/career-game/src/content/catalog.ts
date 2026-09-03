import type { Scenario } from '@business-japanese-hub/career-game'
import { rookieSurvivalScenario } from './rookie-survival'
import { careerGameScenarios } from './scenario-registry'

export interface CareerGameCatalog {
  readonly scenarios: readonly Scenario[]
  readonly defaultScenarioId: string
}

export type ResolvedCareerGameRoute =
  | {
      kind: 'available'
      source: 'root' | 'case-route' | 'stable-link'
      scenario: Scenario
      canonicalPath: string
    }
  | {
      kind: 'unavailable'
      reason:
        | 'unknown-route'
        | 'missing-scenario-id'
        | 'invalid-scenario-id'
        | 'case-not-found'
    }

export function createCareerGameCatalog(
  scenarios: readonly Scenario[],
  defaultScenarioId: string,
): CareerGameCatalog {
  const ids = new Set<string>()
  const slugs = new Set<string>()

  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) throw new Error(`Duplicate scenario id: ${scenario.id}`)
    if (slugs.has(scenario.slug)) throw new Error(`Duplicate scenario slug: ${scenario.slug}`)
    ids.add(scenario.id)
    slugs.add(scenario.slug)
  }

  if (!ids.has(defaultScenarioId)) {
    throw new Error(`Default scenario is not present in the catalog: ${defaultScenarioId}`)
  }

  return { scenarios: [...scenarios], defaultScenarioId }
}

export const careerGameCatalog = createCareerGameCatalog(
  careerGameScenarios,
  rookieSurvivalScenario.id,
)

export function careerGameCasePath(scenario: Scenario): string {
  return `/cases/${encodeURIComponent(scenario.slug)}`
}

function available(
  scenario: Scenario,
  source: Extract<ResolvedCareerGameRoute, { kind: 'available' }>['source'],
): ResolvedCareerGameRoute {
  return {
    kind: 'available',
    source,
    scenario,
    canonicalPath: careerGameCasePath(scenario),
  }
}

function scenarioById(catalog: CareerGameCatalog, id: string): Scenario | undefined {
  return catalog.scenarios.find((scenario) => scenario.id === id)
}

export function resolveCareerGameRoute(
  pathname: string,
  search: string,
  catalog: CareerGameCatalog = careerGameCatalog,
): ResolvedCareerGameRoute {
  if (pathname === '/' || pathname === '') {
    const scenario = scenarioById(catalog, catalog.defaultScenarioId)
    return scenario
      ? available(scenario, 'root')
      : { kind: 'unavailable', reason: 'case-not-found' }
  }

  const caseMatch = /^\/cases\/([^/]+)\/?$/.exec(pathname)
  if (caseMatch) {
    let slug: string
    try {
      slug = decodeURIComponent(caseMatch[1]!)
    } catch {
      return { kind: 'unavailable', reason: 'case-not-found' }
    }
    const scenario = catalog.scenarios.find((candidate) => candidate.slug === slug)
    return scenario
      ? available(scenario, 'case-route')
      : { kind: 'unavailable', reason: 'case-not-found' }
  }

  if (pathname === '/case-link' || pathname === '/case-link/') {
    const scenarioIds = new URLSearchParams(search).getAll('scenarioId')
    if (scenarioIds.length === 0 || scenarioIds[0] === '') {
      return { kind: 'unavailable', reason: 'missing-scenario-id' }
    }
    if (scenarioIds.length !== 1) {
      return { kind: 'unavailable', reason: 'invalid-scenario-id' }
    }
    const scenario = scenarioById(catalog, scenarioIds[0]!)
    return scenario
      ? available(scenario, 'stable-link')
      : { kind: 'unavailable', reason: 'case-not-found' }
  }

  return { kind: 'unavailable', reason: 'unknown-route' }
}
