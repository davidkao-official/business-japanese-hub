import { describe, expect, it } from 'vitest';
import {
  applyChoice,
  createInitialState,
  getAvailableChoices,
  type Scenario,
} from '@business-japanese-hub/career-game';
import { customerCommunicationScenario } from '../../../apps/career-game/src/content/customer-communication.ts';
import { rookieSurvivalScenario } from '../../../apps/career-game/src/content/rookie-survival.ts';
import { upwardDisagreementScenario } from '../../../apps/career-game/src/content/upward-disagreement.ts';
import {
  careerGameScenarioMap,
  careerGameScenarios,
} from '../../../apps/career-game/src/content/scenario-registry.ts';
import {
  bearerHeaders,
  createMockDb,
  fakeLogger,
  handlerRequest,
} from '../_shared/testing.ts';
import { handleCareerGameProgress } from './handler.ts';

const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001';

function body(value: unknown): string {
  return JSON.stringify(value);
}

function progressRow(
  scenario: Scenario = rookieSurvivalScenario,
  overrides: Record<string, unknown> = {},
) {
  return {
    user_id: 'user-1',
    scenario_id: scenario.id,
    content_version: scenario.contentVersion,
    state: createInitialState(scenario),
    pending_outcome_id: null,
    attempt_id: ATTEMPT_ID,
    revision: 1,
    completed_at: null,
    updated_at: '2026-08-31T00:00:00Z',
    ...overrides,
  };
}

function firstChoice(scenario: Scenario, state: ReturnType<typeof createInitialState>) {
  const choice = getAvailableChoices(scenario, state)[0]
  if (!choice) throw new Error(`Expected an available choice for ${scenario.id}`)
  return choice
}

function setup(routes: Record<string, unknown> = {}) {
  const mock = createMockDb({
    'auth:getUser': { data: { id: 'user-1' } },
    career_game_progress: { data: null },
    'rpc:persist_career_game_action': { data: { kind: 'persisted', revision: 1 } },
    'rpc:reset_career_game_progress': { data: { kind: 'none' } },
    ...routes,
  });
  return {
    mock,
    deps: {
      db: mock.db,
      log: fakeLogger(),
      scenarios: careerGameScenarioMap,
      randomUUID: () => ATTEMPT_ID,
    },
  };
}

async function call(value: unknown, routes: Record<string, unknown> = {}) {
  const { deps, mock } = setup(routes);
  const result = await handleCareerGameProgress(
    handlerRequest(
      'POST',
      'https://test.supabase.co/functions/v1/career-game-progress',
      body(value),
      bearerHeaders('jwt-1'),
    ),
    deps,
  );
  return { result, mock };
}

