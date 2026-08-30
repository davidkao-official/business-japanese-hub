import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider } from '@business-japanese-hub/platform-auth'
import type { AuthClient, SessionUser } from '@business-japanese-hub/platform-auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { rookieSurvivalScenario } from './content/rookie-survival'
import { loadGameSession } from './game-session'

function renderGame(session: SessionUser | null = null) {
  const authClient: AuthClient = {
    getSession: vi.fn().mockResolvedValue(session),
    signInWithPassword: vi.fn().mockResolvedValue({
      user: { id: 'shared-user', email: 'shared@example.com' },
    }),
    signUpWithPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn(() => () => {}),
  }

  return {
    ...render(
      <AuthProvider authClient={authClient}>
        <App />
      </AuthProvider>,
    ),
    authClient,
  }
}

function startCase() {
  fireEvent.click(screen.getByRole('button', { name: 'ケースを開始' }))
}

function chooseFirstOption() {
  const choices = screen.getByRole('group', { name: 'あなたの判断' })
  fireEvent.click(within(choices).getAllByRole('button')[0]!)
}

describe('Career Game playable slice', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('introduces the anonymous free case on its own semantic product surface', () => {
    renderGame()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: '新人社員生存戦' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Workplace simulation')).toHaveAttribute('lang', 'en')
    expect(screen.getByText('無料・ゲストプレイ')).toBeInTheDocument()
    expect(
      screen.getByText(/判断するたびに、その場の結果と職場語用論の解説を確認/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ケースを開始' })).toBeEnabled()
  })

  it('supports keyboard activation and moves focus across each case view', async () => {
    const user = userEvent.setup()
    renderGame()

    const startButton = screen.getByRole('button', { name: 'ケースを開始' })
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

  it('plays the five-file golden path through consequence feedback and completion', () => {
    renderGame()
    startCase()

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
  })

  it('restores pending consequence feedback after a reload', () => {
    const firstRender = renderGame()
    startCase()
    chooseFirstOption()
    expect(screen.getByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
    firstRender.unmount()

    renderGame()
    expect(screen.getByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
    expect(screen.getByText('FILE 01 / 05')).toBeInTheDocument()
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent('配属初日の挨拶')
    fireEvent.click(screen.getByRole('button', { name: '次のファイルへ' }))
    expect(screen.getByText('FILE 02 / 05')).toBeInTheDocument()
  })

  it('resumes the next file after feedback has been acknowledged', () => {
    const firstRender = renderGame()
    startCase()
    chooseFirstOption()
    fireEvent.click(screen.getByRole('button', { name: '次のファイルへ' }))
    expect(screen.getByRole('heading', { name: '曖昧な依頼を受ける' })).toBeInTheDocument()
    firstRender.unmount()

    renderGame()
    expect(screen.getByRole('heading', { name: '曖昧な依頼を受ける' })).toBeInTheDocument()
    expect(screen.getByText('FILE 02 / 05')).toBeInTheDocument()
  })

  it('commits a rapid repeated choice only once', () => {
    renderGame()
    startCase()
    const choices = screen.getByRole('group', { name: 'あなたの判断' })
    const choice = within(choices).getAllByRole('button')[0]!

    fireEvent.click(choice)
    fireEvent.click(choice)

    const saved = loadGameSession(rookieSurvivalScenario, window.localStorage)
    expect(saved?.state.history).toHaveLength(1)
  })

  it('clears the checkpoint and returns to the case file on replay', () => {
    renderGame()
    startCase()

    for (let file = 1; file <= 5; file += 1) {
      chooseFirstOption()
      fireEvent.click(
        screen.getByRole('button', { name: file === 5 ? '結果を見る' : '次のファイルへ' }),
      )
    }

    fireEvent.click(screen.getByRole('button', { name: 'もう一度プレイ' }))
    expect(screen.getByRole('heading', { level: 1, name: '新人社員生存戦' })).toBeInTheDocument()
    expect(loadGameSession(rookieSurvivalScenario, window.localStorage)).toBeNull()
  })

  it('restores the shared account identity while keeping progress device-local', async () => {
    renderGame({ id: 'shared-user', email: 'shared@example.com' })

    expect(await screen.findByText('shared@example.com')).toBeInTheDocument()
    expect(screen.getByText('進行はこの端末にのみ保存されます')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ケースを開始' })).toBeEnabled()
  })

  it('signs into an existing shared account without blocking guest play', async () => {
    const { authClient } = renderGame()

    fireEvent.click(screen.getByRole('button', { name: '共通アカウントでログイン' }))
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
    startCase()
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

    fireEvent.click(screen.getByRole('button', { name: '共通アカウントでログイン' }))
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
