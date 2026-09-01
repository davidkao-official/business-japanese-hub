import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  applyChoice,
  createInitialState,
  type Scenario,
} from '@business-japanese-hub/career-game'
import { AuthProvider } from '@business-japanese-hub/platform-auth'
import type { AuthClient, SessionUser } from '@business-japanese-hub/platform-auth'
import type { ValidationAnalytics } from '@business-japanese-hub/validation-analytics'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type {
  CareerGameProgressRepository,
  CareerGameProgressResponse,
} from './career-game-progress'
import { rookieSurvivalScenario } from './content/rookie-survival'
import { loadGameSession, saveGameSession } from './game-session'

function createRepository(
  overrides: Partial<CareerGameProgressRepository> = {},
): CareerGameProgressRepository {
  return {
    load: vi.fn().mockResolvedValue({ kind: 'none' }),
    start: vi.fn().mockResolvedValue({ kind: 'none' }),
    choose: vi.fn().mockResolvedValue({ kind: 'none' }),
    acknowledge: vi.fn().mockResolvedValue({ kind: 'none' }),
    reset: vi.fn().mockResolvedValue({ kind: 'none' }),
    ...overrides,
  }
}

function renderGame(
  session: SessionUser | null = null,
  progressRepository?: CareerGameProgressRepository,
  analytics?: ValidationAnalytics,
  strict = false,
  scenario: Scenario = rookieSurvivalScenario,
) {
  const authClient: AuthClient = {
    getSession: vi.fn().mockResolvedValue(session),
    signInWithPassword: vi.fn().mockResolvedValue({
      user: { id: 'shared-user', email: 'shared@example.com' },
    }),
    signUpWithPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn(() => () => {}),
  }

  const game = (
    <AuthProvider authClient={authClient}>
      <App
        scenario={scenario}
        progressRepository={progressRepository}
        analytics={analytics}
      />
    </AuthProvider>
  )

  return {
    ...render(
      strict ? <StrictMode>{game}</StrictMode> : game,
    ),
    authClient,
  }
}

function createSingleDecisionScenario(): Scenario {
  const decision = rookieSurvivalScenario.scenes.find(
    (scene) => scene.id === rookieSurvivalScenario.startSceneId,
  )
  const terminal = rookieSurvivalScenario.scenes.find((scene) => scene.kind === 'terminal')
  if (!decision || decision.kind !== 'decision' || !terminal || terminal.kind !== 'terminal') {
    throw new Error('expected a decision and terminal scene')
  }
  const outcomeIds = new Set(decision.choices.map((choice) => choice.outcomeId))

  return {
    ...rookieSurvivalScenario,
    id: 'single-file-case',
    slug: 'single-file-case',
    title: '単一ファイルケース',
    summary: '一つの判断で完了する回帰テスト用ケース。',
    scenes: [decision, terminal],
    outcomes: rookieSurvivalScenario.outcomes
      .filter((outcome) => outcomeIds.has(outcome.id))
      .map((outcome) => ({ ...outcome, nextSceneId: terminal.id })),
  }
}

const singleDecisionScenario = createSingleDecisionScenario()

function createAnalytics(): { analytics: ValidationAnalytics; track: ReturnType<typeof vi.fn> } {
  const track = vi.fn()
  return { analytics: { track }, track }
}

async function startCase() {
  fireEvent.click(await screen.findByRole('button', { name: 'ケースを開始' }))
}

function chooseFirstOption() {
  const choices = screen.getByRole('group', { name: 'あなたの判断' })
  fireEvent.click(within(choices).getAllByRole('button')[0]!)
}

function clickWithoutNavigation(link: HTMLElement) {
  link.addEventListener('click', (event) => event.preventDefault(), { once: true })
  fireEvent.click(link)
}

