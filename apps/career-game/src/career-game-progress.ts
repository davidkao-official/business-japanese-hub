import type { Scenario } from '@business-japanese-hub/career-game'
import { parseGameSessionSnapshot, type GameSessionSnapshot } from './game-session'

export type CareerGameProgressResponse =
  | { kind: 'none' }
  | { kind: 'client-update-required'; currentVersion: number }
  | {
      kind: 'progress'
      scenarioId: string
      contentVersion: number
      checkpointId: string
      revision: number
      snapshot: GameSessionSnapshot
    }
  | {
      kind: 'reset-required'
      reason: 'content-version-mismatch' | 'invalid-persisted-progress'
      currentVersion: number
      storedVersion: number
      checkpointId: string
      revision: number
    }
  | { kind: 'conflict' }

export interface CareerGameProgressRepository {
  load(scenarioId: string, contentVersion: number): Promise<CareerGameProgressResponse>
  start(scenarioId: string, contentVersion: number): Promise<CareerGameProgressResponse>
  choose(
    scenarioId: string,
    contentVersion: number,
    sceneId: string,
    choiceId: string,
    checkpointId: string,
    expectedRevision: number,
  ): Promise<CareerGameProgressResponse>
  acknowledge(
    scenarioId: string,
    contentVersion: number,
    checkpointId: string,
    expectedRevision: number,
  ): Promise<CareerGameProgressResponse>
  reset(
    scenarioId: string,
    contentVersion: number,
    storedVersion: number,
    checkpointId: string,
    expectedRevision: number,
  ): Promise<CareerGameProgressResponse>
}

interface ProgressFunctionClient {
  functions: {
    invoke(
      name: string,
      options: { body: Record<string, unknown> },
    ): Promise<{ data: unknown; error: unknown }>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function requestFailed(): Error {
  return new Error('Career Game progress request failed')
}

function parseResponse(value: unknown, scenario: Scenario): CareerGameProgressResponse {
  if (!isRecord(value) || typeof value.kind !== 'string') throw requestFailed()

  if (value.kind === 'none' || value.kind === 'conflict') {
    if (!hasExactKeys(value, ['kind'])) throw requestFailed()
    return { kind: value.kind }
  }

  if (value.kind === 'client-update-required') {
    if (
      !hasExactKeys(value, ['kind', 'currentVersion']) ||
      !isPositiveInteger(value.currentVersion)
    ) {
      throw requestFailed()
    }
    return { kind: 'client-update-required', currentVersion: value.currentVersion }
  }

  if (value.kind === 'reset-required') {
    if (
      !hasExactKeys(value, [
        'kind',
        'reason',
        'currentVersion',
        'storedVersion',
        'checkpointId',
        'revision',
      ]) ||
      (value.reason !== 'content-version-mismatch' &&
        value.reason !== 'invalid-persisted-progress') ||
      !isPositiveInteger(value.currentVersion) ||
      !isPositiveInteger(value.storedVersion) ||
      !isUuid(value.checkpointId) ||
      !isPositiveInteger(value.revision)
    ) {
      throw requestFailed()
    }
    if (value.currentVersion !== scenario.contentVersion) {
      return { kind: 'client-update-required', currentVersion: value.currentVersion }
    }
    return {
      kind: 'reset-required',
      reason: value.reason,
      currentVersion: value.currentVersion,
      storedVersion: value.storedVersion,
      checkpointId: value.checkpointId,
      revision: value.revision,
    }
  }

  if (
    value.kind !== 'progress' ||
    !hasExactKeys(value, [
      'kind',
      'scenarioId',
      'contentVersion',
      'checkpointId',
      'revision',
      'snapshot',
    ]) ||
    value.scenarioId !== scenario.id ||
    !isPositiveInteger(value.contentVersion) ||
    !isUuid(value.checkpointId) ||
    !isPositiveInteger(value.revision)
  ) {
    throw requestFailed()
  }

  if (value.contentVersion !== scenario.contentVersion) {
    return {
      kind: 'client-update-required',
      currentVersion: value.contentVersion,
    }
  }

  const snapshot = parseGameSessionSnapshot(scenario, value.snapshot)
  if (!snapshot) {
    return {
      kind: 'reset-required',
      reason: 'invalid-persisted-progress',
      currentVersion: scenario.contentVersion,
      storedVersion: value.contentVersion,
      checkpointId: value.checkpointId,
      revision: value.revision,
    }
  }

  return {
    kind: 'progress',
    scenarioId: value.scenarioId,
    contentVersion: value.contentVersion,
    checkpointId: value.checkpointId,
    revision: value.revision,
    snapshot,
  }
}

export function createCareerGameProgressRepository(
  client: ProgressFunctionClient,
  scenario: Scenario,
): CareerGameProgressRepository {
  async function invoke(body: Record<string, unknown>): Promise<CareerGameProgressResponse> {
    let result: { data: unknown; error: unknown }
    try {
      result = await client.functions.invoke('career-game-progress', { body })
    } catch {
      throw requestFailed()
    }
    if (result.error) {
      const context = isRecord(result.error) ? result.error.context : undefined
      if (context instanceof Response && context.status === 409) {
        let errorBody: unknown
        try {
          errorBody = await context.clone().json()
        } catch {
          throw requestFailed()
        }
        const parsed = parseResponse(errorBody, scenario)
        if (
          parsed.kind === 'conflict' ||
          parsed.kind === 'reset-required' ||
          parsed.kind === 'client-update-required'
        ) {
          return parsed
        }
      }
      throw requestFailed()
    }
    return parseResponse(result.data, scenario)
  }

  return {
    load: (scenarioId, contentVersion) => invoke({ action: 'load', scenarioId, contentVersion }),
    start: (scenarioId, contentVersion) =>
      invoke({ action: 'start', scenarioId, contentVersion }),
    choose: (
      scenarioId,
      contentVersion,
      sceneId,
      choiceId,
      checkpointId,
      expectedRevision,
    ) =>
      invoke({
        action: 'choose',
        scenarioId,
        contentVersion,
        sceneId,
        choiceId,
        checkpointId,
        expectedRevision,
      }),
    acknowledge: (scenarioId, contentVersion, checkpointId, expectedRevision) =>
      invoke({
        action: 'acknowledge',
        scenarioId,
        contentVersion,
        checkpointId,
        expectedRevision,
      }),
    reset: (scenarioId, contentVersion, storedVersion, checkpointId, expectedRevision) =>
      invoke({
        action: 'reset',
        scenarioId,
        contentVersion,
        storedVersion,
        checkpointId,
        expectedRevision,
      }),
  }
}
