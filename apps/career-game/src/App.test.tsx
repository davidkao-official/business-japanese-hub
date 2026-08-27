import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { rookieSurvivalScenario } from './content/rookie-survival'
import { loadGameSession } from './game-session'

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
    render(<App />)

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
    render(<App />)

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
    render(<App />)
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
    const firstRender = render(<App />)
    startCase()
    chooseFirstOption()
    expect(screen.getByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
    firstRender.unmount()

    render(<App />)
    expect(screen.getByRole('heading', { name: '判断の結果' })).toBeInTheDocument()
    expect(screen.getByText('FILE 01 / 05')).toBeInTheDocument()
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent('配属初日の挨拶')
    fireEvent.click(screen.getByRole('button', { name: '次のファイルへ' }))
    expect(screen.getByText('FILE 02 / 05')).toBeInTheDocument()
  })

  it('resumes the next file after feedback has been acknowledged', () => {
    const firstRender = render(<App />)
    startCase()
    chooseFirstOption()
    fireEvent.click(screen.getByRole('button', { name: '次のファイルへ' }))
    expect(screen.getByRole('heading', { name: '曖昧な依頼を受ける' })).toBeInTheDocument()
    firstRender.unmount()

    render(<App />)
    expect(screen.getByRole('heading', { name: '曖昧な依頼を受ける' })).toBeInTheDocument()
    expect(screen.getByText('FILE 02 / 05')).toBeInTheDocument()
  })

  it('commits a rapid repeated choice only once', () => {
    render(<App />)
    startCase()
    const choices = screen.getByRole('group', { name: 'あなたの判断' })
    const choice = within(choices).getAllByRole('button')[0]!

    fireEvent.click(choice)
    fireEvent.click(choice)

    const saved = loadGameSession(rookieSurvivalScenario, window.localStorage)
    expect(saved?.state.history).toHaveLength(1)
  })

  it('clears the checkpoint and returns to the case file on replay', () => {
    render(<App />)
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
})
