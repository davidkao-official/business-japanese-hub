import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  applyChoice,
  createInitialState,
  getAvailableChoices,
  getCurrentScene,
  type DecisionScene,
  type GameState,
  type MeterDefinition,
  type Outcome,
  type Scenario,
} from '@business-japanese-hub/career-game'
import { useAuth } from '@business-japanese-hub/platform-auth'
import {
  createCrossProductMovementDeduper,
  noopValidationAnalytics,
  type ValidationAnalytics,
  type ValidationAnalyticsEvent,
} from '@business-japanese-hub/validation-analytics'
import { AccountControl } from './AccountControl'
import type {
  CareerGameProgressRepository,
  CareerGameProgressResponse,
} from './career-game-progress'
import {
  clearGameSession,
  loadGameSession,
  parseGameSessionSnapshot,
  saveGameSession,
  type GameSessionSnapshot,
  type GameSessionStorage,
} from './game-session'
import { careerGameCasePath } from './content/catalog'
import { libraryLinkHref } from './library-links'
import { ProductHeader } from './ProductHeader'

type View = 'intro' | 'playing' | 'feedback' | 'complete'

interface AppModel {
  view: View
  gameState: GameState
  pendingOutcomeId?: string
}

export interface AppProps {
  scenario: Scenario
  availableScenarios?: readonly Scenario[]
  progressRepository?: CareerGameProgressRepository
  analytics?: ValidationAnalytics
  libraryOriginValue?: unknown
}

type SourceStatus =
  | 'auth-loading'
  | 'remote-loading'
  | 'ready'
  | 'load-error'
  | 'reset-required'
  | 'client-update-required'
type ResetRequired = Extract<CareerGameProgressResponse, { kind: 'reset-required' }>
type ClientUpdateRequired = Extract<
  CareerGameProgressResponse,
  { kind: 'client-update-required' }
>

interface RemoteCheckpoint {
  checkpointId: string
  storedVersion: number
  revision: number
}

const categoryLabels: Record<Outcome['category'], string> = {
  strong: '効果的な判断',
  mixed: '状況次第の判断',
  risky: 'リスクのある判断',
}

function getBrowserStorage(): GameSessionStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function initialModel(scenario: Scenario, storage: GameSessionStorage | undefined): AppModel {
  const restored = storage ? loadGameSession(scenario, storage) : null
  if (!restored) {
    return { view: 'intro', gameState: createInitialState(scenario) }
  }
  if (restored.pendingOutcomeId) {
    return {
      view: 'feedback',
      gameState: restored.state,
      pendingOutcomeId: restored.pendingOutcomeId,
    }
  }
  return {
    view: restored.state.status === 'completed' ? 'complete' : 'playing',
    gameState: restored.state,
  }
}

function modelFromSnapshot(snapshot: GameSessionSnapshot): AppModel {
  if (snapshot.pendingOutcomeId) {
    return {
      view: 'feedback',
      gameState: snapshot.state,
      pendingOutcomeId: snapshot.pendingOutcomeId,
    }
  }
  return {
    view: snapshot.state.status === 'completed' ? 'complete' : 'playing',
    gameState: snapshot.state,
  }
}

function trackSafely(analytics: ValidationAnalytics, event: ValidationAnalyticsEvent): void {
  try {
    analytics.track(event)
  } catch {
    // Product navigation and play remain available if analytics is unavailable.
  }
}

function formatFileNumber(value: number): string {
  return String(value).padStart(2, '0')
}

function meterEffectLabel(outcome: Outcome, meter: MeterDefinition): string | undefined {
  const amount = outcome.effects.reduce((total, effect) => {
    return effect.kind === 'adjustMeter' && effect.meterId === meter.id ? total + effect.amount : total
  }, 0)
  if (amount === 0) return undefined
  return `${meter.label} ${amount > 0 ? '+' : ''}${amount}`
}

type ProgressRailState = 'complete' | 'active' | 'pending'

interface ProgressRailEntry {
  key: string
  scene: DecisionScene
  state: ProgressRailState
}

function decisionSceneLabel(scene: DecisionScene): string {
  return scene.title?.trim() || scene.prompt
}

function fixedDecisionPath(scenario: Scenario): DecisionScene[] | undefined {
  const scenesById = new Map(scenario.scenes.map((scene) => [scene.id, scene]))
  const outcomesById = new Map(scenario.outcomes.map((outcome) => [outcome.id, outcome]))
  const visited = new Set<string>()
  const path: DecisionScene[] = []
  let scene = scenesById.get(scenario.startSceneId)

  while (scene?.kind === 'decision') {
    if (visited.has(scene.id)) return undefined
    visited.add(scene.id)
    path.push(scene)

    const nextSceneIds = new Set(
      scene.choices.map((choice) => outcomesById.get(choice.outcomeId)?.nextSceneId),
    )
    if (nextSceneIds.size !== 1) return undefined
    const nextSceneId = nextSceneIds.values().next().value
    if (!nextSceneId) return undefined
    scene = scenesById.get(nextSceneId)
  }

  return scene?.kind === 'terminal' ? path : undefined
}

