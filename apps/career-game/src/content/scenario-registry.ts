import type { Scenario } from '@business-japanese-hub/career-game'
import { customerCommunicationScenario } from './customer-communication.ts'
import { rookieSurvivalScenario } from './rookie-survival.ts'
import { upwardDisagreementScenario } from './upward-disagreement.ts'

/**
 * The explicit content registry is the only scenario seam shared by the two
 * Career Game entry points. Keep it data-only so the edge function and the
 * browser resolve the same stable IDs and content versions.
 */
export const careerGameScenarios: readonly Scenario[] = [
  rookieSurvivalScenario,
  customerCommunicationScenario,
  upwardDisagreementScenario,
]

function createScenarioMap(scenarios: readonly Scenario[]): ReadonlyMap<string, Scenario> {
  const map = new Map<string, Scenario>()
  for (const scenario of scenarios) {
    if (map.has(scenario.id)) throw new Error(`Duplicate Career Game scenario id: ${scenario.id}`)
    map.set(scenario.id, scenario)
  }
  return map
}

export const careerGameScenarioMap = createScenarioMap(careerGameScenarios)
