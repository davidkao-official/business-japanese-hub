import {
  applyChoice,
  createInitialState,
  isGameStateValid,
  type GameState,
  type Outcome,
  type Scenario,
} from '@business-japanese-hub/career-game';
import { authenticateBearer } from '../_shared/auth.ts';
import type { DbClient } from '../_shared/db.ts';
import {
  badRequest,
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import type { Logger } from '../_shared/log.ts';

type ProgressAction =
  | { action: 'load'; scenarioId: string; contentVersion: number }
  | { action: 'start'; scenarioId: string; contentVersion: number }
  | {
      action: 'choose';
      scenarioId: string;
      contentVersion: number;
      sceneId: string;
      choiceId: string;
      expectedRevision: number;
    }
  | {
      action: 'acknowledge';
      scenarioId: string;
      contentVersion: number;
      expectedRevision: number;
    }
  | {
      action: 'reset';
      scenarioId: string;
      contentVersion: number;
      storedVersion: number;
      checkpointId: string;
      expectedRevision: number;
    };

interface ProgressIdentity {
  user_id: string;
  scenario_id: string;
  content_version: number;
  attempt_id: string;
  revision: number;
}

interface ProgressRow {
  user_id: string;
  scenario_id: string;
  content_version: number;
  state: GameState;
  pending_outcome_id: string | null;
  attempt_id: string;
  revision: number;
  completed_at: string | null;
  updated_at: string;
}

export interface CareerGameProgressHandlerDeps {
  db: DbClient;
  log: Logger;
  scenarios: ReadonlyMap<string, Scenario>;
  randomUUID: () => string;
  now?: () => string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isBoundedContentId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function parseAction(bodyText: string): ProgressAction | null {
  let input: unknown;
  try {
    input = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!isRecord(input) || !isBoundedContentId(input.scenarioId)) return null;

  switch (input.action) {
    case 'load':
      return hasExactKeys(input, ['action', 'scenarioId', 'contentVersion']) &&
          isPositiveInteger(input.contentVersion)
        ? { action: 'load', scenarioId: input.scenarioId, contentVersion: input.contentVersion }
        : null;
    case 'start':
      return hasExactKeys(input, ['action', 'scenarioId', 'contentVersion']) &&
          isPositiveInteger(input.contentVersion)
        ? { action: 'start', scenarioId: input.scenarioId, contentVersion: input.contentVersion }
        : null;
    case 'choose':
      return hasExactKeys(input, [
          'action',
          'scenarioId',
          'contentVersion',
          'sceneId',
          'choiceId',
          'expectedRevision',
        ]) &&
          isPositiveInteger(input.contentVersion) &&
          isBoundedContentId(input.sceneId) &&
          isBoundedContentId(input.choiceId) &&
          isPositiveInteger(input.expectedRevision)
        ? {
            action: 'choose',
            scenarioId: input.scenarioId,
            contentVersion: input.contentVersion,
            sceneId: input.sceneId,
            choiceId: input.choiceId,
            expectedRevision: input.expectedRevision,
          }
        : null;
    case 'acknowledge':
      return hasExactKeys(input, ['action', 'scenarioId', 'contentVersion', 'expectedRevision']) &&
          isPositiveInteger(input.contentVersion) &&
          isPositiveInteger(input.expectedRevision)
        ? {
            action: 'acknowledge',
            scenarioId: input.scenarioId,
            contentVersion: input.contentVersion,
            expectedRevision: input.expectedRevision,
          }
        : null;
    case 'reset':
      return hasExactKeys(input, [
          'action',
          'scenarioId',
          'contentVersion',
          'storedVersion',
          'checkpointId',
          'expectedRevision',
        ]) &&
          isPositiveInteger(input.contentVersion) &&
          isPositiveInteger(input.storedVersion) &&
          typeof input.checkpointId === 'string' &&
          UUID.test(input.checkpointId) &&
          isPositiveInteger(input.expectedRevision)
        ? {
            action: 'reset',
            scenarioId: input.scenarioId,
            contentVersion: input.contentVersion,
            storedVersion: input.storedVersion,
            checkpointId: input.checkpointId,
            expectedRevision: input.expectedRevision,
          }
        : null;
    default:
      return null;
  }
}

function clientUpdateRequired(currentVersion: number): HandlerResult {
  return jsonResult(409, { kind: 'client-update-required', currentVersion });
}

function resetRequired(
  reason: 'content-version-mismatch' | 'invalid-persisted-progress',
  currentVersion: number,
  identity: ProgressIdentity,
): HandlerResult {
  return jsonResult(409, {
    kind: 'reset-required',
    reason,
    currentVersion,
    storedVersion: identity.content_version,
    checkpointId: identity.attempt_id,
    revision: identity.revision,
  });
}

function conflict(): HandlerResult {
  return jsonResult(409, { kind: 'conflict' });
}

function progressResponse(
  scenario: Scenario,
  checkpointId: string,
  revision: number,
  state: GameState,
  pendingOutcomeId: string | null,
): HandlerResult {
  return jsonResult(200, {
    kind: 'progress',
    scenarioId: scenario.id,
    contentVersion: scenario.contentVersion,
    checkpointId,
    revision,
    snapshot: {
      state,
      ...(pendingOutcomeId === null ? {} : { pendingOutcomeId }),
    },
  });
}

function asProgressIdentity(value: unknown): ProgressIdentity | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.user_id !== 'string' ||
    !isBoundedContentId(value.scenario_id) ||
    !isPositiveInteger(value.content_version) ||
    typeof value.attempt_id !== 'string' ||
    !UUID.test(value.attempt_id) ||
    !isPositiveInteger(value.revision)
  ) {
    return null;
  }
  return {
    user_id: value.user_id,
    scenario_id: value.scenario_id,
    content_version: value.content_version,
    attempt_id: value.attempt_id,
    revision: value.revision,
  };
}