describe('Career Game playable slice', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('introduces the anonymous free case on its own semantic product surface', async () => {
    renderGame()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 1, name: '新人社員生存戦' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Workplace simulation')).toHaveAttribute('lang', 'en')
    expect(screen.getByText('無料・ゲストプレイ')).toBeInTheDocument()
    expect(
      screen.getByText(/判断するたびに、その場の結果と職場語用論の解説を確認/),
    ).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'ケースを開始' })).toBeEnabled()
  })

  it('supports keyboard activation and moves focus across each case view', async () => {
    const user = userEvent.setup()
    renderGame()

    const startButton = await screen.findByRole('button', { name: 'ケースを開始' })
    startButton.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: '配属初日の挨拶' })).toHaveFocus()

    for (let file = 1; file <= 5; file += 1) {
      const choices = screen.getByRole('group', { name: 'あなたの判断' })
      const choice = within(choices).getAllByRole('button')[0]!
      choice.focus()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('heading', { name: '判断の結果' })).toHaveFocus()

      const continueButton = screen.getByRole('button', {
        name: file === 5 ? '結果を見る' : '次のファイルへ',
      })
      continueButton.focus()
      await user.keyboard('{Enter}')

      if (file === 5) {
        expect(screen.getByRole('heading', { name: 'ケース完了' })).toHaveFocus()
      } else {
        expect(screen.getByText(`FILE ${String(file + 1).padStart(2, '0')} / 05`)).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
      }
    }
  })

  it('plays the five-file golden path through consequence feedback and completion', async () => {
    const { analytics, track } = createAnalytics()
    renderGame(null, undefined, analytics)
    await startCase()

    for (let file = 1; file <= 5; file += 1) {
      expect(screen.getByText(`FILE ${String(file).padStart(2, '0')} / 05`)).toBeInTheDocument()
      chooseFirstOption()
      expect(
        screen.getByRole('heading', { level: 1, name: '判断の結果' }),
      ).toBeInTheDocument()
      expect(screen.getByText('信頼 +1')).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: file === 5 ? '結果を見る' : '次のファイルへ' }),
      )
    }

    expect(screen.getByRole('heading', { level: 1, name: 'ケース完了' })).toBeInTheDocument()
    expect(screen.getByText('5 / 5')).toBeInTheDocument()
    expect(screen.getByText('信頼 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'もう一度プレイ' })).toBeEnabled()

    const saved = loadGameSession(rookieSurvivalScenario, window.localStorage)
    expect(saved?.state.status).toBe('completed')
    expect(saved?.state.history).toHaveLength(5)
    expect(track.mock.calls.map(([event]) => event)).toEqual([
      { event: 'case_viewed', scenarioId: 'rookie-survival' },
      { event: 'case_started', scenarioId: 'rookie-survival' },
      ...Array.from({ length: 5 }, () => ({
        event: 'case_outcome',
        scenarioId: 'rookie-survival',
        outcomeCategory: 'strong',
      })),
      { event: 'case_completed', scenarioId: 'rookie-survival' },
    ])
  })

  it('announces the supplied scenario decision count after guest completion', async () => {
    renderGame(null, undefined, undefined, false, singleDecisionScenario)
    await startCase()
    chooseFirstOption()
    fireEvent.click(screen.getByRole('button', { name: '結果を見る' }))

    expect(screen.getByText('ケース内のファイル1件を完了しました。')).toBeInTheDocument()
  })

  it('restores pending consequence feedback after a reload', async () => {
    const firstRender = renderGame()
    await startCase()
    chooseFirstOption()
    expect(screen.getByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
    firstRender.unmount()

    renderGame()
    expect(await screen.findByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
    expect(screen.getByText('FILE 01 / 05')).toBeInTheDocument()
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent('配属初日の挨拶')
    fireEvent.click(screen.getByRole('button', { name: '次のファイルへ' }))
    expect(screen.getByText('FILE 02 / 05')).toBeInTheDocument()
  })

  it('resumes the next file after feedback has been acknowledged', async () => {
    const firstRender = renderGame()
    await startCase()
    chooseFirstOption()
    fireEvent.click(screen.getByRole('button', { name: '次のファイルへ' }))
    expect(screen.getByRole('heading', { name: '曖昧な依頼を受ける' })).toBeInTheDocument()
    firstRender.unmount()

    renderGame()
    expect(await screen.findByRole('heading', { name: '曖昧な依頼を受ける' })).toBeInTheDocument()
    expect(screen.getByText('FILE 02 / 05')).toBeInTheDocument()
  })

  it('commits a rapid repeated choice only once', async () => {
    const { analytics, track } = createAnalytics()
    renderGame(null, undefined, analytics)
    await startCase()
    const choices = screen.getByRole('group', { name: 'あなたの判断' })
    const choice = within(choices).getAllByRole('button')[0]!

    fireEvent.click(choice)
    fireEvent.click(choice)

    const saved = loadGameSession(rookieSurvivalScenario, window.localStorage)
    expect(saved?.state.history).toHaveLength(1)
    expect(
      track.mock.calls.filter(([event]) => event.event === 'case_outcome'),
    ).toHaveLength(1)
  })

  it('clears the checkpoint and returns to the case file on replay', async () => {
    const { analytics, track } = createAnalytics()
    renderGame(null, undefined, analytics)
    await startCase()

    for (let file = 1; file <= 5; file += 1) {
      chooseFirstOption()
      fireEvent.click(
        screen.getByRole('button', { name: file === 5 ? '結果を見る' : '次のファイルへ' }),
      )
    }

    fireEvent.click(screen.getByRole('button', { name: 'もう一度プレイ' }))
    expect(screen.getByRole('heading', { level: 1, name: '新人社員生存戦' })).toBeInTheDocument()
    expect(loadGameSession(rookieSurvivalScenario, window.localStorage)).toBeNull()
    expect(
      track.mock.calls.filter(([event]) => event.event === 'case_replayed'),
    ).toEqual([[{ event: 'case_replayed', scenarioId: 'rookie-survival' }]])
  })

  it('tracks a Case view once through the development StrictMode effect cycle', async () => {
    const { analytics, track } = createAnalytics()
    renderGame(null, undefined, analytics, true)

    expect(await screen.findByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()
    expect(
      track.mock.calls.filter(([event]) => event.event === 'case_viewed'),
    ).toEqual([[{ event: 'case_viewed', scenarioId: 'rookie-survival' }]])
  })

  it('tracks a new Case view after a real page-surface remount', async () => {
    const { analytics, track } = createAnalytics()
    const first = renderGame(null, undefined, analytics, true)
    expect(await screen.findByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()
    first.unmount()

    renderGame(null, undefined, analytics, true)
    expect(await screen.findByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()
    expect(
      track.mock.calls.filter(([event]) => event.event === 'case_viewed'),
    ).toEqual([
      [{ event: 'case_viewed', scenarioId: 'rookie-survival' }],
      [{ event: 'case_viewed', scenarioId: 'rookie-survival' }],
    ])
  })

  it('tracks ordinary Game-to-Library links without changing their cross-origin hrefs', async () => {
    const { analytics, track } = createAnalytics()
    renderGame(null, undefined, analytics)

    const productSwitch = await screen.findByRole('link', { name: /Library/ })
    expect(productSwitch).toHaveAttribute('href', 'https://business-japanese-hub.pages.dev/')
    clickWithoutNavigation(productSwitch)

    await startCase()
    chooseFirstOption()
    const relatedReading = screen.getByRole('link', { name: 'Libraryで関連内容を読む' })
    expect(relatedReading).toHaveAttribute(
      'href',
      'https://business-japanese-hub.pages.dev/library-link?bookId=book-sample-bj-keigo&chapterId=ch-2',
    )
    clickWithoutNavigation(relatedReading)

    expect(
      track.mock.calls.filter(([event]) => event.event === 'cross_product_link_clicked'),
    ).toEqual([
      [
        {
          event: 'cross_product_link_clicked',
          scenarioId: 'rookie-survival',
          direction: 'career_game_to_library',
        },
      ],
      [
        {
          event: 'cross_product_link_clicked',
          scenarioId: 'rookie-survival',
          direction: 'career_game_to_library',
        },
      ],
    ])
  })

  it('keeps anonymous play available when analytics throws', async () => {
    const analytics: ValidationAnalytics = {
      track: vi.fn(() => {
        throw new Error('analytics unavailable')
      }),
    }
    renderGame(null, undefined, analytics)

    await startCase()
    expect(screen.getByRole('heading', { name: '配属初日の挨拶' })).toBeInTheDocument()
    chooseFirstOption()
    expect(screen.getByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
  })

  it('does not count restored completed guest state as a new completion', async () => {
    saveGameSession(
      rookieSurvivalScenario,
      { state: completedRemoteProgress().snapshot.state },
      window.localStorage,
    )
    const { analytics, track } = createAnalytics()
    renderGame(null, undefined, analytics)

    expect(await screen.findByRole('heading', { name: 'ケース完了' })).toBeInTheDocument()
    expect(track.mock.calls.map(([event]) => event)).toEqual([
      { event: 'case_viewed', scenarioId: 'rookie-survival' },
    ])
  })

  it('restores the shared account identity while keeping progress device-local', async () => {
    renderGame({ id: 'shared-user', email: 'shared@example.com' })

    expect(await screen.findByText('shared@example.com')).toBeInTheDocument()
    expect(screen.getByText('進行はこの端末にのみ保存されます')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'ケースを開始' })).toBeEnabled()
  })

  it('signs into an existing shared account without blocking guest play', async () => {
    const { authClient } = renderGame()

    fireEvent.click(await screen.findByRole('button', { name: '共通アカウントでログイン' }))
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: ' shared@example.com ' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByText('shared@example.com')).toBeInTheDocument()
    expect(authClient.signInWithPassword).toHaveBeenCalledWith({
      email: 'shared@example.com',
      password: 'correct-password',
    })
    expect(screen.getByRole('button', { name: 'ケースを開始' })).toBeEnabled()
  })

  it('signs out of the shared account without clearing guest progress', async () => {
    const { authClient } = renderGame({ id: 'shared-user', email: 'shared@example.com' })

    expect(await screen.findByText('shared@example.com')).toBeInTheDocument()
    await startCase()
    expect(loadGameSession(rookieSurvivalScenario, window.localStorage)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))

    expect(await screen.findByText('無料・ゲストプレイ')).toBeInTheDocument()
    expect(authClient.signOut).toHaveBeenCalledOnce()
    expect(loadGameSession(rookieSurvivalScenario, window.localStorage)).not.toBeNull()
  })

  it('keeps guest play available and hides provider details when sign-in fails', async () => {
    const { authClient } = renderGame()
    vi.mocked(authClient.signInWithPassword).mockRejectedValue(
      new Error('provider trace for private@example.com'),
    )

    fireEvent.click(await screen.findByRole('button', { name: '共通アカウントでログイン' }))
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'private@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'incorrect-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ログインできませんでした。入力内容をご確認ください。',
    )
    expect(screen.queryByText(/provider trace/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ケースを開始' })).toBeEnabled()
  })
})

const CHECKPOINT_ID = '11111111-1111-4111-8111-111111111111'

function firstRemoteProgress(revision = 2): Extract<CareerGameProgressResponse, { kind: 'progress' }> {
  const state = createInitialState(rookieSurvivalScenario)
  const firstScene = rookieSurvivalScenario.scenes.find((scene) => scene.id === state.currentSceneId)
  if (!firstScene || firstScene.kind !== 'decision') throw new Error('expected decision')
  const choice = firstScene.choices[0]!
  const result = applyChoice(rookieSurvivalScenario, state, {
    scenarioId: rookieSurvivalScenario.id,
    contentVersion: rookieSurvivalScenario.contentVersion,
    sceneId: firstScene.id,
    choiceId: choice.id,
  })
  if (result.kind !== 'advanced') throw new Error(result.kind)
  return {
    kind: 'progress',
    scenarioId: rookieSurvivalScenario.id,
    contentVersion: rookieSurvivalScenario.contentVersion,
    checkpointId: CHECKPOINT_ID,
    revision,
    snapshot: { state: result.state, pendingOutcomeId: result.outcome.id },
  }
}

function completedRemoteProgress(
  revision = 9,
): Extract<CareerGameProgressResponse, { kind: 'progress' }> {
  let state = createInitialState(rookieSurvivalScenario)
  for (let index = 0; index < 5; index += 1) {
    const scene = rookieSurvivalScenario.scenes.find(
      (candidate) => candidate.id === state.currentSceneId,
    )
    if (!scene || scene.kind !== 'decision') throw new Error('expected decision')
    const choice = scene.choices[0]!
    const result = applyChoice(rookieSurvivalScenario, state, {
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: rookieSurvivalScenario.contentVersion,
      sceneId: scene.id,
      choiceId: choice.id,
    })
    if (result.kind !== 'advanced' && result.kind !== 'completed') throw new Error(result.kind)
    state = result.state
  }
  return {
    kind: 'progress',
    scenarioId: rookieSurvivalScenario.id,
    contentVersion: 1,
    checkpointId: CHECKPOINT_ID,
    revision,
    snapshot: { state },
  }
}

describe('authenticated Career Game progress', () => {
  const signedIn = { id: 'shared-user', email: 'shared@example.com' }

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('announces the supplied scenario decision count after authenticated completion', async () => {
    const initial = createInitialState(singleDecisionScenario)
    const decision = singleDecisionScenario.scenes.find(
      (scene) => scene.id === initial.currentSceneId,
    )
    if (!decision || decision.kind !== 'decision') throw new Error('expected decision')
    const result = applyChoice(singleDecisionScenario, initial, {
      scenarioId: singleDecisionScenario.id,
      contentVersion: singleDecisionScenario.contentVersion,
      sceneId: decision.id,
      choiceId: decision.choices[0]!.id,
    })
    if (result.kind !== 'completed') throw new Error('expected completion')
    const completedProgress = {
      kind: 'progress' as const,
      scenarioId: singleDecisionScenario.id,
      contentVersion: singleDecisionScenario.contentVersion,
      checkpointId: CHECKPOINT_ID,
      revision: 3,
      snapshot: { state: result.state },
    }
    const repository = createRepository({
      load: vi.fn().mockResolvedValue({
        ...completedProgress,
        revision: 2,
        snapshot: { state: result.state, pendingOutcomeId: result.outcome.id },
      }),
      acknowledge: vi.fn().mockResolvedValue(completedProgress),
    })

    renderGame(signedIn, repository, undefined, false, singleDecisionScenario)
    fireEvent.click(await screen.findByRole('button', { name: '結果を見る' }))

    expect(await screen.findByText('ケース内のファイル1件を完了しました。')).toBeInTheDocument()
  })

  it('uses an empty remote account without importing or changing a guest checkpoint', async () => {
    const guestState = createInitialState(rookieSurvivalScenario)
    saveGameSession(rookieSurvivalScenario, { state: guestState }, window.localStorage)
    const storageKey = 'business-japanese-hub.career-game.rookie-survival@1'
    const before = window.localStorage.getItem(storageKey)
    const repository = createRepository()

    renderGame(signedIn, repository)

    expect(await screen.findByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()
    expect(repository.load).toHaveBeenCalledWith('rookie-survival', 1)
    expect(window.localStorage.getItem(storageKey)).toBe(before)
    expect(screen.getByText('進行は共通アカウントに保存されます')).toBeInTheDocument()
  })

  it('swaps between untouched guest and remote sources on sign-in and sign-out', async () => {
    const repository = createRepository()
    const { authClient } = renderGame(null, repository)
    await startCase()
    expect(screen.getByRole('heading', { name: '配属初日の挨拶' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '共通アカウントでログイン' }))
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'shared@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(await screen.findByRole('heading', { name: '配属初日の挨拶' })).toBeInTheDocument()
    expect(authClient.signOut).toHaveBeenCalledOnce()
  })

  it('restores pending remote feedback and links to the stable Library resolver', async () => {
    const repository = createRepository({ load: vi.fn().mockResolvedValue(firstRemoteProgress()) })
    const { analytics, track } = createAnalytics()
    renderGame(signedIn, repository, analytics)

    expect(await screen.findByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Libraryで関連内容を読む' })).toHaveAttribute(
      'href',
      'https://business-japanese-hub.pages.dev/library-link?bookId=book-sample-bj-keigo&chapterId=ch-2',
    )
    expect(track.mock.calls.map(([event]) => event)).toEqual([
      { event: 'case_viewed', scenarioId: 'rookie-survival' },
    ])
  })

  it('never writes authenticated actions to guest local storage', async () => {
    const initial = createInitialState(rookieSurvivalScenario)
    const started: CareerGameProgressResponse = {
      kind: 'progress',
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: rookieSurvivalScenario.contentVersion,
      checkpointId: CHECKPOINT_ID,
      revision: 1,
      snapshot: { state: initial },
    }
    const repository = createRepository({ start: vi.fn().mockResolvedValue(started) })
    const { analytics, track } = createAnalytics()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
    renderGame(signedIn, repository, analytics)

    await startCase()

    expect(await screen.findByRole('heading', { name: '配属初日の挨拶' })).toBeInTheDocument()
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(
      track.mock.calls.filter(([event]) => event.event === 'case_started'),
    ).toEqual([[{ event: 'case_started', scenarioId: 'rookie-survival' }]])
    setItem.mockRestore()
    removeItem.mockRestore()
  })

  it('shows a deterministic reset surface for mismatched remote progress', async () => {
    const repository = createRepository({
      load: vi.fn().mockResolvedValue({
        kind: 'reset-required',
        reason: 'content-version-mismatch',
        currentVersion: 1,
        storedVersion: 2,
        checkpointId: CHECKPOINT_ID,
        revision: 7,
      }),
    })
    renderGame(signedIn, repository)

    expect(await screen.findByRole('heading', { name: '進行をリセットしてください' })).toBeInTheDocument()
    expect(screen.getByText(/ケース内容が更新されたため/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存済み進行をリセット' })).toBeEnabled()
  })

  it('keeps reset-required state when reset fails and permits retry', async () => {
    const reset = vi.fn().mockRejectedValue(new Error('private trace'))
    const repository = createRepository({
      load: vi.fn().mockResolvedValue({
        kind: 'reset-required',
        reason: 'invalid-persisted-progress',
        currentVersion: 1,
        storedVersion: 1,
        checkpointId: CHECKPOINT_ID,
        revision: 7,
      }),
      reset,
    })
    renderGame(signedIn, repository)
    fireEvent.click(await screen.findByRole('button', { name: '保存済み進行をリセット' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '進行を同期できませんでした。もう一度お試しください。',
    )
    expect(screen.getByRole('heading', { name: '進行をリセットしてください' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存済み進行をリセット' })).toBeEnabled()
    expect(reset).toHaveBeenCalledWith('rookie-survival', 1, 1, CHECKPOINT_ID, 7)
  })

  it('leaves reset mode after a CAS conflict loads a replacement checkpoint', async () => {
    const replacementCheckpointId = '22222222-2222-4222-8222-222222222222'
    const replacement = {
      ...firstRemoteProgress(1),
      checkpointId: replacementCheckpointId,
    }
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'reset-required',
        reason: 'invalid-persisted-progress',
        currentVersion: 1,
        storedVersion: 1,
        checkpointId: CHECKPOINT_ID,
        revision: 7,
      } satisfies CareerGameProgressResponse)
      .mockResolvedValueOnce(replacement)
    const reset = vi.fn().mockResolvedValue({ kind: 'conflict' })
    renderGame(signedIn, createRepository({ load, reset }))

    fireEvent.click(await screen.findByRole('button', { name: '保存済み進行をリセット' }))

    expect(await screen.findByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '進行をリセットしてください' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存済み進行をリセット' })).not.toBeInTheDocument()
    expect(reset).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledWith('rookie-survival', 1, 1, CHECKPOINT_ID, 7)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('uses the loaded progress checkpoint identity for a successful replay reset', async () => {
    const reset = vi.fn().mockResolvedValue({ kind: 'none' })
    const { analytics, track } = createAnalytics()
    renderGame(
      signedIn,
      createRepository({
        load: vi.fn().mockResolvedValue(completedRemoteProgress(9)),
        reset,
      }),
      analytics,
    )

    const replay = await screen.findByRole('button', { name: 'もう一度プレイ' })
    expect(track.mock.calls.map(([event]) => event)).toEqual([
      { event: 'case_viewed', scenarioId: 'rookie-survival' },
    ])
    fireEvent.click(replay)

    expect(reset).toHaveBeenCalledWith('rookie-survival', 1, 1, CHECKPOINT_ID, 9)
    expect(await screen.findByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()
    expect(track.mock.calls.map(([event]) => event)).toEqual([
      { event: 'case_viewed', scenarioId: 'rookie-survival' },
      { event: 'case_replayed', scenarioId: 'rookie-survival' },
    ])
  })

  it('offers load retry without falling back to guest state', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('private trace'))
      .mockResolvedValueOnce({ kind: 'none' })
    saveGameSession(
      rookieSurvivalScenario,
      { state: createInitialState(rookieSurvivalScenario) },
      window.localStorage,
    )
    renderGame(signedIn, createRepository({ load }))

    expect(await screen.findByRole('heading', { name: '進行を読み込めませんでした' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '配属初日の挨拶' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps the current safe model and shows a generic retryable action error', async () => {
    const repository = createRepository({
      start: vi.fn().mockRejectedValue(new Error('private backend trace')),
    })
    const { analytics, track } = createAnalytics()
    renderGame(signedIn, repository, analytics)
    await startCase()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '進行を同期できませんでした。もう一度お試しください。',
    )
    expect(screen.queryByText(/private backend/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ケースを開始' })).toBeEnabled()
    expect(track.mock.calls.map(([event]) => event)).toEqual([
      { event: 'case_viewed', scenarioId: 'rookie-survival' },
    ])
  })

  it('ignores a late authenticated load after signing out', async () => {
    let resolveLoad: (value: CareerGameProgressResponse) => void = () => {}
    const load = vi.fn().mockImplementation(
      () => new Promise<CareerGameProgressResponse>((resolve) => { resolveLoad = resolve }),
    )
    const { authClient } = renderGame(signedIn, createRepository({ load }))
    expect(await screen.findByText('shared@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(await screen.findByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()

    await act(async () => resolveLoad(firstRemoteProgress()))

    expect(authClient.signOut).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: '新人社員生存戦' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '判断の結果' })).not.toBeInTheDocument()
  })

  it('serializes rapid authenticated choices against one revision', async () => {
    const initial = createInitialState(rookieSurvivalScenario)
    let resolveChoose: (value: CareerGameProgressResponse) => void = () => {}
    const choose = vi.fn().mockImplementation(
      () => new Promise<CareerGameProgressResponse>((resolve) => { resolveChoose = resolve }),
    )
    const repository = createRepository({
      load: vi.fn().mockResolvedValue({
        kind: 'progress',
        scenarioId: rookieSurvivalScenario.id,
        contentVersion: 1,
        checkpointId: CHECKPOINT_ID,
        revision: 4,
        snapshot: { state: initial },
      }),
      choose,
    })
    const { analytics, track } = createAnalytics()
    renderGame(signedIn, repository, analytics)
    const choice = within(await screen.findByRole('group', { name: 'あなたの判断' }))
      .getAllByRole('button')[0]!

    fireEvent.click(choice)
    fireEvent.click(choice)

    expect(choose).toHaveBeenCalledOnce()
    expect(choose).toHaveBeenCalledWith(
      'rookie-survival',
      1,
      'file-one-greeting',
      'greeting-concise-choice',
      CHECKPOINT_ID,
      4,
    )
    await act(async () => resolveChoose(firstRemoteProgress(5)))
    expect(await screen.findByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
    expect(
      track.mock.calls.filter(([event]) => event.event === 'case_outcome'),
    ).toEqual([
      [
        {
          event: 'case_outcome',
          scenarioId: 'rookie-survival',
          outcomeCategory: 'strong',
        },
      ],
    ])
  })

  it('does not count a failed authenticated choice as an outcome', async () => {
    const initial = createInitialState(rookieSurvivalScenario)
    const repository = createRepository({
      load: vi.fn().mockResolvedValue({
        kind: 'progress',
        scenarioId: rookieSurvivalScenario.id,
        contentVersion: 1,
        checkpointId: CHECKPOINT_ID,
        revision: 4,
        snapshot: { state: initial },
      }),
      choose: vi.fn().mockRejectedValue(new Error('private backend trace')),
    })
    const { analytics, track } = createAnalytics()
    renderGame(signedIn, repository, analytics)
    const choice = within(await screen.findByRole('group', { name: 'あなたの判断' }))
      .getAllByRole('button')[0]!

    fireEvent.click(choice)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '進行を同期できませんでした。もう一度お試しください。',
    )
    expect(track.mock.calls.some(([event]) => event.event === 'case_outcome')).toBe(false)
  })

  it('shows a non-destructive update surface for a newer server and never offers reset', async () => {
    const reset = vi.fn()
    const repository = createRepository({
      load: vi.fn().mockResolvedValue({
        kind: 'client-update-required',
        currentVersion: 2,
      }),
      reset,
    })

    renderGame(signedIn, repository)

    expect(await screen.findByRole('heading', { name: 'アプリを更新してください' })).toBeInTheDocument()
    expect(screen.getByText(/サーバー上の最新版は v2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ページを再読み込み' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '保存済み進行をリセット' })).not.toBeInTheDocument()
    expect(reset).not.toHaveBeenCalled()
  })

  it('stops on a client update response during play without resetting the checkpoint', async () => {
    const initial = createInitialState(rookieSurvivalScenario)
    const reset = vi.fn()
    const choose = vi.fn().mockResolvedValue({
      kind: 'client-update-required',
      currentVersion: 2,
    })
    renderGame(
      signedIn,
      createRepository({
        load: vi.fn().mockResolvedValue({
          kind: 'progress',
          scenarioId: rookieSurvivalScenario.id,
          contentVersion: 1,
          checkpointId: CHECKPOINT_ID,
          revision: 4,
          snapshot: { state: initial },
        }),
        choose,
        reset,
      }),
    )
    const choice = within(await screen.findByRole('group', { name: 'あなたの判断' }))
      .getAllByRole('button')[0]!

    fireEvent.click(choice)

    expect(await screen.findByRole('heading', { name: 'アプリを更新してください' })).toBeInTheDocument()
    expect(reset).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '保存済み進行をリセット' })).not.toBeInTheDocument()
  })

  it.each([
    {
      label: 'mismatched progress',
      response: {
        ...firstRemoteProgress(),
        contentVersion: 2,
      } satisfies CareerGameProgressResponse,
    },
    {
      label: 'mismatched reset requirement',
      response: {
        kind: 'reset-required',
        reason: 'content-version-mismatch',
        currentVersion: 2,
        storedVersion: 1,
        checkpointId: CHECKPOINT_ID,
        revision: 8,
      } satisfies CareerGameProgressResponse,
    },
  ])('treats $label as client/server skew without deleting progress', async ({ response }) => {
    const reset = vi.fn()
    renderGame(
      signedIn,
      createRepository({ load: vi.fn().mockResolvedValue(response), reset }),
    )

    expect(await screen.findByRole('heading', { name: 'アプリを更新してください' })).toBeInTheDocument()
    expect(screen.getByText(/サーバー上の最新版は v2/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存済み進行をリセット' })).not.toBeInTheDocument()
    expect(reset).not.toHaveBeenCalled()
  })
})
