import type { Scenario } from '@business-japanese-hub/career-game'
import { describe, expect, it } from 'vitest'
import {
  careerGameCatalog,
  createCareerGameCatalog,
  resolveCareerGameRoute,
} from './catalog'
import { rookieSurvivalScenario } from './rookie-survival'

function secondScenario(): Scenario {
  return {
    ...rookieSurvivalScenario,
    id: 'second-scenario',
    slug: 'second-case',
    title: '第二のケース',
  }
}

describe('Career Game scenario catalog and routes', () => {
  it('deliberately resolves the product root to the configured catalog default', () => {
    const alternate = secondScenario()
    const catalog = createCareerGameCatalog(
      [rookieSurvivalScenario, alternate],
      alternate.id,
    )

    expect(resolveCareerGameRoute('/', '', catalog)).toEqual({
      kind: 'available',
      source: 'root',
      scenario: alternate,
      canonicalPath: '/cases/second-case',
    })
  })

  it('resolves stable case slugs and stable scenario-id links', () => {
    expect(resolveCareerGameRoute('/cases/rookie-survival', '', careerGameCatalog)).toMatchObject({
      kind: 'available',
      source: 'case-route',
      scenario: rookieSurvivalScenario,
      canonicalPath: '/cases/rookie-survival',
    })
    expect(
      resolveCareerGameRoute(
        '/case-link',
        '?scenarioId=rookie-survival',
        careerGameCatalog,
      ),
    ).toMatchObject({
      kind: 'available',
      source: 'stable-link',
      scenario: rookieSurvivalScenario,
      canonicalPath: '/cases/rookie-survival',
    })
  })

  it.each([
    ['/cases/missing', '', 'case-not-found'],
    ['/case-link', '', 'missing-scenario-id'],
    ['/case-link', '?scenarioId=', 'missing-scenario-id'],
    ['/case-link', '?scenarioId=rookie-survival&scenarioId=missing', 'invalid-scenario-id'],
    ['/case-link', '?scenarioId=missing', 'case-not-found'],
    ['/unknown', '', 'unknown-route'],
  ])('keeps unavailable %s targets unavailable instead of falling back', (pathname, search, reason) => {
    expect(resolveCareerGameRoute(pathname, search, careerGameCatalog)).toEqual({
      kind: 'unavailable',
      reason,
    })
  })

  it('rejects ambiguous duplicate catalog identifiers and invalid defaults', () => {
    const alternate = secondScenario()
    expect(() =>
      createCareerGameCatalog(
        [rookieSurvivalScenario, { ...alternate, id: rookieSurvivalScenario.id }],
        rookieSurvivalScenario.id,
      ),
    ).toThrow(/duplicate scenario id/i)
    expect(() =>
      createCareerGameCatalog(
        [rookieSurvivalScenario, { ...alternate, slug: rookieSurvivalScenario.slug }],
        rookieSurvivalScenario.id,
      ),
    ).toThrow(/duplicate scenario slug/i)
    expect(() => createCareerGameCatalog([rookieSurvivalScenario], 'missing')).toThrow(
      /default scenario/i,
    )
  })
})