function asProgressRow(value: unknown): ProgressRow | null {
  const identity = asProgressIdentity(value);
  if (!identity || !isRecord(value)) return null;
  const pending = value.pending_outcome_id;
  if (
    !isRecord(value.state) ||
    (pending !== null && !isBoundedContentId(pending)) ||
    (value.completed_at !== null && typeof value.completed_at !== 'string') ||
    typeof value.updated_at !== 'string'
  ) {
    return null;
  }
  return value as unknown as ProgressRow;
}

function validStoredProgress(scenario: Scenario, row: ProgressRow): boolean {
  if (row.scenario_id !== scenario.id || !isGameStateValid(scenario, row.state)) return false;
  if ((row.state.status === 'completed') !== (row.completed_at !== null)) return false;
  if (row.pending_outcome_id !== null) {
    const latest = row.state.history.at(-1);
    if (!latest || latest.outcomeId !== row.pending_outcome_id) return false;
  }
  return true;
}

async function loadRow(
  db: DbClient,
  uid: string,
  scenarioId: string,
): Promise<{ present: false } | { present: true; value: unknown }> {
  const result = await db
    .from('career_game_progress')
    .select(
      'user_id,scenario_id,content_version,state,pending_outcome_id,attempt_id,revision,completed_at,updated_at',
    )
    .eq('user_id', uid)
    .eq('scenario_id', scenarioId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data === null
    ? { present: false }
    : { present: true, value: result.data };
}

interface PersistInput {
  uid: string;
  scenario: Scenario;
  state: GameState;
  pendingOutcomeId: string | null;
  attemptId: string;
  expectedRevision: number | null;
  completedAt: string | null;
  outcome?: Outcome;
}

async function persist(
  db: DbClient,
  input: PersistInput,
): Promise<{ kind: 'persisted'; revision: number } | { kind: 'conflict' }> {
  const evidenceSkillIds = input.outcome?.skillTags ?? [];
  const hasEvidence = evidenceSkillIds.length > 0;
  const historyOrdinal = input.state.history.length;
  const evidenceEventId = hasEvidence && input.outcome
    ? `${input.attemptId}:${historyOrdinal}:${input.outcome.id}`
    : null;
  const { data, error } = await db.rpc('persist_career_game_action', {
    p_user_id: input.uid,
    p_scenario_id: input.scenario.id,
    p_content_version: input.scenario.contentVersion,
    p_expected_revision: input.expectedRevision,
    p_state: input.state,
    p_pending_outcome_id: input.pendingOutcomeId,
    p_attempt_id: input.attemptId,
    p_completed_at: input.completedAt,
    p_evidence_skill_ids: evidenceSkillIds,
    p_evidence_quality: hasEvidence ? (input.outcome?.category ?? null) : null,
    p_evidence_event_id: evidenceEventId,
    p_evidence_source_unit_id: hasEvidence ? (input.outcome?.id ?? null) : null,
  });
  if (error) throw new Error(error.message);
  if (!isRecord(data) || (data.kind !== 'persisted' && data.kind !== 'conflict')) {
    throw new Error('invalid persist result');
  }
  if (data.kind === 'conflict') return { kind: 'conflict' };
  if (!isPositiveInteger(data.revision)) throw new Error('invalid persist revision');
  return { kind: 'persisted', revision: data.revision };
}

export async function handleCareerGameProgress(
  req: HandlerRequest,
  deps: CareerGameProgressHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  const uid = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'));
  if (!uid) return unauthorized();

  const action = parseAction(req.bodyText);
  if (!action) return badRequest('invalid request body');
  const scenario = deps.scenarios.get(action.scenarioId);
  if (!scenario) return badRequest('unknown scenario');

  if (action.contentVersion !== scenario.contentVersion) {
    return clientUpdateRequired(scenario.contentVersion);
  }

  if (action.action === 'reset') {
    const { data, error } = await deps.db.rpc('reset_career_game_progress', {
      p_user_id: uid,
      p_scenario_id: scenario.id,
      p_stored_content_version: action.storedVersion,
      p_attempt_id: action.checkpointId,
      p_expected_revision: action.expectedRevision,
    });
    if (error) {
      deps.log.error({ error: error.message }, 'career game progress reset failed');
      return jsonResult(502, { error: 'progress reset failed' });
    }
    if (!isRecord(data) || (data.kind !== 'none' && data.kind !== 'conflict')) {
      deps.log.error({}, 'career game reset returned an invalid result');
      return jsonResult(502, { error: 'progress reset failed' });
    }
    return data.kind === 'conflict' ? conflict() : jsonResult(200, { kind: 'none' });
  }

  if (action.action === 'start') {
    const state = createInitialState(scenario);
    const attemptId = deps.randomUUID();
    if (!UUID.test(attemptId)) return jsonResult(500, { error: 'invalid server attempt id' });
    try {
      const saved = await persist(deps.db, {
        uid,
        scenario,
        state,
        pendingOutcomeId: null,
        attemptId,
        expectedRevision: null,
        completedAt: state.status === 'completed' ? (deps.now?.() ?? new Date().toISOString()) : null,
      });
      return saved.kind === 'conflict'
        ? conflict()
        : progressResponse(scenario, attemptId, saved.revision, state, null);
    } catch (error) {
      deps.log.error({ error: error instanceof Error ? error.message : String(error) }, 'career game start failed');
      return jsonResult(502, { error: 'progress persistence failed' });
    }
  }

  let loaded: { present: false } | { present: true; value: unknown };
  try {
    loaded = await loadRow(deps.db, uid, scenario.id);
  } catch (error) {
    deps.log.error({ error: error instanceof Error ? error.message : String(error) }, 'career game progress load failed');
    return jsonResult(502, { error: 'progress lookup failed' });
  }
  if (!loaded.present) {
    return action.action === 'load' ? jsonResult(200, { kind: 'none' }) : conflict();
  }
  const identity = asProgressIdentity(loaded.value);
  if (!identity || identity.user_id !== uid || identity.scenario_id !== scenario.id) {
    deps.log.error({}, 'persisted career game progress has invalid identity fields');
    return jsonResult(502, { error: 'persisted progress identity is invalid' });
  }
  if (identity.content_version !== scenario.contentVersion) {
    return resetRequired('content-version-mismatch', scenario.contentVersion, identity);
  }
  const row = asProgressRow(loaded.value);
  if (!row || !validStoredProgress(scenario, row)) {
    return resetRequired('invalid-persisted-progress', scenario.contentVersion, identity);
  }
  if (action.action === 'load') {
    return progressResponse(
      scenario,
      row.attempt_id,
      row.revision,
      row.state,
      row.pending_outcome_id,
    );
  }
  if (action.expectedRevision !== row.revision) return conflict();

  if (action.action === 'acknowledge') {
    if (row.pending_outcome_id === null) return badRequest('no pending outcome to acknowledge');
    try {
      const saved = await persist(deps.db, {
        uid,
        scenario,
        state: row.state,
        pendingOutcomeId: null,
        attemptId: row.attempt_id,
        expectedRevision: row.revision,
        completedAt: row.completed_at,
      });
      return saved.kind === 'conflict'
        ? conflict()
        : progressResponse(scenario, row.attempt_id, saved.revision, row.state, null);
    } catch (error) {
      deps.log.error({ error: error instanceof Error ? error.message : String(error) }, 'career game acknowledge failed');
      return jsonResult(502, { error: 'progress persistence failed' });
    }
  }

  if (row.pending_outcome_id !== null) return badRequest('pending outcome must be acknowledged');
  const advanced = applyChoice(scenario, row.state, {
    scenarioId: scenario.id,
    contentVersion: scenario.contentVersion,
    sceneId: action.sceneId,
    choiceId: action.choiceId,
  });
  if (advanced.kind === 'stale' || advanced.kind === 'invalid') {
    return badRequest(`choice rejected: ${advanced.reason}`);
  }
  const completedAt = advanced.state.status === 'completed'
    ? (deps.now?.() ?? new Date().toISOString())
    : null;
  try {
    const saved = await persist(deps.db, {
      uid,
      scenario,
      state: advanced.state,
      pendingOutcomeId: advanced.outcome.id,
      attemptId: row.attempt_id,
      expectedRevision: row.revision,
      completedAt,
      outcome: advanced.outcome,
    });
    return saved.kind === 'conflict'
      ? conflict()
      : progressResponse(
          scenario,
          row.attempt_id,
          saved.revision,
          advanced.state,
          advanced.outcome.id,
        );
  } catch (error) {
    deps.log.error({ error: error instanceof Error ? error.message : String(error) }, 'career game choice failed');
    return jsonResult(502, { error: 'progress persistence failed' });
  }
}
