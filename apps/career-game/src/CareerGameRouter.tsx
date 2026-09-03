import { useMemo } from 'react'
import type { Scenario } from '@business-japanese-hub/career-game'
import {
  noopValidationAnalytics,
  type ValidationAnalytics,
} from '@business-japanese-hub/validation-analytics'
import App from './App'
import type { CareerGameProgressRepository } from './career-game-progress'
import { careerGameCatalog, resolveCareerGameRoute } from './content/catalog'
import { libraryHomeHref } from './library-links'
import { ProductHeader } from './ProductHeader'

export interface CareerGameRouterProps {
  pathname?: string
  search?: string
  createProgressRepository?: (scenario: Scenario) => CareerGameProgressRepository
  analytics?: ValidationAnalytics
  libraryOriginValue?: unknown
}

export function CareerGameRouter({
  pathname = window.location.pathname,
  search = window.location.search,
  createProgressRepository,
  analytics = noopValidationAnalytics,
  libraryOriginValue = import.meta.env.VITE_LIBRARY_ORIGIN,
}: CareerGameRouterProps) {
  const route = resolveCareerGameRoute(pathname, search)
  const scenario = route.kind === 'available' ? route.scenario : undefined
  const progressRepository = useMemo(
    () => (scenario && createProgressRepository ? createProgressRepository(scenario) : undefined),
    [createProgressRepository, scenario],
  )

  if (!scenario) {
    return (
      <div className="career-game-shell">
        <a className="career-game-skip-link" href="#career-game-main">
          本文へスキップ
        </a>
        <ProductHeader libraryOriginValue={libraryOriginValue} />
        <main className="career-game-main" id="career-game-main" tabIndex={-1}>
          <section className="progress-status-panel" aria-labelledby="case-unavailable-title">
            <p className="section-label" lang="en">
              Case unavailable
            </p>
            <h1 id="case-unavailable-title">ケースを開けません</h1>
            <p>指定されたケースは存在しないか、現在は利用できません。</p>
            <div className="unavailable-actions">
              <a className="primary-action" href="/">
                現在のケースを開く
                <span aria-hidden="true">→</span>
              </a>
              <a className="unavailable-library-link" href={libraryHomeHref(libraryOriginValue)}>
                Libraryへ移動
              </a>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <App
      scenario={scenario}
      availableScenarios={careerGameCatalog.scenarios}
      progressRepository={progressRepository}
      analytics={analytics}
      libraryOriginValue={libraryOriginValue}
    />
  )
}
