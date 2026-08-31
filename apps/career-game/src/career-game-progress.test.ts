import { applyChoice, createInitialState } from '@business-japanese-hub/career-game'
import { describe, expect, it, vi } from 'vitest'
import { createCareerGameProgressRepository } from './career-game-progress'
import { rookieSurvivalScenario as scenario } from './content/rookie-survival'

const CHECKPOINT_ID = '11111111-1111-4111-8111-111111111111'

function validSnapshot() {
  const state = createInitialState(scenario)
  const scene = scenario.scenes.find((candidate) => candidate.id === state.currentSceneId)
  if (!scene || scene.kind !== 'decision') throw new Error('expected decision')
  const choice = scene.choices[0]!
  const result = applyChoice(scenario, state, {
    scenarioId: scenario.id,
    contentVersion: scenario.contentVersion,
    sceneId: scene.id,
    choiceId: choice.id,
  })
  if (result.kind !== 'advanced') throw new Error(result.kind)
  return { state: result.state, pendingOutcomeId: result.outcome.id }
}

function clientReturning(data: unknown, error: unknown = null) {
  const invoke = vi.fn().mockResolvedValue({ data, error })
  return {
    client: { functions: { invoke } },
    invoke,
  }
}

describe('Career Game progress repository', () => {
  it('sends only the narrow action inputs and never a user id or game state', async () => {
    const { client, invoke } = clientReturning({ kind: 'none' })
    const repository = createCareerGameProgressRepository(client, scenario)

    await repository.load(scenario.id, scenario.contentVersion)
    await repository.start(scenario.id, scenario.contentVersion)
    await repository.choose(
      scenario.id,
      scenario.contentVersion,
      'file-one-greeting',
      'greeting-concise-choice',
      CHECKPOINT_ID,
      4,
    )
    await repository.acknowledge(
      scenario.id,
      scenario.contentVersion,
      CHECKPOINT_ID,
      5,
    )
    await repository.reset(
      scenario.id,
      scenario.contentVersion,
      scenario.contentVersion,
      CHECKPOINT_ID,
      5,
    )

    expect(invoke.mock.calls.map(([, options]) => options.body)).toEqual([
      { action: 'load', scenarioId: 'rookie-survival', contentVersion: 1 },
      { action: 'start', scenarioId: 'rookie-survival', contentVersion: 1 },
      {
        action: 'choose',
        scenarioId: 'rookie-survival',
        contentVersion: 1,
        sceneId: 'file-one-greeting',
        choiceId: 'greeting-concise-choice',
        checkpointId: CHECKPOINT_ID,
        expectedRevision: 4,
      },
      {
        action: 'acknowledge',
        scenarioId: 'rookie-survival',
        contentVersion: 1,
        checkpointId: CHECKPOINT_ID,
        expectedRevision: 5,
      },
      {
        action: 'reset',
        scenarioId: 'rookie-survival',
        contentVersion: 1,
        storedVersion: 1,
        checkpointId: CHECKPOINT_ID,
        expectedRevision: 5,
      },
    ])
    expect(invoke).toHaveBeenCalledTimes(5)
    expect(invoke.mock.calls.every(([name]) => name === 'career-game-progress')).toBe(true)
  })

  it('accepts replay-valid progress and rejects invalid persisted progress explicitly', async () => {
    const snapshot = validSnapshot()
    const { client } = clientReturning({
      kind: 'progress',
      scenarioId: scenario.id,
      contentVersion: scenario.contentVersion,
      checkpointId: CHECKPOINT_ID,
      revision: 2,
      snapshot,
    })
    const repository = createCareerGameProgressRepository(client, scenario)

    await expect(repository.load(scenario.id, scenario.contentVersion)).resolves.toEqual({
      kind: 'progress',
      scenarioId: scenario.id,
      contentVersion: scenario.contentVersion,
      checkpointId: CHECKPOINT_ID,
      revision: 2,
      snapshot,
    })

    const invalid = clientReturning({
      kind: 'progress',
      scenarioId: scenario.id,
      contentVersion: scenario.contentVersion,
      checkpointId: CHECKPOINT_ID,
      revision: 2,
      snapshot: { ...snapshot, pendingOutcomeId: 'forged-outcome' },
    })
    await expect(
      createCareerGameProgressRepository(invalid.client, scenario).load(
        scenario.id,
        scenario.contentVersion,
      ),
    ).resolves.toEqual({
      kind: 'reset-required',
      reason: 'invalid-persisted-progress',
      currentVersion: scenario.contentVersion,
      storedVersion: scenario.contentVersion,
      checkpointId: CHECKPOINT_ID,
      revision: 2,
    })
  })

  it('turns a mismatched progress response into a client update without inverting versions', async () => {
    const { client } = clientReturning({
      kind: 'progress',
      scenarioId: scenario.id,
      contentVersion: scenario.contentVersion + 1,
      checkpointId: CHECKPOINT_ID,
      revision: 2,
      snapshot: validSnapshot(),
    })

    await expect(
      createCareerGameProgressRepository(client, scenario).load(
        scenario.id,
        scenario.contentVersion,
      ),
    ).resolves.toEqual({
      kind: 'client-update-required',
      currentVersion: scenario.contentVersion + 1,
    })
  })

  it('hides transport and malformed response details behind a generic error', async () => {
    const transport = clientReturning(null, {
      message: 'private provider trace for user@example.com',
    })
    const malformed = clientReturning({ private: 'database row details' })

    await expect(
      createCareerGameProgressRepository(transport.client, scenario).load(
        scenario.id,
        scenario.contentVersion,
      ),
    ).rejects.toThrow('Career Game progress request failed')
    await expect(
      createCareerGameProgressRepository(malformed.client, scenario).load(
        scenario.id,
        scenario.contentVersion,
      ),
    ).rejects.toThrow('Career Game progress request failed')
  })

  it('allowlists reset-required and conflict bodies from HTTP 409 responses', async () => {
    const mismatch = clientReturning(null, {
      context: new Response(
        JSON.stringify({
          kind: 'reset-required',
          reason: 'content-version-mismatch',
          currentVersion: 1,
          storedVersion: 2,
          checkpointId: CHECKPOINT_ID,
          revision: 7,
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    })
    const conflict = clientReturning(null, {
      context: new Response(JSON.stringify({ kind: 'conflict' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    })
    const clientUpdate = clientReturning(null, {
      context: new Response(
        JSON.stringify({ kind: 'client-update-required', currentVersion: 2 }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    })

    await expect(
      createCareerGameProgressRepository(mismatch.client, scenario).load(
        scenario.id,
        scenario.contentVersion,
      ),
    ).resolves.toEqual({
      kind: 'reset-required',
      reason: 'content-version-mismatch',
      currentVersion: 1,
      storedVersion: 2,
      checkpointId: CHECKPOINT_ID,
      revision: 7,
    })
    await expect(
      createCareerGameProgressRepository(conflict.client, scenario).load(
        scenario.id,
        scenario.contentVersion,
      ),
    ).resolves.toEqual({ kind: 'conflict' })
    await expect(
      createCareerGameProgressRepository(clientUpdate.client, scenario).load(
        scenario.id,
        scenario.contentVersion,
      ),
    ).resolves.toEqual({ kind: 'client-update-required', currentVersion: 2 })
  })

  it('converts a reset-required response from a newer server into a non-destructive client update', async () => {
    const { client } = clientReturning({
      kind: 'reset-required',
      reason: 'content-version-mismatch',
      currentVersion: 2,
      storedVersion: 1,
      checkpointId: CHECKPOINT_ID,
      revision: 9,
    })

    await expect(
      createCareerGameProgressRepository(client, scenario).load(
        scenario.id,
        scenario.contentVersion,
      ),
    ).resolves.toEqual({ kind: 'client-update-required', currentVersion: 2 })
  })
})
