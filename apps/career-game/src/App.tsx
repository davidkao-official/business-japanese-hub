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
} from '@business-japanese-hub/career-game'
import { useAuth } from '@business-japanese-hub/platform-auth'
import { AccountControl } from './AccountControl'
import type {
  CareerGameProgressRepository,
  CareerGameProgressResponse,
} from './career-game-progress'
import { rookieSurvivalScenario as scenario } from './content/rookie-survival'
import {
  clearGameSession,
  loadGameSession,
  parseGameSessionSnapshot,
  saveGameSession,
  type GameSessionSnapshot,
  type GameSessionStorage,
} from './game-session'

type View = 'intro' | 'playing' | 'feedback' | 'complete'

interface AppModel {
  view: View
  gameState: GameState
  pendingOutcomeId?: string
}

export interface AppProps {
  progressRepository?: CareerGameProgressRepository
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

const CANONICAL_LIBRARY_ORIGIN = 'https://business-japanese-hub.pages.dev'

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

function initialModel(storage: GameSessionStorage | undefined): AppModel {
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

function libraryOrigin(environmentValue: unknown): string {
  if (typeof environmentValue !== 'string') return CANONICAL_LIBRARY_ORIGIN
  try {
    const candidate = new URL(environmentValue)
    const safeProtocol =
      candidate.protocol === 'https:' ||
      (candidate.protocol === 'http:' &&
        (candidate.hostname === 'localhost' || candidate.hostname === '127.0.0.1'))
    if (
      !safeProtocol ||
      candidate.username ||
      candidate.password ||
      candidate.search ||
      candidate.hash ||
      (candidate.pathname !== '/' && candidate.pathname !== '')
    ) {
      return CANONICAL_LIBRARY_ORIGIN
    }
    return candidate.origin
  } catch {
    return CANONICAL_LIBRARY_ORIGIN
  }
}

function libraryLinkHref(link: NonNullable<Outcome['libraryLinks']>[number]): string {
  const parameters = new URLSearchParams({ bookId: link.bookId })
  if (link.chapterId) parameters.set('chapterId', link.chapterId)
  if (link.blockId) parameters.set('blockId', link.blockId)
  return `${libraryOrigin(import.meta.env.VITE_LIBRARY_ORIGIN)}/library-link?${parameters}`
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

function ProgressRail({
  decisions,
  activeFile,
  completedFiles,
}: {
  decisions: DecisionScene[]
  activeFile: number
  completedFiles: number
}) {
  return (
    <nav className="case-progress" aria-label="ケース進行">
      <p className="case-progress__label" lang="en">
        Case record
      </p>
      <ol>
        {decisions.map((scene, index) => {
          const file = index + 1
          const state = file <= completedFiles ? 'complete' : file === activeFile ? 'active' : 'pending'
          return (
            <li key={scene.id} data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
              <span className="case-progress__number">{formatFileNumber(file)}</span>
              <span className="case-progress__title">{scene.title}</span>
              <span className="case-progress__state">
                {state === 'complete' ? '済' : state === 'active' ? '現在' : '未'}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function MeterReadout({ gameState }: { gameState: GameState }) {
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

function resolveRemoteResponse(response: CareerGameProgressResponse): ResolvedRemoteResponse {
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

export default function App({ progressRepository }: AppProps) {
  const { loading: authLoading, user } = useAuth()
  const storage = useMemo(() => getBrowserStorage(), [])
  const [model, setModel] = useState<AppModel>(() => initialModel(storage))
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
  const viewHeading = useRef<HTMLHeadingElement>(null)
  const authenticatedUserId = user?.id
  const usesRemoteProgress = Boolean(authenticatedUserId && progressRepository)
  const desiredSourceKey = authLoading
    ? 'auth-loading'
    : usesRemoteProgress
      ? `remote:${authenticatedUserId}`
      : 'guest'
  const visibleSourceStatus: SourceStatus =
    activeSourceKey === desiredSourceKey
      ? sourceStatus
      : usesRemoteProgress
        ? 'remote-loading'
        : 'auth-loading'

  const decisions = useMemo(
    () => scenario.scenes.filter((scene): scene is DecisionScene => scene.kind === 'decision'),
    [],
  )
  const currentScene = getCurrentScene(scenario, model.gameState)
  const availableChoices = getAvailableChoices(scenario, model.gameState)
  const pendingOutcome = model.pendingOutcomeId
    ? scenario.outcomes.find((outcome) => outcome.id === model.pendingOutcomeId)
    : undefined
  const completedFiles = model.gameState.history.length
  const progressCompletedFiles =
    model.view === 'feedback' ? Math.max(0, completedFiles - 1) : completedFiles
  const activeFile =
    model.view === 'feedback' || model.view === 'complete'
      ? Math.max(1, completedFiles)
      : Math.min(decisions.length, completedFiles + 1)

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
        setModel(initialModel(storage))
        setSourceStatus('ready')
        setActiveSourceKey(desiredSourceKey)
        return
      }

      setSourceStatus('remote-loading')
      setActiveSourceKey(desiredSourceKey)
      try {
        const response = await progressRepository.load(scenario.id, scenario.contentVersion)
        if (!active || sourceEpoch.current !== epoch) return
        const resolved = resolveRemoteResponse(response)
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
  }, [authLoading, authenticatedUserId, desiredSourceKey, progressRepository, storage])

  useEffect(() => {
    if (!manageFocus) return
    viewHeading.current?.focus()
  }, [manageFocus, model.gameState.currentSceneId, model.pendingOutcomeId, model.view])

  function moveTo(next: AppModel, message: string) {
    setManageFocus(true)
    setAnnouncement(message)
    setModel(next)
  }

  function adoptRemoteProgress(response: CareerGameProgressResponse, message: string): boolean {
    const resolved = resolveRemoteResponse(response)
    if (resolved.kind === 'client-update-required') {
      setClientUpdateRequired(resolved)
      setResetRequired(null)
      setRemoteCheckpoint(null)
      setSourceStatus('client-update-required')
      return true
    }
    if (resolved.kind === 'reset-required') {
      setResetRequired(resolved.requirement)
      setRemoteCheckpoint({
        checkpointId: resolved.requirement.checkpointId,
        storedVersion: resolved.requirement.storedVersion,
        revision: resolved.requirement.revision,
      })
      setSourceStatus('reset-required')
      return true
    }
    if (resolved.kind !== 'progress') return false
    setClientUpdateRequired(null)
    setResetRequired(null)
    setRemoteCheckpoint(resolved.checkpoint)
    setSourceStatus('ready')
    moveTo(resolved.model, message)
    return true
  }

  function runRemoteProgressAction(
    request: () => Promise<CareerGameProgressResponse>,
    message: string,
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
          const resolved = resolveRemoteResponse(latest)
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
        if (!adoptRemoteProgress(response, message)) throw new Error('unexpected progress response')
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
    if (usesRemoteProgress) {
      runRemoteProgressAction(
        () => progressRepository!.start(scenario.id, scenario.contentVersion),
        'FILE 01を開始しました。',
      )
      return
    }
    const gameState = createInitialState(scenario)
    if (storage) saveGameSession(scenario, { state: gameState }, storage)
    moveTo({ view: 'playing', gameState }, 'FILE 01を開始しました。')
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
      )
      return
    }
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
          ? '五つのファイルを完了しました。'
          : `FILE ${formatFileNumber(model.gameState.history.length + 1)}へ進みました。`,
      )
      return
    }
    const view = model.gameState.status === 'completed' ? 'complete' : 'playing'
    if (storage) saveGameSession(scenario, { state: model.gameState }, storage)
    moveTo(
      { view, gameState: model.gameState },
      view === 'complete'
        ? '五つのファイルを完了しました。'
        : `FILE ${formatFileNumber(model.gameState.history.length + 1)}へ進みました。`,
    )
  }

  function replayCase() {
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
            const resolved = resolveRemoteResponse(latest)
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
          moveTo(
            { view: 'intro', gameState: createInitialState(scenario) },
            '記録をリセットしました。ケースを最初から開始できます。',
          )
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
    if (storage) clearGameSession(scenario, storage)
    moveTo(
      { view: 'intro', gameState: createInitialState(scenario) },
      '記録をリセットしました。ケースを最初から開始できます。',
    )
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
        const resolved = resolveRemoteResponse(response)
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
              <dd>{decisions.length} files</dd>
            </div>
            <div>
              <dt>所要時間</dt>
              <dd>約 8–10 分</dd>
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
            FILE {formatFileNumber(activeFile)} / {formatFileNumber(decisions.length)}
          </p>
          <p className="case-sheet__context">{currentScene.context}</p>
          <h1 id="scene-title" ref={viewHeading} tabIndex={-1}>
            {currentScene.title}
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
            FILE {formatFileNumber(activeFile)} / {formatFileNumber(decisions.length)}
          </p>
          <p className="case-sheet__context">{sourceScene?.title}</p>
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
            <a href={libraryLinkHref(pendingOutcome.libraryLinks[0])}>
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
            <strong>{model.gameState.history.length} / {decisions.length}</strong>
          </div>
          {(scenario.meters ?? []).map((meter) => (
            <div key={meter.id}>
              <span>{meter.label}</span>
              <strong>{meter.label} {model.gameState.meters[meter.id]}</strong>
            </div>
          ))}
        </div>

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

  return (
    <div className="career-game-shell">
      <a className="career-game-skip-link" href="#career-game-main">
        本文へスキップ
      </a>

      <header className="career-game-header">
        <div className="career-game-brand">
          <span className="career-game-brand__product" lang="en">
            Career Game
          </span>
          <span className="career-game-brand__platform">Business Japanese Hub</span>
        </div>
        <AccountControl remotePersistenceAvailable={Boolean(progressRepository)} />
      </header>

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
          <div className="game-layout">
            <ProgressRail
              decisions={decisions}
              activeFile={activeFile}
              completedFiles={progressCompletedFiles}
            />
            <div className="game-stage">
              <MeterReadout gameState={model.gameState} />
              {model.view === 'playing' ? renderScene() : null}
              {model.view === 'feedback' ? renderFeedback() : null}
              {model.view === 'complete' ? renderCompletion() : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
