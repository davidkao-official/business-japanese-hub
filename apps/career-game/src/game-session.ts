import { isGameStateValid, type GameState, type Scenario } from '@business-japanese-hub/career-game'

export interface GameSessionSnapshot {
  state: GameState
  pendingOutcomeId?: string
}

export interface GameSessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const STORAGE_PREFIX = 'business-japanese-hub.career-game'
const MAX_STORED_SESSION_CHARACTERS = 64_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function pendingOutcomeIsConsistent(
  scenario: Scenario,
  state: GameState,
  pendingOutcomeId: string,
): boolean {
  const lastRecord = state.history.at(-1)
  return (
    lastRecord?.outcomeId === pendingOutcomeId &&
    scenario.outcomes.some((outcome) => outcome.id === pendingOutcomeId)
  )
}

function removeQuietly(scenario: Scenario, storage: GameSessionStorage): void {
  try {
    storage.removeItem(gameSessionStorageKey(scenario))
  } catch {
    // Anonymous play remains available when storage is blocked or full.
  }
}

/** Replay-valid parser shared by anonymous and authenticated persistence adapters. */
export function parseGameSessionSnapshot(
  scenario: Scenario,
  value: unknown,
): GameSessionSnapshot | null {
  if (!isRecord(value)) return null

  const hasPending = Object.hasOwn(value, 'pendingOutcomeId')
  if (!hasExactKeys(value, hasPending ? ['state', 'pendingOutcomeId'] : ['state'])) return null
  if (!isGameStateValid(scenario, value.state)) return null

  if (hasPending) {
    if (
      typeof value.pendingOutcomeId !== 'string' ||
      !pendingOutcomeIsConsistent(scenario, value.state, value.pendingOutcomeId)
    ) {
      return null
    }
    return { state: value.state, pendingOutcomeId: value.pendingOutcomeId }
  }

  return { state: value.state }
}

export function gameSessionStorageKey(scenario: Scenario): string {
  return `${STORAGE_PREFIX}.${scenario.slug}@${scenario.contentVersion}`
}

export function loadGameSession(
  scenario: Scenario,
  storage: GameSessionStorage,
): GameSessionSnapshot | null {
  try {
    const raw = storage.getItem(gameSessionStorageKey(scenario))
    if (raw === null) return null
    if (raw.length > MAX_STORED_SESSION_CHARACTERS) {
      removeQuietly(scenario, storage)
      return null
    }
    const snapshot = parseGameSessionSnapshot(scenario, JSON.parse(raw))
    if (snapshot) return snapshot
    removeQuietly(scenario, storage)
    return null
  } catch {
    removeQuietly(scenario, storage)
    return null
  }
}

export function saveGameSession(
  scenario: Scenario,
  snapshot: GameSessionSnapshot,
  storage: GameSessionStorage,
): boolean {
  if (!isGameStateValid(scenario, snapshot.state)) return false
  if (
    snapshot.pendingOutcomeId !== undefined &&
    !pendingOutcomeIsConsistent(scenario, snapshot.state, snapshot.pendingOutcomeId)
  ) {
    return false
  }

  try {
    storage.setItem(gameSessionStorageKey(scenario), JSON.stringify(snapshot))
    return true
  } catch {
    return false
  }
}

export function clearGameSession(scenario: Scenario, storage: GameSessionStorage): void {
  removeQuietly(scenario, storage)
}