describe('career-game-progress handler', () => {
  it('requires a verified session and POST', async () => {
    const { deps } = setup();
    const unauthenticated = await handleCareerGameProgress(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/career-game-progress',
        body({
          action: 'load',
          scenarioId: rookieSurvivalScenario.id,
          contentVersion: rookieSurvivalScenario.contentVersion,
        }),
      ),
      deps,
    );
    const wrongMethod = await handleCareerGameProgress(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/career-game-progress'),
      deps,
    );
    expect(unauthenticated.status).toBe(401);
    expect(wrongMethod.status).toBe(405);
  });

  it.each(['userId', 'state', 'skillIds', 'outcomeId', 'pendingOutcomeId'])(
    'rejects the forged/derived %s field',
    async (field) => {
      const { result, mock } = await call({
        action: 'load',
        scenarioId: rookieSurvivalScenario.id,
        contentVersion: rookieSurvivalScenario.contentVersion,
        [field]: field === 'skillIds' ? ['error-reporting'] : 'forged',
      });
      expect(result.status).toBe(400);
      expect(mock.callsFor('career_game_progress')).toHaveLength(0);
    },
  );

  it('rejects malformed JSON, unknown scenarios, and unknown client action shapes', async () => {
    const { deps } = setup();
    const malformed = await handleCareerGameProgress(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/career-game-progress',
        '{',
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    const unknown = await call({ action: 'load', scenarioId: 'not-a-scenario', contentVersion: 1 });
    const legacyLoad = await call({
      action: 'load',
      scenarioId: rookieSurvivalScenario.id,
    });
    const legacyReset = await call({
      action: 'reset',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 1,
    });
    const extra = await call({
      action: 'reset',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 1,
      storedVersion: 1,
      checkpointId: ATTEMPT_ID,
      expectedRevision: 1,
      userId: 'forged',
    });
    expect(malformed.status).toBe(400);
    expect(unknown.result.status).toBe(400);
    expect(legacyLoad.result.status).toBe(400);
    expect(legacyReset.result.status).toBe(400);
    expect(extra.result.status).toBe(400);
  });

  it('returns none when the authenticated user has no checkpoint', async () => {
    const { result, mock } = await call({
      action: 'load',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 1,
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ kind: 'none' });
    expect(mock.callsFor('career_game_progress', 'eq').map((entry) => entry.args)).toEqual([
      ['user_id', 'user-1'],
      ['scenario_id', rookieSurvivalScenario.id],
    ]);
  });

  it('loads only replay-valid canonical progress', async () => {
    const { result } = await call(
      { action: 'load', scenarioId: rookieSurvivalScenario.id, contentVersion: 1 },
      { career_game_progress: { data: progressRow() } },
    );
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      kind: 'progress',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 1,
      checkpointId: ATTEMPT_ID,
      revision: 1,
      snapshot: { state: createInitialState(rookieSurvivalScenario) },
    });
  });

  it('does not confuse a malformed persisted row with no persisted row', async () => {
    const { result } = await call(
      { action: 'load', scenarioId: rookieSurvivalScenario.id, contentVersion: 1 },
      { career_game_progress: { data: { scenario_id: rookieSurvivalScenario.id } } },
    );
    expect(result.status).toBe(502);
    expect(JSON.parse(result.body)).toEqual({ error: 'persisted progress identity is invalid' });
  });

  it('turns stale versions and replay-invalid stored state into deterministic reset responses', async () => {
    const stale = await call(
      { action: 'load', scenarioId: rookieSurvivalScenario.id, contentVersion: 1 },
      {
        career_game_progress: {
          data: progressRow(rookieSurvivalScenario, { content_version: 2 }),
        },
      },
    );
    const invalid = await call(
      { action: 'load', scenarioId: rookieSurvivalScenario.id, contentVersion: 1 },
      {
        career_game_progress: {
          data: progressRow(rookieSurvivalScenario, {
            state: { ...createInitialState(rookieSurvivalScenario), currentSceneId: 'forged' },
          }),
        },
      },
    );
    expect(stale.result.status).toBe(409);
    expect(JSON.parse(stale.result.body)).toEqual({
      kind: 'reset-required',
      reason: 'content-version-mismatch',
      currentVersion: 1,
      storedVersion: 2,
      checkpointId: ATTEMPT_ID,
      revision: 1,
    });
    expect(invalid.result.status).toBe(409);
    expect(JSON.parse(invalid.result.body)).toEqual({
      kind: 'reset-required',
      reason: 'invalid-persisted-progress',
      currentVersion: 1,
      storedVersion: 1,
      checkpointId: ATTEMPT_ID,
      revision: 1,
    });
  });

  it('rejects an old client version before reading or resetting any checkpoint', async () => {
    const oldLoad = await call({
      action: 'load',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 2,
    });
    const oldReset = await call({
      action: 'reset',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 2,
      storedVersion: 1,
      checkpointId: ATTEMPT_ID,
      expectedRevision: 1,
    });
    for (const response of [oldLoad.result, oldReset.result]) {
      expect(response.status).toBe(409);
      expect(JSON.parse(response.body)).toEqual({
        kind: 'client-update-required',
        currentVersion: 1,
      });
    }
    expect(oldLoad.mock.callsFor('career_game_progress')).toHaveLength(0);
    expect(oldReset.mock.callsFor('career_game_progress')).toHaveLength(0);
    expect(oldReset.mock.rpcCalls('reset_career_game_progress')).toHaveLength(0);
  });

  it('starts only the authoritative content version and persists its canonical initial state', async () => {
    const stale = await call({
      action: 'start',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 9,
    });
    expect(stale.result.status).toBe(409);
    expect(JSON.parse(stale.result.body)).toEqual({
      kind: 'client-update-required',
      currentVersion: 1,
    });

    const { result, mock } = await call({
      action: 'start',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 1,
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      kind: 'progress',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 1,
      checkpointId: ATTEMPT_ID,
      revision: 1,
      snapshot: { state: createInitialState(rookieSurvivalScenario) },
    });
    expect(mock.rpcCalls('persist_career_game_action')[0]?.args[0]).toMatchObject({
      p_user_id: 'user-1',
      p_scenario_id: rookieSurvivalScenario.id,
      p_content_version: 1,
      p_expected_revision: null,
      p_state: createInitialState(rookieSurvivalScenario),
      p_pending_outcome_id: null,
      p_attempt_id: ATTEMPT_ID,
      p_evidence_skill_ids: [],
    });
  });

  it.each([customerCommunicationScenario, upwardDisagreementScenario])(
    'starts the registered heterogeneous case %s',
    async (scenario) => {
      const { deps, mock } = setup();
      const result = await handleCareerGameProgress(
        handlerRequest(
          'POST',
          'https://test.supabase.co/functions/v1/career-game-progress',
          body({
            action: 'start',
            scenarioId: scenario.id,
            contentVersion: scenario.contentVersion,
          }),
          bearerHeaders('jwt-1'),
        ),
        deps,
      );

      expect(result.status).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        kind: 'progress',
        scenarioId: scenario.id,
        contentVersion: scenario.contentVersion,
      });
      expect(mock.rpcCalls('persist_career_game_action')[0]?.args[0]).toMatchObject({
        p_scenario_id: scenario.id,
        p_content_version: scenario.contentVersion,
      });
    },
  );

  it.each(careerGameScenarios)(
    'applies a choice server-side and derives evidence from the authored outcome for %s',
    async (scenario) => {
      const initial = createInitialState(scenario);
      const choice = firstChoice(scenario, initial)
      const expected = applyChoice(scenario, initial, {
        scenarioId: scenario.id,
        contentVersion: scenario.contentVersion,
        sceneId: initial.currentSceneId,
        choiceId: choice.id,
      });
      if (expected.kind !== 'advanced') throw new Error('fixture must advance');

      const { result, mock } = await call(
        {
          action: 'choose',
          scenarioId: scenario.id,
          contentVersion: scenario.contentVersion,
          sceneId: initial.currentSceneId,
          choiceId: choice.id,
          checkpointId: ATTEMPT_ID,
          expectedRevision: 1,
        },
        {
          career_game_progress: { data: progressRow(scenario) },
          'rpc:persist_career_game_action': { data: { kind: 'persisted', revision: 2 } },
        },
      );
      expect(result.status).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        kind: 'progress',
        scenarioId: scenario.id,
        contentVersion: scenario.contentVersion,
        checkpointId: ATTEMPT_ID,
        revision: 2,
        snapshot: { state: expected.state, pendingOutcomeId: expected.outcome.id },
      });
      expect(mock.rpcCalls('persist_career_game_action')[0]?.args[0]).toMatchObject({
        p_user_id: 'user-1',
        p_state: expected.state,
        p_pending_outcome_id: expected.outcome.id,
        p_evidence_skill_ids: expected.outcome.skillTags ?? [],
        p_evidence_quality: expected.outcome.category,
        p_evidence_source_unit_id: expected.outcome.id,
      });
    },
  );

  it('persists an authored outcome with no skill tags without fabricating evidence metadata', async () => {
    const firstOutcome = rookieSurvivalScenario.outcomes.find(
      (outcome) => outcome.id === 'greeting-concise-outcome',
    );
    if (!firstOutcome) throw new Error('fixture outcome missing');
    const untaggedScenario: Scenario = {
      ...rookieSurvivalScenario,
      outcomes: rookieSurvivalScenario.outcomes.map((outcome) =>
        outcome.id === firstOutcome.id ? { ...outcome, skillTags: undefined } : outcome,
      ),
    };
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      career_game_progress: { data: progressRow() },
      'rpc:persist_career_game_action': { data: { kind: 'persisted', revision: 2 } },
    });
    const result = await handleCareerGameProgress(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/career-game-progress',
        body({
          action: 'choose',
          scenarioId: untaggedScenario.id,
          contentVersion: 1,
          sceneId: 'file-one-greeting',
          choiceId: 'greeting-concise-choice',
          checkpointId: ATTEMPT_ID,
          expectedRevision: 1,
        }),
        bearerHeaders('jwt-1'),
      ),
      {
        db: mock.db,
        log: fakeLogger(),
        scenarios: new Map([[untaggedScenario.id, untaggedScenario]]),
        randomUUID: () => ATTEMPT_ID,
      },
    );
    expect(result.status).toBe(200);
    expect(mock.rpcCalls('persist_career_game_action')[0]?.args[0]).toMatchObject({
      p_evidence_skill_ids: [],
      p_evidence_quality: null,
      p_evidence_event_id: null,
      p_evidence_source_unit_id: null,
    });
  });

  it.each(careerGameScenarios)(
    'requires pending feedback to be acknowledged before another choice for %s',
    async (scenario) => {
      const initial = createInitialState(scenario)
      const choice = firstChoice(scenario, initial)
      const first = applyChoice(scenario, initial, {
        scenarioId: scenario.id,
        contentVersion: scenario.contentVersion,
        sceneId: initial.currentSceneId,
        choiceId: choice.id,
      });
      if (first.kind !== 'advanced') throw new Error('fixture must advance');
      const nextScene = scenario.scenes.find((scene) => scene.id === first.state.currentSceneId)
      if (!nextScene || nextScene.kind !== 'decision') {
        throw new Error('fixture must have another decision')
      }
      const row = progressRow(scenario, {
        state: first.state,
        pending_outcome_id: first.outcome.id,
        revision: 2,
      });
      const blocked = await call(
        {
          action: 'choose',
          scenarioId: scenario.id,
          contentVersion: scenario.contentVersion,
          sceneId: first.state.currentSceneId,
          choiceId: nextScene.choices[0]!.id,
          checkpointId: ATTEMPT_ID,
          expectedRevision: 2,
        },
        { career_game_progress: { data: row } },
      );
      expect(blocked.result.status).toBe(400);
      expect(blocked.mock.rpcCalls('persist_career_game_action')).toHaveLength(0);

      const acknowledged = await call(
        {
          action: 'acknowledge',
          scenarioId: scenario.id,
          contentVersion: scenario.contentVersion,
          checkpointId: ATTEMPT_ID,
          expectedRevision: 2,
        },
        {
          career_game_progress: { data: row },
          'rpc:persist_career_game_action': { data: { kind: 'persisted', revision: 3 } },
        },
      );
      expect(acknowledged.result.status).toBe(200);
      expect(JSON.parse(acknowledged.result.body).snapshot).toEqual({ state: first.state });
      expect(acknowledged.mock.rpcCalls('persist_career_game_action')[0]?.args[0]).toMatchObject({
        p_pending_outcome_id: null,
        p_evidence_skill_ids: [],
      });
    },
  );

  it.each(careerGameScenarios)(
    'returns conflict without advancement on a stale revision or CAS loss for %s',
    async (scenario) => {
      const initial = createInitialState(scenario)
      const choice = firstChoice(scenario, initial)
      const stale = await call(
        {
          action: 'acknowledge',
          scenarioId: scenario.id,
          contentVersion: scenario.contentVersion,
          checkpointId: ATTEMPT_ID,
          expectedRevision: 2,
        },
        {
          career_game_progress: {
            data: progressRow(scenario, { revision: 1, pending_outcome_id: 'x' }),
          },
        },
      );
      expect(stale.result.status).toBe(409);
      expect(stale.mock.rpcCalls('persist_career_game_action')).toHaveLength(0);

      const lost = await call(
        {
          action: 'choose',
          scenarioId: scenario.id,
          contentVersion: scenario.contentVersion,
          sceneId: initial.currentSceneId,
          choiceId: choice.id,
          checkpointId: ATTEMPT_ID,
          expectedRevision: 1,
        },
        {
          career_game_progress: { data: progressRow(scenario) },
          'rpc:persist_career_game_action': { data: { kind: 'conflict' } },
        },
      );
      expect(lost.result.status).toBe(409);
      expect(JSON.parse(lost.result.body)).toEqual({ kind: 'conflict' });
    },
  );

  it('rejects stale actions when a replacement attempt reuses the same revision', async () => {
    const replacementAttemptId = '10000000-0000-4000-8000-000000000099';
    const replacement = progressRow(rookieSurvivalScenario, {
      attempt_id: replacementAttemptId,
      revision: 1,
    });
    const choose = await call(
      {
        action: 'choose',
        scenarioId: rookieSurvivalScenario.id,
        contentVersion: 1,
        sceneId: 'file-one-greeting',
        choiceId: 'greeting-concise-choice',
        checkpointId: ATTEMPT_ID,
        expectedRevision: 1,
      },
      { career_game_progress: { data: replacement } },
    );
    const acknowledge = await call(
      {
        action: 'acknowledge',
        scenarioId: rookieSurvivalScenario.id,
        contentVersion: 1,
        checkpointId: ATTEMPT_ID,
        expectedRevision: 1,
      },
      { career_game_progress: { data: replacement } },
    );

    for (const attempt of [choose, acknowledge]) {
      expect(attempt.result.status).toBe(409);
      expect(JSON.parse(attempt.result.body)).toEqual({ kind: 'conflict' });
      expect(attempt.mock.rpcCalls('persist_career_game_action')).toHaveLength(0);
    }
  });

  it('resets through an identity/version/revision CAS and surfaces ABA conflicts', async () => {
    const request = {
      action: 'reset',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: 1,
      storedVersion: 1,
      checkpointId: ATTEMPT_ID,
      expectedRevision: 3,
    } as const;
    const { result, mock } = await call(request);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ kind: 'none' });
    expect(mock.rpcCalls('reset_career_game_progress')[0]?.args[0]).toEqual({
      p_user_id: 'user-1',
      p_scenario_id: rookieSurvivalScenario.id,
      p_stored_content_version: 1,
      p_attempt_id: ATTEMPT_ID,
      p_expected_revision: 3,
    });
    expect(mock.callsFor('career_game_progress')).toHaveLength(0);
    expect(mock.callsFor('learning_evidence')).toHaveLength(0);

    const aba = await call(request, {
      'rpc:reset_career_game_progress': { data: { kind: 'conflict' } },
    });
    expect(aba.result.status).toBe(409);
    expect(JSON.parse(aba.result.body)).toEqual({ kind: 'conflict' });
  });
});
