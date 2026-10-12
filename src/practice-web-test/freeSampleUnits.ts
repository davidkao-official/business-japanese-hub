import type { PracticeRuntimePayload } from '../content-delivery/privatePracticeQuestionBank'
import type { PracticeDiscoveryDomain, PracticeDiscoveryFamily } from './discoveryCatalog'
import { freeSpiSamplePayload } from './freeSpiSamplePayload'
import { selectableQuestions } from './runtime'

export function freeSampleCount(
  family: string,
  domain: string,
  category: string,
  payload: PracticeRuntimePayload = freeSpiSamplePayload,
): number {
  return selectableQuestions(payload, family, domain, category, 'untimed-learning').length
}

export function discoveryFreeSampleCount(
  family: PracticeDiscoveryFamily,
  domain?: PracticeDiscoveryDomain,
): number {
  return (domain ? [domain] : family.domains).reduce((total, entry) => total +
    entry.categories.reduce((count, category) => count +
      freeSampleCount(family.testFamily, entry.domain, category.category), 0), 0)
}

/** Follow the displayed unit order, cycling across domains without repeating the current unit. */
export function nextFreeSampleUnit(
  family: PracticeDiscoveryFamily,
  domain: string,
  category: string,
  payload: PracticeRuntimePayload = freeSpiSamplePayload,
) {
  return nextPracticeUnit(family, domain, category, payload)
}

/** Omit the payload to navigate all units, without restricting them to free samples. */
export function nextPracticeUnit(
  family: PracticeDiscoveryFamily,
  domain: string,
  category: string,
  payload?: PracticeRuntimePayload,
) {
  const units = family.domains.flatMap((entry) =>
    entry.categories.map((unit) => ({ domain: entry.domain, category: unit })))
  const current = units.findIndex((unit) => unit.domain === domain && unit.category.category === category)
  if (current === -1) return undefined
  return [...units.slice(current + 1), ...units.slice(0, current)].find((unit) =>
    unit.category.modes.includes('untimed-learning') &&
    (!payload || freeSampleCount(family.testFamily, unit.domain, unit.category.category, payload) > 0))
}