function ProgressRail({ entries }: { entries: ProgressRailEntry[] }) {
  return (
    <nav className="case-progress" aria-label="ケース進行">
      <p className="case-progress__label" lang="en">
        Case record
      </p>
      <ol>
        {entries.map((entry, index) => {
          const file = index + 1
          return (
            <li
              key={entry.key}
              data-state={entry.state}
              aria-current={entry.state === 'active' ? 'step' : undefined}
            >
              <span className="case-progress__number">{formatFileNumber(file)}</span>
              <span className="case-progress__title">{decisionSceneLabel(entry.scene)}</span>
              <span className="case-progress__state">
                {entry.state === 'complete' ? '済' : entry.state === 'active' ? '現在' : '未'}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function CaseDirectory({
  scenarios,
  activeScenarioId,
  compact = false,
}: {
  scenarios: readonly Scenario[]
  activeScenarioId: string
  compact?: boolean
}) {
  if (scenarios.length < 2) return null

  return (
    <section
      className={`case-directory${compact ? ' case-directory--compact' : ''}`}
      aria-labelledby="case-directory-title"
    >
      <div className="case-directory__header">
        <p className="section-label" lang="en">
          Case register
        </p>
        <h2 id="case-directory-title">ケースを選ぶ</h2>
        <p>同じ職場でも、相手と状況が変われば判断の軸も変わります。</p>
      </div>
      <ul className="case-directory__list">
        {scenarios.map((candidate, index) => {
          const isActive = candidate.id === activeScenarioId
          return (
            <li className="case-directory__item" key={candidate.id}>
              <a
                className="case-directory__link"
                href={careerGameCasePath(candidate)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="case-directory__meta" lang="en">
                  CASE {formatFileNumber(index + 1)} · v{candidate.contentVersion}
                </span>
                <span className="case-directory__title">{candidate.title}</span>
                {candidate.subtitle ? (
                  <span className="case-directory__subtitle">{candidate.subtitle}</span>
                ) : null}
                <span className="case-directory__summary">{candidate.summary}</span>
                <span className="case-directory__open">
                  {isActive ? '現在のケース' : 'ケースを開く'}
                  <span aria-hidden="true">→</span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function MeterReadout({ scenario, gameState }: { scenario: Scenario; gameState: GameState }) {
  if (!scenario.meters?.length) return null
  return (
    <div className="meter-readout" aria-label="現在の状態">
      {scenario.meters.map((meter) => (
        <div className="meter-readout__item" key={meter.id}>
          <div className="meter-readout__labels">
            <span>{meter.label}</span>
            <output aria-label={`${meter.label} ${gameState.meters[meter.id]}`}>
              {gameState.meters[meter.id]}
            </output>
          </div>
          <meter
            min={meter.min}
            max={meter.max}
            value={gameState.meters[meter.id]}
            aria-label={`${meter.label}メーター`}
          />
        </div>
      ))}
    </div>
  )
}

type ResolvedRemoteResponse =
  | { kind: 'none'; model: AppModel }
  | { kind: 'progress'; model: AppModel; checkpoint: RemoteCheckpoint }
  | { kind: 'reset-required'; requirement: ResetRequired }
  | { kind: 'client-update-required'; currentVersion: number }
  | { kind: 'conflict' }

function resolveRemoteResponse(
  scenario: Scenario,
  response: CareerGameProgressResponse,
): ResolvedRemoteResponse {
  if (response.kind === 'none') {
    return {
      kind: 'none',
      model: { view: 'intro', gameState: createInitialState(scenario) },
    }
  }
  if (response.kind === 'client-update-required') return response
  if (response.kind === 'reset-required') {
    if (response.currentVersion !== scenario.contentVersion) {
      return {
        kind: 'client-update-required',
        currentVersion: response.currentVersion,
      }
    }
    return { kind: 'reset-required', requirement: response }
  }
  if (response.kind === 'conflict') return response
  if (response.scenarioId !== scenario.id || response.contentVersion !== scenario.contentVersion) {
    return {
      kind: 'client-update-required',
      currentVersion: response.contentVersion,
    }
  }
  const snapshot = parseGameSessionSnapshot(scenario, response.snapshot)
  if (
    !snapshot ||
    !response.checkpointId ||
    !Number.isSafeInteger(response.revision) ||
    response.revision < 1
  ) {
    return {
      kind: 'reset-required',
      requirement: {
        kind: 'reset-required',
        reason: 'invalid-persisted-progress',
        currentVersion: scenario.contentVersion,
        storedVersion: response.contentVersion,
        checkpointId: response.checkpointId,
        revision: response.revision,
      },
    }
  }
  return {
    kind: 'progress',
    model: modelFromSnapshot(snapshot),
    checkpoint: {
      checkpointId: response.checkpointId,
      storedVersion: response.contentVersion,
      revision: response.revision,
    },
  }
}

export default function App({
  scenario,
  availableScenarios,
  progressRepository,
  analytics = noopValidationAnalytics,
  libraryOriginValue = import.meta.env.VITE_LIBRARY_ORIGIN,
}: AppProps) {
  const { loading: authLoading, user } = useAuth()
  const storage = useMemo(() => getBrowserStorage(), [])
  const [model, setModel] = useState<AppModel>(() => initialModel(scenario, storage))
  const [announcement, setAnnouncement] = useState('')
  const [manageFocus, setManageFocus] = useState(false)
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>('auth-loading')
  const [activeSourceKey, setActiveSourceKey] = useState<string | null>(null)
  const [remoteCheckpoint, setRemoteCheckpoint] = useState<RemoteCheckpoint | null>(null)
  const [resetRequired, setResetRequired] = useState<ResetRequired | null>(null)
  const [clientUpdateRequired, setClientUpdateRequired] =
    useState<ClientUpdateRequired | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState(false)
  const sourceEpoch = useRef(0)
  const actionInFlight = useRef(false)
  const trackedTransitions = useRef(new Set<string>())
  const viewedScenario = useRef<string | null>(null)
  const libraryMovementDeduper = useRef(createCrossProductMovementDeduper())
  const viewHeading = useRef<HTMLHeadingElement>(null)
  const authenticatedUserId = user?.id
  const usesRemoteProgress = Boolean(authenticatedUserId && progressRepository)
  const desiredSourceKey = authLoading
    ? 'auth-loading'
    : usesRemoteProgress
      ? `remote:${authenticatedUserId}:${scenario.id}@${scenario.contentVersion}`
      : `guest:${scenario.id}@${scenario.contentVersion}`
  const visibleSourceStatus: SourceStatus =
    activeSourceKey === desiredSourceKey
      ? sourceStatus
      : usesRemoteProgress
        ? 'remote-loading'
        : 'auth-loading'
  const caseOptions = availableScenarios ?? [scenario]

  const decisions = useMemo(
    () => scenario.scenes.filter((scene): scene is DecisionScene => scene.kind === 'decision'),
    [scenario],
  )
  const pathVisits = useMemo(() => {
    const decisionsById = new Map(decisions.map((decision) => [decision.id, decision]))
    return model.gameState.history.flatMap((record, index) => {
      const decision = decisionsById.get(record.sceneId)
      return decision ? [{ key: `visit:${index}:${decision.id}`, scene: decision }] : []
    })
  }, [decisions, model.gameState.history])
  const linearDecisionPath = useMemo(() => fixedDecisionPath(scenario), [scenario])
  const caseFileSummary = linearDecisionPath
    ? `${linearDecisionPath.length} files`
    : '経路により変動'
  const completedAnnouncement = `ケース内のファイル${model.gameState.history.length}件を完了しました。`
  const currentScene = getCurrentScene(scenario, model.gameState)
  const progressEntries = useMemo<ProgressRailEntry[]>(() => {
    const historyLength = model.gameState.history.length
    if (linearDecisionPath) {
      return linearDecisionPath.map((scene, index) => {
        const file = index + 1
        const state =
          model.view === 'complete' ||
          (model.view === 'playing' && file <= historyLength) ||
          (model.view === 'feedback' && file < historyLength)
            ? 'complete'
            : (model.view === 'playing' && file === historyLength + 1) ||
                (model.view === 'feedback' && file === historyLength)
              ? 'active'
              : 'pending'
        return { key: `linear:${index}:${scene.id}`, scene, state }
      })
    }

    const entries: ProgressRailEntry[] = pathVisits.map((visit, index) => ({
      ...visit,
      state:
        model.view === 'complete' ||
        model.view === 'playing' ||
        index < pathVisits.length - 1
          ? 'complete'
          : 'active',
    }))
    if (currentScene?.kind === 'decision' && model.view === 'playing') {
      entries.push({
        key: `visit:${historyLength}:${currentScene.id}`,
        scene: currentScene,
        state: 'active',
      })
    } else if (
      currentScene?.kind === 'decision' &&
      model.view === 'feedback' &&
      model.gameState.status === 'playing'
    ) {
      entries.push({
        key: `visit:${historyLength}:${currentScene.id}`,
        scene: currentScene,
        state: 'pending',
      })
    }
    return entries
  }, [
    currentScene,
    linearDecisionPath,
    model.gameState.history.length,
    model.gameState.status,
    model.view,
    pathVisits,
  ])
  const availableChoices = getAvailableChoices(scenario, model.gameState)
  const pendingOutcome = model.pendingOutcomeId
    ? scenario.outcomes.find((outcome) => outcome.id === model.pendingOutcomeId)
    : undefined
  const activeFile = Math.max(
    1,
    progressEntries.findIndex((entry) => entry.state === 'active') + 1,
  )
  const fileIndexLabel = linearDecisionPath
    ? `FILE ${formatFileNumber(activeFile)} / ${formatFileNumber(linearDecisionPath.length)}`
    : `FILE ${formatFileNumber(activeFile)}`

  useEffect(() => {
    if (visibleSourceStatus !== 'ready') return
    if (viewedScenario.current === scenario.id) return
    viewedScenario.current = scenario.id
    trackSafely(analytics, { event: 'case_viewed', scenarioId: scenario.id })
  }, [analytics, scenario.id, visibleSourceStatus])

  useEffect(() => {
    trackedTransitions.current.clear()
  }, [scenario.id, scenario.contentVersion])

  useEffect(() => {
    const epoch = sourceEpoch.current + 1
    sourceEpoch.current = epoch
    let active = true
    actionInFlight.current = false

    void (async () => {
      await Promise.resolve()
      if (!active || sourceEpoch.current !== epoch) return
      setActionPending(false)
      setActionError(false)
      setResetRequired(null)
      setClientUpdateRequired(null)

      if (authLoading) {
        setSourceStatus('auth-loading')
        setActiveSourceKey(desiredSourceKey)
        return
      }

      if (!authenticatedUserId || !progressRepository) {
        setRemoteCheckpoint(null)
        setModel(initialModel(scenario, storage))
        setSourceStatus('ready')
        setActiveSourceKey(desiredSourceKey)
        return
      }

      setSourceStatus('remote-loading')
      setActiveSourceKey(desiredSourceKey)
      try {
        const response = await progressRepository.load(scenario.id, scenario.contentVersion)
        if (!active || sourceEpoch.current !== epoch) return
        const resolved = resolveRemoteResponse(scenario, response)
        if (resolved.kind === 'conflict') {
          setSourceStatus('load-error')
          return
        }
        if (resolved.kind === 'client-update-required') {
          setClientUpdateRequired(resolved)
          setRemoteCheckpoint(null)
          setSourceStatus('client-update-required')
          return
        }
        if (resolved.kind === 'reset-required') {
          setResetRequired(resolved.requirement)
          setRemoteCheckpoint({
            checkpointId: resolved.requirement.checkpointId,
            storedVersion: resolved.requirement.storedVersion,
            revision: resolved.requirement.revision,
          })
          setSourceStatus('reset-required')
          return
        }
        setModel(resolved.model)
        setRemoteCheckpoint(resolved.kind === 'progress' ? resolved.checkpoint : null)
        setSourceStatus('ready')
      } catch {
        if (active && sourceEpoch.current === epoch) setSourceStatus('load-error')
      }
    })()

    return () => { active = false }
  }, [authLoading, authenticatedUserId, desiredSourceKey, progressRepository, scenario, storage])

  useEffect(() => {
    if (!manageFocus) return
    viewHeading.current?.focus()
  }, [manageFocus, model.gameState.currentSceneId, model.pendingOutcomeId, model.view])

  function moveTo(next: AppModel, message: string) {
    setManageFocus(true)
    setAnnouncement(message)
    setModel(next)
  }

  function trackTransition(key: string, event: ValidationAnalyticsEvent): void {
    if (trackedTransitions.current.has(key)) return
    trackedTransitions.current.add(key)
    trackSafely(analytics, event)
  }

  function trackGameToLibrary(event: MouseEvent<HTMLAnchorElement>): void {
    const isAuxiliaryClick = event.type === 'auxclick'
    if (isAuxiliaryClick ? event.button !== 1 : event.button !== 0) return
    const keepsPageMounted =
      isAuxiliaryClick || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (!libraryMovementDeduper.current.shouldTrack(
      keepsPageMounted,
      event.currentTarget.href,
    )) return
    trackSafely(analytics, {
      event: 'cross_product_link_clicked',
      scenarioId: scenario.id,
      direction: 'career_game_to_library',
    })
  }

  function adoptRemoteProgress(
    response: CareerGameProgressResponse,
    message: string,
  ): 'progress' | 'reset-required' | 'client-update-required' | false {
    const resolved = resolveRemoteResponse(scenario, response)
    if (resolved.kind === 'client-update-required') {
      setClientUpdateRequired(resolved)
      setResetRequired(null)
      setRemoteCheckpoint(null)
      setSourceStatus('client-update-required')
      return 'client-update-required'
    }
    if (resolved.kind === 'reset-required') {
      setResetRequired(resolved.requirement)
      setRemoteCheckpoint({
        checkpointId: resolved.requirement.checkpointId,
        storedVersion: resolved.requirement.storedVersion,
        revision: resolved.requirement.revision,
      })
      setSourceStatus('reset-required')
      return 'reset-required'
    }
    if (resolved.kind !== 'progress') return false
    setClientUpdateRequired(null)
    setResetRequired(null)
    setRemoteCheckpoint(resolved.checkpoint)
    setSourceStatus('ready')
    moveTo(resolved.model, message)
    return 'progress'
  }

  function runRemoteProgressAction(
    request: () => Promise<CareerGameProgressResponse>,
    message: string,
    onProgress?: (
      progress: Extract<ResolvedRemoteResponse, { kind: 'progress' }>,
    ) => void,
  ) {
    if (!progressRepository || actionInFlight.current) return
    const epoch = sourceEpoch.current
    actionInFlight.current = true
    setActionPending(true)
    setActionError(false)

    void request()
      .then(async (response) => {
        if (sourceEpoch.current !== epoch) return
        if (response.kind === 'conflict') {
          const latest = await progressRepository.load(scenario.id, scenario.contentVersion)
          if (sourceEpoch.current !== epoch) return
          const resolved = resolveRemoteResponse(scenario, latest)
          if (resolved.kind === 'none') {
            setRemoteCheckpoint(null)
            moveTo(resolved.model, '最新の進行を読み込みました。')
            return
          }
          if (!adoptRemoteProgress(latest, '最新の進行を読み込みました。')) {
            throw new Error('progress conflict reconciliation failed')
          }
          return
        }
        const adopted = adoptRemoteProgress(response, message)
        if (!adopted) throw new Error('unexpected progress response')
        if (adopted === 'progress' && onProgress) {
          const resolved = resolveRemoteResponse(scenario, response)
          if (resolved.kind === 'progress') onProgress(resolved)
        }
      })
      .catch(() => {
        if (sourceEpoch.current === epoch) setActionError(true)
      })
      .finally(() => {
        if (sourceEpoch.current === epoch) {
          actionInFlight.current = false
          setActionPending(false)
        }
      })
  }

  function startCase() {
    const gameState = createInitialState(scenario)
    const startsComplete = gameState.status === 'completed'
    const startAnnouncement = startsComplete
      ? 'ケースを開始し、完了画面を表示しました。'
      : 'FILE 01を開始しました。'
    if (usesRemoteProgress) {
      runRemoteProgressAction(
        () => progressRepository!.start(scenario.id, scenario.contentVersion),
        startAnnouncement,
        (progress) => {
          if (
            (progress.model.view !== 'playing' && progress.model.view !== 'complete') ||
            progress.model.gameState.history.length !== 0
          ) {
            return
          }
          trackedTransitions.current.clear()
          trackTransition(`started:${progress.checkpoint.checkpointId}`, {
            event: 'case_started',
            scenarioId: scenario.id,
          })
        },
      )
      return
    }
    if (trackedTransitions.current.has('started:guest')) return
    if (storage) saveGameSession(scenario, { state: gameState }, storage)
    trackedTransitions.current.clear()
    moveTo({ view: startsComplete ? 'complete' : 'playing', gameState }, startAnnouncement)
    trackTransition('started:guest', { event: 'case_started', scenarioId: scenario.id })
  }

  function selectChoice(event: MouseEvent<HTMLButtonElement>) {
    const choiceId = event.currentTarget.dataset.choiceId
    if (!choiceId) return
    if (currentScene?.kind !== 'decision') return
    if (usesRemoteProgress) {
      if (!remoteCheckpoint) {
        setActionError(true)
        return
      }
      const transitionKey = [
        'outcome',
        remoteCheckpoint.checkpointId,
        remoteCheckpoint.revision,
        currentScene.id,
        choiceId,
      ].join(':')
      runRemoteProgressAction(
        () =>
          progressRepository!.choose(
            scenario.id,
            scenario.contentVersion,
            currentScene.id,
            choiceId,
            remoteCheckpoint.checkpointId,
            remoteCheckpoint.revision,
          ),
        '判断の結果と解説を表示しました。',
        (progress) => {
          const outcome = progress.model.pendingOutcomeId
            ? scenario.outcomes.find(
                (candidate) => candidate.id === progress.model.pendingOutcomeId,
              )
            : undefined
          if (progress.model.view !== 'feedback' || !outcome) return
          trackTransition(transitionKey, {
            event: 'case_outcome',
            scenarioId: scenario.id,
            outcomeCategory: outcome.category,
          })
        },
      )
      return
    }
    const transitionKey = [
      'outcome',
      'guest',
      model.gameState.history.length,
      currentScene.id,
      choiceId,
    ].join(':')
    if (trackedTransitions.current.has(transitionKey)) return
    const result = applyChoice(scenario, model.gameState, {
      scenarioId: scenario.id,
      contentVersion: scenario.contentVersion,
      sceneId: model.gameState.currentSceneId,
      choiceId,
    })

    if (result.kind !== 'advanced' && result.kind !== 'completed') {
      setAnnouncement('選択を反映できませんでした。現在のファイルでもう一度お試しください。')
      return
    }

    const snapshot = { state: result.state, pendingOutcomeId: result.outcome.id }
    if (storage) saveGameSession(scenario, snapshot, storage)
    moveTo(
      { view: 'feedback', gameState: result.state, pendingOutcomeId: result.outcome.id },
      `${categoryLabels[result.outcome.category]}。結果と解説を表示しました。`,
    )
    trackTransition(transitionKey, {
      event: 'case_outcome',
      scenarioId: scenario.id,
      outcomeCategory: result.outcome.category,
    })
  }

  function continueAfterFeedback() {
    if (usesRemoteProgress) {
      if (!remoteCheckpoint) {
        setActionError(true)
        return
      }
      runRemoteProgressAction(
        () =>
          progressRepository!.acknowledge(
            scenario.id,
            scenario.contentVersion,
            remoteCheckpoint.checkpointId,
            remoteCheckpoint.revision,
        ),
        model.gameState.status === 'completed'
          ? completedAnnouncement
          : `FILE ${formatFileNumber(model.gameState.history.length + 1)}へ進みました。`,
        (progress) => {
          if (progress.model.view !== 'complete') return
          trackTransition(
            `completed:${progress.checkpoint.checkpointId}:${progress.checkpoint.revision}`,
            { event: 'case_completed', scenarioId: scenario.id },
          )
        },
      )
      return
    }
    const view = model.gameState.status === 'completed' ? 'complete' : 'playing'
    if (storage) saveGameSession(scenario, { state: model.gameState }, storage)
    moveTo(
      { view, gameState: model.gameState },
      view === 'complete'
        ? completedAnnouncement
        : `FILE ${formatFileNumber(model.gameState.history.length + 1)}へ進みました。`,
    )
    if (view === 'complete') {
      trackTransition(`completed:guest:${model.gameState.history.length}`, {
        event: 'case_completed',
        scenarioId: scenario.id,
      })
    }
  }

  function replayCase() {
    const replayedCompletedCase = visibleSourceStatus === 'ready' && model.view === 'complete'
    if (usesRemoteProgress) {
      if (!progressRepository || actionInFlight.current) return
      const checkpoint = remoteCheckpoint
      if (!checkpoint) {
        setActionError(true)
        return
      }
      const epoch = sourceEpoch.current
      actionInFlight.current = true
      setActionPending(true)
      setActionError(false)
      void progressRepository
        .reset(
          scenario.id,
          scenario.contentVersion,
          checkpoint.storedVersion,
          checkpoint.checkpointId,
          checkpoint.revision,
        )
        .then(async (response) => {
          if (sourceEpoch.current !== epoch) return
          if (response.kind === 'conflict') {
            const latest = await progressRepository.load(scenario.id, scenario.contentVersion)
            if (sourceEpoch.current !== epoch) return
            const resolved = resolveRemoteResponse(scenario, latest)
            if (resolved.kind === 'none') {
              setResetRequired(null)
              setRemoteCheckpoint(null)
              setSourceStatus('ready')
              moveTo(
                { view: 'intro', gameState: createInitialState(scenario) },
                '最新の進行を読み込みました。',
              )
              return
            }
            if (!adoptRemoteProgress(latest, '最新の進行を読み込みました。')) {
              throw new Error('reset conflict reconciliation failed')
            }
            return
          }
          if (response.kind !== 'none') {
            if (!adoptRemoteProgress(response, '最新の進行を読み込みました。')) {
              throw new Error('unexpected reset response')
            }
            return
          }
          setResetRequired(null)
          setClientUpdateRequired(null)
          setRemoteCheckpoint(null)
          setSourceStatus('ready')
          trackedTransitions.current.clear()
          moveTo(
            { view: 'intro', gameState: createInitialState(scenario) },
            '記録をリセットしました。ケースを最初から開始できます。',
          )
          if (replayedCompletedCase) {
            trackTransition(
              `replayed:${checkpoint.checkpointId}:${checkpoint.revision}`,
              { event: 'case_replayed', scenarioId: scenario.id },
            )
          }
        })
        .catch(() => {
          if (sourceEpoch.current === epoch) setActionError(true)
        })
        .finally(() => {
          if (sourceEpoch.current === epoch) {
            actionInFlight.current = false
            setActionPending(false)
          }
        })
      return
    }
    const replayKey = `replayed:guest:${model.gameState.history.length}`
    if (replayedCompletedCase && trackedTransitions.current.has(replayKey)) return
    if (storage) clearGameSession(scenario, storage)
    trackedTransitions.current.clear()
    moveTo(
      { view: 'intro', gameState: createInitialState(scenario) },
      '記録をリセットしました。ケースを最初から開始できます。',
    )
    if (replayedCompletedCase) {
      trackTransition(replayKey, { event: 'case_replayed', scenarioId: scenario.id })
    }
  }

  function retryRemoteLoad() {
    if (!authenticatedUserId || !progressRepository || actionInFlight.current) return
    const epoch = sourceEpoch.current
    actionInFlight.current = true
    setActionError(false)
    setSourceStatus('remote-loading')
    void progressRepository
      .load(scenario.id, scenario.contentVersion)
      .then((response) => {
        if (sourceEpoch.current !== epoch) return
        const resolved = resolveRemoteResponse(scenario, response)
        if (resolved.kind === 'conflict') throw new Error('unexpected load conflict')
        if (resolved.kind === 'client-update-required') {
          setClientUpdateRequired(resolved)
          setResetRequired(null)
          setRemoteCheckpoint(null)
          setSourceStatus('client-update-required')
          return
        }
        if (resolved.kind === 'reset-required') {
          setResetRequired(resolved.requirement)
          setRemoteCheckpoint({
            checkpointId: resolved.requirement.checkpointId,
            storedVersion: resolved.requirement.storedVersion,
            revision: resolved.requirement.revision,
          })
          setSourceStatus('reset-required')
          return
        }
        setModel(resolved.model)
        setRemoteCheckpoint(resolved.kind === 'progress' ? resolved.checkpoint : null)
        setSourceStatus('ready')
      })
      .catch(() => {
        if (sourceEpoch.current === epoch) setSourceStatus('load-error')
      })
      .finally(() => {
        if (sourceEpoch.current === epoch) actionInFlight.current = false
      })
  }

  function reloadApplication() {
    window.location.reload()
  }

  function renderSourceStatus() {
    if (visibleSourceStatus === 'auth-loading' || visibleSourceStatus === 'remote-loading') {
      return (
        <section className="progress-status-panel" aria-labelledby="progress-loading-title" role="status">
          <p className="section-label">Progress</p>
          <h1 id="progress-loading-title">進行を確認しています</h1>
          <p>保存済みのケース記録を安全に読み込んでいます。</p>
        </section>
      )
    }
    if (visibleSourceStatus === 'load-error') {
      return (
        <section className="progress-status-panel" aria-labelledby="progress-error-title">
          <p className="section-label">Progress unavailable</p>
          <h1 id="progress-error-title">進行を読み込めませんでした</h1>
          <p>ゲスト記録へは切り替えず、共通アカウントの進行をもう一度確認します。</p>
          <button className="primary-action" type="button" onClick={retryRemoteLoad}>
            再読み込み
            <span aria-hidden="true">↻</span>
          </button>
        </section>
      )
    }
    if (visibleSourceStatus === 'client-update-required') {
      return (
        <section className="progress-status-panel" aria-labelledby="client-update-title">
          <p className="section-label">Client update required</p>
          <h1 id="client-update-title">アプリを更新してください</h1>
          <p>
            このページのケースデータは古いため、保存済みの進行には変更を加えていません。
            サーバー上の最新版は v{clientUpdateRequired?.currentVersion} です。
          </p>
          <button className="primary-action" type="button" onClick={reloadApplication}>
            ページを再読み込み
            <span aria-hidden="true">↻</span>
          </button>
        </section>
      )
    }
    if (visibleSourceStatus === 'reset-required') {
      const mismatch = resetRequired?.reason === 'content-version-mismatch'
      return (
        <section className="progress-status-panel" aria-labelledby="progress-reset-title">
          <p className="section-label">Reset required</p>
          <h1 id="progress-reset-title">進行をリセットしてください</h1>
          <p>
            {mismatch
              ? 'ケース内容が更新されたため、以前の進行を安全に再開できません。'
              : '保存済みの進行を検証できなかったため、安全に再開できません。'}
          </p>
          {actionError ? (
            <p className="progress-action-error" role="alert">
              進行を同期できませんでした。もう一度お試しください。
            </p>
          ) : null}
          <button
            className="primary-action"
            type="button"
            disabled={actionPending}
            onClick={replayCase}
          >
            {actionPending ? 'リセット中…' : '保存済み進行をリセット'}
            <span aria-hidden="true">↺</span>
          </button>
        </section>
      )
    }
    return null
  }

  function renderIntro() {
    return (
      <section className="case-cover" aria-labelledby="case-title">
        <div className="case-cover__registry" aria-hidden="true">
          <span lang="en">Case file</span>
          <span>機密区分｜学習用</span>
        </div>
        <div className="case-cover__content">
          <p className="case-eyebrow" lang="en">
            Workplace simulation
          </p>
          <h1 id="case-title" ref={viewHeading} tabIndex={-1}>
            {scenario.title}
          </h1>
          {scenario.subtitle ? <p className="case-cover__subtitle">{scenario.subtitle}</p> : null}
          <p className="case-cover__summary">{scenario.summary}</p>

          <dl className="case-facts">
            <div>
              <dt>記録</dt>
              <dd>{caseFileSummary}</dd>
            </div>
            <div>
              <dt>アクセス</dt>
              <dd>無料・登録不要</dd>
            </div>
          </dl>

          <div className="case-cover__actions">
            <button
              className="primary-action"
              type="button"
              disabled={actionPending}
              onClick={startCase}
            >
              {actionPending ? '開始中…' : 'ケースを開始'}
              <span aria-hidden="true">→</span>
            </button>
            <p>
              {usesRemoteProgress
                ? '進行は共通アカウントに保存されます。'
                : '進行はこの端末にのみ保存されます。アカウントや支払いは必要ありません。'}
            </p>
          </div>
        </div>
        <p className="case-cover__stamp" aria-hidden="true">
          研修資料
        </p>
      </section>
    )
  }

  function renderScene() {
    if (currentScene?.kind !== 'decision') return null
    return (
      <article className="case-sheet scene-sheet" aria-labelledby="scene-title">
        <header className="case-sheet__header">
          <p className="file-index">
            {fileIndexLabel}
          </p>
          <p className="case-sheet__context">{currentScene.context}</p>
          <h1 id="scene-title" ref={viewHeading} tabIndex={-1}>
            {decisionSceneLabel(currentScene)}
          </h1>
        </header>

        {currentScene.narrative ? (
          <p className="scene-sheet__narrative">{currentScene.narrative}</p>
        ) : null}

        {currentScene.dialogue?.length ? (
          <div className="dialogue" aria-label="会話">
            {currentScene.dialogue.map((line, index) => {
              const character = scenario.characters.find((value) => value.id === line.characterId)
              return (
                <blockquote key={`${line.characterId}-${index}`}>
                  <footer>
                    <span>{character?.name}</span>
                    {character?.role ? <small>{character.role}</small> : null}
                  </footer>
                  <p>「{line.text}」</p>
                </blockquote>
              )
            })}
          </div>
        ) : null}

        <fieldset className="decision-panel">
          <legend>あなたの判断</legend>
          <p className="decision-panel__prompt">{currentScene.prompt}</p>
          <div className="decision-list">
            {availableChoices.map((choice, index) => (
              <button
                key={choice.id}
                className="decision-choice"
                type="button"
                disabled={actionPending}
                data-choice-id={choice.id}
                onClick={selectChoice}
              >
                <span className="decision-choice__number" aria-hidden="true">
                  {formatFileNumber(index + 1)}
                </span>
                <span>{choice.label}</span>
                <span className="decision-choice__arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      </article>
    )
  }

  function renderFeedback() {
    if (!pendingOutcome) return null
    const lastHistory = model.gameState.history.at(-1)
    const sourceScene = lastHistory
      ? decisions.find((scene) => scene.id === lastHistory.sceneId)
      : undefined
    const effectLabels = (scenario.meters ?? [])
      .map((meter) => meterEffectLabel(pendingOutcome, meter))
      .filter((value): value is string => value !== undefined)

    return (
      <article
        className={`case-sheet feedback-sheet feedback-sheet--${pendingOutcome.category}`}
        aria-labelledby="feedback-title"
        aria-live="polite"
      >
        <header className="case-sheet__header">
          <p className="file-index">
            {fileIndexLabel}
          </p>
          {sourceScene ? (
            <p className="case-sheet__context">{decisionSceneLabel(sourceScene)}</p>
          ) : null}
          <h1 id="feedback-title" ref={viewHeading} tabIndex={-1}>
            判断の結果
          </h1>
        </header>

        <div className="outcome-verdict">
          <p className="outcome-verdict__category">{categoryLabels[pendingOutcome.category]}</p>
          {effectLabels.map((label) => (
            <strong key={label}>{label}</strong>
          ))}
        </div>

        <section className="outcome-section" aria-labelledby="consequence-title">
          <p className="section-label" id="consequence-title">
            その場で起きたこと
          </p>
          <p className="outcome-section__lead">{pendingOutcome.consequence}</p>
        </section>

        <section className="outcome-section" aria-labelledby="analysis-title">
          <p className="section-label" id="analysis-title">
            なぜそうなるか
          </p>
          <p>{pendingOutcome.feedback}</p>
        </section>

        <section className="expression-note" aria-labelledby="expression-title">
          <p className="section-label" id="expression-title">
            この場面で使える表現
          </p>
          <p className="expression-note__primary">「{pendingOutcome.recommendedExpression}」</p>
          {pendingOutcome.acceptableAlternatives.length ? (
            <div className="expression-note__alternatives">
              <span>別の言い方</span>
              <ul>
                {pendingOutcome.acceptableAlternatives.map((alternative) => (
                  <li key={alternative}>「{alternative}」</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {pendingOutcome.libraryLinks?.[0] ? (
          <aside className="library-follow-up" aria-label="関連するLibraryコンテンツ">
            <p className="section-label">Continue learning</p>
            <a
              href={libraryLinkHref(pendingOutcome.libraryLinks[0], libraryOriginValue)}
              onClick={trackGameToLibrary}
              onAuxClick={trackGameToLibrary}
            >
              Libraryで関連内容を読む
              <span aria-hidden="true">→</span>
            </a>
          </aside>
        ) : null}

        <div className="sheet-actions">
          <button
            className="primary-action"
            type="button"
            disabled={actionPending}
            onClick={continueAfterFeedback}
          >
            {actionPending
              ? '保存中…'
              : model.gameState.status === 'completed'
                ? '結果を見る'
                : '次のファイルへ'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </article>
    )
  }

  function renderCompletion() {
    const terminal = currentScene?.kind === 'terminal' ? currentScene : undefined
    const categoryCounts = model.gameState.history.reduce<Record<Outcome['category'], number>>(
      (counts, record) => {
        const outcome = scenario.outcomes.find((value) => value.id === record.outcomeId)
        if (outcome) counts[outcome.category] += 1
        return counts
      },
      { strong: 0, mixed: 0, risky: 0 },
    )

    return (
      <article className="case-sheet completion-sheet" aria-labelledby="completion-title">
        <header className="case-sheet__header">
          <p className="file-index" lang="en">
            Case closed
          </p>
          <p className="case-sheet__context">{terminal?.context}</p>
          <h1 id="completion-title" ref={viewHeading} tabIndex={-1}>
            ケース完了
          </h1>
        </header>

        <p className="completion-sheet__lead">{terminal?.completion.summary}</p>

        <div className="result-ledger" aria-label="プレイ結果">
          <div>
            <span>完了ファイル</span>
            <strong>{model.gameState.history.length} / {pathVisits.length}</strong>
          </div>
          {(scenario.meters ?? []).map((meter) => (
            <div key={meter.id}>
              <span>{meter.label}</span>
              <strong>{meter.label} {model.gameState.meters[meter.id]}</strong>
            </div>
          ))}
        </div>

        {model.gameState.history.length > 0 ? (
          <section className="judgment-summary" aria-labelledby="judgment-summary-title">
            <p className="section-label" id="judgment-summary-title">
              判断の内訳
            </p>
            <ul>
              {(Object.keys(categoryLabels) as Outcome['category'][]).map((category) => (
                <li key={category}>
                  <span>{categoryLabels[category]}</span>
                  <strong>{categoryCounts[category]}</strong>
                </li>
              ))}
            </ul>
            <p>同じ場面でも、関係性や状況によって最善の言い方は変わる。別の選択も試してみよう。</p>
          </section>
        ) : null}

        <div className="sheet-actions">
          <button
            className="primary-action"
            type="button"
            disabled={actionPending}
            onClick={replayCase}
          >
            {actionPending ? 'リセット中…' : 'もう一度プレイ'}
            <span aria-hidden="true">↺</span>
          </button>
        </div>
      </article>
    )
  }

  const showGameLayout = visibleSourceStatus === 'ready' && model.view !== 'intro'
  const showCaseDirectory =
    visibleSourceStatus !== 'auth-loading' && visibleSourceStatus !== 'remote-loading'

  return (
    <div className="career-game-shell">
      <a className="career-game-skip-link" href="#career-game-main">
        本文へスキップ
      </a>

      <ProductHeader
        libraryOriginValue={libraryOriginValue}
        onLibraryClick={trackGameToLibrary}
        account={<AccountControl remotePersistenceAvailable={Boolean(progressRepository)} />}
      />

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <main
        className={`career-game-main${showGameLayout ? ' career-game-main--play' : ''}`}
        id="career-game-main"
        tabIndex={-1}
      >
        {visibleSourceStatus !== 'ready' ? renderSourceStatus() : null}
        {visibleSourceStatus === 'ready' && actionError ? (
          <p className="progress-action-error" role="alert">
            進行を同期できませんでした。もう一度お試しください。
          </p>
        ) : null}
        {visibleSourceStatus === 'ready' && model.view === 'intro' ? renderIntro() : null}
        {showGameLayout ? (
          <div
            className={`game-layout${
              progressEntries.length === 0 ? ' game-layout--without-progress' : ''
            }`}
          >
            {progressEntries.length > 0 ? <ProgressRail entries={progressEntries} /> : null}
            <div className="game-stage">
              <MeterReadout scenario={scenario} gameState={model.gameState} />
              {model.view === 'playing' ? renderScene() : null}
              {model.view === 'feedback' ? renderFeedback() : null}
              {model.view === 'complete' ? renderCompletion() : null}
            </div>
          </div>
        ) : null}
        {showCaseDirectory ? (
          <CaseDirectory
            scenarios={caseOptions}
            activeScenarioId={scenario.id}
            compact={showGameLayout}
          />
        ) : null}
      </main>
    </div>
  )
}
