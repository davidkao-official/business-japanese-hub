import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createMockRepository, renderWithAppProviders } from '../test/appProviders'
import { getBookBySlug } from '../reader/catalog'
import { WorkplaceLearnLandingPage } from '../workplace-learn/pages'
import { LearnUnitPage } from './LearnUnitPage'
import { PracticeActivityPage } from './PracticeActivityPage'
import { COURSE_CORRECTION_LEARN_SLUG, COURSE_CORRECTION_PRACTICE_SLUG } from './learningUnits'

const book = getBookBySlug('meeting-japanese')!
const user = { id: 'legacy-owner', email: 'owner@example.com', sessionId: 'session-a' }
const routes = [
  ['learn', `/learn/${COURSE_CORRECTION_LEARN_SLUG}`, <LearnUnitPage />],
  ['practice', `/practice/${COURSE_CORRECTION_PRACTICE_SLUG}`, <PracticeActivityPage />],
] as const

function ownerRepository() {
  return createMockRepository({ entitlements: {
    [book.id]: { bookId: book.id, provider: 'manual', grantedAt: '2026-09-08T00:00:00Z' },
  } })
}

describe.each(routes)('legacy %s access', (_kind, path, element) => {
  function renderRoute(options: Parameters<typeof renderWithAppProviders>[1] = {}) {
    return renderWithAppProviders(<Routes>
      <Route path="/learn/:slug" element={element} />
      <Route path="/practice/:slug" element={element} />
    </Routes>, { ...options, initialEntries: [path] })
  }

  function expectHiddenBody() {
    expect(document.querySelector('.learning-unit-flow')).toBeNull()
    expect(document.querySelector('.practice-activity-card')).toBeNull()
  }

  it('explains signed-out access without promising that signing in grants ownership', async () => {
    renderRoute()
    expect(await screen.findByRole('heading', { name: 'ログインして教材の利用資格を確認' })).toBeInTheDocument()
    expect(screen.getByText(/ログインだけでは利用資格は追加されません/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '公開中の教材を見る' })).toHaveAttribute('href', '/learn')
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeInTheDocument()
    expectHiddenBody()
  })

  it('explains a verified non-owner without offering a purchase or claiming Plus grants access', async () => {
    renderRoute({ session: user, repository: createMockRepository() })
    expect(await screen.findByRole('heading', { name: 'この教材は現在利用できません' })).toBeInTheDocument()
    expect(screen.getByText(/Plus の会員資格とは別/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /購入|Buy/ })).not.toBeInTheDocument()
    expectHiddenBody()
  })

  it('keeps a pending entitlement visibly pending and denies the body', async () => {
    const repository = createMockRepository()
    vi.mocked(repository.getEntitlement).mockImplementation(() => new Promise(() => {}))
    renderRoute({ session: user, repository })
    await waitFor(() => expect(repository.getEntitlement).toHaveBeenCalledWith(book.id))
    expect(screen.getByRole('heading', { name: '教材の利用資格を確認しています' })).toBeInTheDocument()
    expect(document.querySelector('[data-legacy-access="checking"]')).toHaveAttribute('aria-busy', 'true')
    expectHiddenBody()
  })

  it('reports an entitlement error truthfully without exposing provider diagnostics', async () => {
    const repository = createMockRepository()
    vi.mocked(repository.getEntitlement).mockRejectedValue(new Error('private diagnostic'))
    renderRoute({ session: user, repository })
    expect(await screen.findByRole('alert')).toHaveTextContent('教材の利用資格を確認できません')
    expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '公開中の教材を見る' })).toBeInTheDocument()
    expectHiddenBody()
  })

  it('does not mislabel an unconfigured backend as a verified non-owner', async () => {
    renderRoute({ session: user })
    expect(await screen.findByRole('alert')).toHaveTextContent('教材の利用資格を確認できません')
    expectHiddenBody()
  })
})

describe('legacy discovery and practice-session isolation', () => {
  it('does not advertise the legacy unit to signed-out visitors', async () => {
    renderWithAppProviders(<WorkplaceLearnLandingPage />)
    await screen.findByRole('heading', { name: '日本の職場で実践する' })
    expect(document.querySelector(`a[href="/learn/${COURSE_CORRECTION_LEARN_SLUG}"]`)).toBeNull()
  })

  it('keeps discovery available to an existing verified owner', async () => {
    renderWithAppProviders(<WorkplaceLearnLandingPage />, { session: user, repository: ownerRepository() })
    await waitFor(() => expect(document.querySelector(`a[href="/learn/${COURSE_CORRECTION_LEARN_SLUG}"]`)).not.toBeNull())
  })

  async function renderDraft() {
    const view = renderWithAppProviders(<Routes><Route path="/practice/:slug" element={<PracticeActivityPage />} /></Routes>, {
      session: user, repository: ownerRepository(), initialEntries: [`/practice/${COURSE_CORRECTION_PRACTICE_SLUG}`],
    })
    await screen.findByRole('heading', { name: '練習問題01' })
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'private draft for A' } })
    fireEvent.click(screen.getAllByRole('button', { name: '解答を確認' })[1]!)
    fireEvent.click(screen.getByRole('button', { name: '解答例を見る' }))
    return view
  }

  function expectClearedDraft() {
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('')
    expect(screen.queryByRole('button', { name: '解答例を見る' })).not.toBeInTheDocument()
    expect(document.querySelector('.practice-activity-card__feedback')).toBeNull()
  }

  it('clears local responses, submission and revealed feedback before another account renders', async () => {
    const view = await renderDraft()
    act(() => view.authClient.emitAuthStateChange({ id: 'different-user', sessionId: 'session-b' }))
    expect(screen.queryByDisplayValue('private draft for A')).not.toBeInTheDocument()
    await screen.findByRole('heading', { name: '練習問題01' })
    expectClearedDraft()
  })

  it('clears drafts for a fresh session of the same account', async () => {
    const view = await renderDraft()
    act(() => view.authClient.emitAuthStateChange({ ...user, sessionId: 'new-session-a' }))
    await screen.findByRole('heading', { name: '練習問題01' })
    expectClearedDraft()
  })

  it('preserves draft and reveal state across a refresh of the same session', async () => {
    const view = await renderDraft()
    act(() => view.authClient.emitAuthStateChange({ ...user }))
    await screen.findByRole('heading', { name: '練習問題01' })
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('private draft for A')
    expect(document.querySelector('.practice-activity-card__feedback')).not.toBeNull()
  })

  it('clears a batched sign-out/sign-in even when the same identity object returns', async () => {
    const view = await renderDraft()
    act(() => {
      view.authClient.emitAuthStateChange(null)
      view.authClient.emitAuthStateChange(user)
    })
    await screen.findByRole('heading', { name: '練習問題01' })
    expectClearedDraft()
  })
})
