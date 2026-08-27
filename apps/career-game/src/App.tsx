import { useEffect, useMemo, useRef, useState } from 'react'
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
import { rookieSurvivalScenario as scenario } from './content/rookie-survival'
import {
  clearGameSession,
  loadGameSession,
  saveGameSession,
  type GameSessionStorage,
} from './game-session'

type View = 'intro' | 'playing' | 'feedback' | 'complete'

interface AppModel {
  view: View
  gameState: GameState
  pendingOutcomeId?: string
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

export default function App() {
  const storage = useMemo(() => getBrowserStorage(), [])
  const [model, setModel] = useState<AppModel>(() => initialModel(storage))
  const [announcement, setAnnouncement] = useState('')
  const [manageFocus, setManageFocus] = useState(false)
  const viewHeading = useRef<HTMLHeadingElement>(null)

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
    if (!manageFocus) return
    viewHeading.current?.focus()
  }, [manageFocus, model.gameState.currentSceneId, model.pendingOutcomeId, model.view])

  function moveTo(next: AppModel, message: string) {
    setManageFocus(true)
    setAnnouncement(message)
    setModel(next)
  }

  function startCase() {
    const gameState = createInitialState(scenario)
    if (storage) saveGameSession(scenario, { state: gameState }, storage)
    moveTo({ view: 'playing', gameState }, 'FILE 01を開始しました。')
  }

  function selectChoice(choiceId: string) {
    if (currentScene?.kind !== 'decision') return
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
    if (storage) clearGameSession(scenario, storage)
    moveTo(
      { view: 'intro', gameState: createInitialState(scenario) },
      '記録をリセットしました。ケースを最初から開始できます。',
    )
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
            <button className="primary-action" type="button" onClick={startCase}>
              ケースを開始
              <span aria-hidden="true">→</span>
            </button>
            <p>進行はこの端末にのみ保存されます。アカウントや支払いは必要ありません。</p>
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
                onClick={() => selectChoice(choice.id)}
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

        <div className="sheet-actions">
          <button className="primary-action" type="button" onClick={continueAfterFeedback}>
            {model.gameState.status === 'completed' ? '結果を見る' : '次のファイルへ'}
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
          <button className="primary-action" type="button" onClick={replayCase}>
            もう一度プレイ
            <span aria-hidden="true">↺</span>
          </button>
        </div>
      </article>
    )
  }

  const showGameLayout = model.view !== 'intro'

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
        <p className="career-game-status">無料・ゲストプレイ</p>
      </header>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <main
        className={`career-game-main${showGameLayout ? ' career-game-main--play' : ''}`}
        id="career-game-main"
        tabIndex={-1}
      >
        {model.view === 'intro' ? renderIntro() : null}
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
