import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Link, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { PlusMembershipAccessRepository } from '../lib/membership/access'
import type { ReadingFetchResult } from '../reading/client'
import { readingCatalog } from '../reading/catalog'
import { sampleReadingItem } from '../reading/fixtures/sample-reading'
import { toReadingCatalogEntry } from '../reading/validate'
import type { ReadingCatalogEntry, ReadingRuntimeItem } from '../reading/types'
import { renderWithAppProviders } from '../test/appProviders'
import { ReadDetailPage } from './ReadDetailPage'
import { ReadLandingPage } from './ReadLandingPage'

const revision = 'd'.repeat(64)
const plusItem: ReadingRuntimeItem = {
  ...sampleReadingItem,
  id: 'reading-plus-synthetic',
  slug: 'synthetic-plus',
  access: 'plus',
  releasedAt: '2026-09-20',
  sampleLabel: undefined,
  relatedLinks: [],
}
const plusEntry = toReadingCatalogEntry(plusItem, { contentId: plusItem.id, revision })
const plusCatalog: readonly ReadingCatalogEntry[] = [plusEntry]
const membership = (access: 'active' | 'non-member' | 'unavailable'): PlusMembershipAccessRepository => ({
  getAccess: vi.fn(async () => access),
})

function routeSet(entries: readonly ReadingCatalogEntry[] = readingCatalog, loadPayload?: (entry: ReadingCatalogEntry, getToken: () => Promise<string | null>, userId: string, signal?: AbortSignal) => Promise<ReadingFetchResult>) {
  return (
    <Routes>
      <Route path="/read" element={<ReadLandingPage />} />
      <Route path="/read/:slug" element={<ReadDetailPage catalogEntries={entries} loadPayload={loadPayload} />} />
      <Route path="/learn/:slug" element={<p>Actual Learn route</p>} />
      <Route path="/books/:slug" element={<p>Book detail route</p>} />
      <Route path="*" element={<p>404 fallback</p>} />
    </Routes>
  )
}

describe('Business Reading surfaces', () => {
  it('shows the original free sample, category filters, and Book/Reader entry points', () => {
    renderWithAppProviders(routeSet(), { initialEntries: ['/read'] })
    expect(screen.getByRole('heading', { name: '日本のビジネス資料を、文脈とともに読む' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /從內部提案看日本商務資料的論點安排/ })).toHaveAttribute('href', '/read/sample-internal-proposal')
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plus の Reading 記事' })).toBeInTheDocument()
    expect(screen.getByText('Plus の記事は現在公開されていません。公開後、会員状態をサーバーで確認して配信します。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '書籍一覧を見る' })).toHaveAttribute('href', '/library')
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href')?.startsWith('/books/'))).toBe(true)
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href')?.endsWith('/read'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'ビジネスニュース' }))
    expect(screen.getByRole('status')).toHaveTextContent('この分類の記事はまだ公開されていません。')
    expect(screen.queryByRole('link', { name: /從內部提案/ })).not.toBeInTheDocument()
  })

  it('renders the direct free detail with Japanese material, zh-TW teaching, and the actual Learn handoff', () => {
    renderWithAppProviders(routeSet(), { initialEntries: ['/read/sample-internal-proposal'] })
    expect(screen.getByRole('heading', { name: sampleReadingItem.title })).toBeInTheDocument()
    expect(screen.getByText(sampleReadingItem.japaneseMaterial.text)).toHaveAttribute('lang', 'ja')
    expect(screen.getByText(sampleReadingItem.explanationZhTW)).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByText('公開日なし')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /論點如何在會議中承接與轉換/ })).toHaveAttribute('href', '/learn/meeting-japanese-course-correction')
  })

  it('uses the shared 404 presentation for an unknown article slug', () => {
    renderWithAppProviders(routeSet(), { initialEntries: ['/read/not-real'] })
    expect(screen.getByRole('heading', { name: 'ページが見つかりません' })).toBeInTheDocument()
  })

  it('does not request Plus content while signed out or a non-member', async () => {
    const load = vi.fn(async () => ({ kind: 'unavailable' as const }))
    const signedOut = renderWithAppProviders(routeSet(plusCatalog, load), { initialEntries: ['/read/synthetic-plus'] })
    expect(await screen.findByText('ログインして会員状態を確認')).toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
    signedOut.unmount()

    renderWithAppProviders(routeSet(plusCatalog, load), {
      session: { id: 'member-free', email: 'reader@example.com' },
      membershipAccessRepository: membership('non-member'),
      initialEntries: ['/read/synthetic-plus'],
    })
    expect(await screen.findByText('現在は Free 状態です')).toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
  })

  it('does not request Plus content while membership status is unavailable', async () => {
    const load = vi.fn(async () => ({ kind: 'unavailable' as const }))
    renderWithAppProviders(routeSet(plusCatalog, load), {
      session: { id: 'member-unknown', email: 'reader@example.com' },
      membershipAccessRepository: membership('unavailable'),
      initialEntries: ['/read/synthetic-plus'],
    })
    expect(await screen.findByText('会員状態を確認できません')).toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
  })

  it('requests the referenced Plus item only for an active member and renders a validated response', async () => {
    const load = vi.fn(async () => ({ kind: 'ok' as const, item: plusItem }))
    renderWithAppProviders(routeSet(plusCatalog, load), {
      session: { id: 'member-plus', email: 'reader@example.com' },
      membershipAccessRepository: membership('active'),
      initialEntries: ['/read/synthetic-plus'],
    })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('heading', { name: plusItem.title })).toBeInTheDocument()
    expect(load).toHaveBeenCalledWith(plusEntry, expect.any(Function), 'member-plus', expect.any(AbortSignal))
  })

  it('keeps Plus body unavailable when fetch fails', async () => {
    const load = vi.fn(async () => ({ kind: 'unavailable' as const }))
    renderWithAppProviders(routeSet(plusCatalog, load), {
      session: { id: 'member-plus', email: 'reader@example.com' },
      membershipAccessRepository: membership('active'),
      initialEntries: ['/read/synthetic-plus'],
    })
    expect(await screen.findByText('記事を読み込めませんでした。時間をおいて再度お試しください。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: plusItem.title })).toBeInTheDocument()
    expect(screen.queryByText(plusItem.japaneseMaterial.text)).not.toBeInTheDocument()
  })

  it('aborts and ignores a late Plus response after the route changes', async () => {
    let resolveFirst: ((value: { kind: 'ok'; item: ReadingRuntimeItem }) => void) | undefined
    let firstSignal: AbortSignal | undefined
    const load = vi.fn((entry: ReadingCatalogEntry, _getToken: () => Promise<string | null>, _userId: string, signal?: AbortSignal) => {
      if (entry.slug === 'synthetic-plus') {
        firstSignal = signal
        return new Promise<{ kind: 'ok'; item: ReadingRuntimeItem }>((resolve) => { resolveFirst = resolve })
      }
      return Promise.resolve({ kind: 'ok' as const, item: { ...plusItem, id: 'reading-plus-other', slug: 'other-plus', title: 'Other private article' } })
    })
    renderWithAppProviders(
      <>
        <Link to="/read/other-plus">Change article</Link>
        {routeSet([plusEntry, { ...plusEntry, id: 'reading-plus-other', slug: 'other-plus', releaseReference: { contentId: 'reading-plus-other', revision } }], load)}
      </>,
      {
        session: { id: 'member-plus', email: 'reader@example.com' },
        membershipAccessRepository: membership('active'),
        initialEntries: ['/read/synthetic-plus'],
      },
    )
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('link', { name: 'Change article' }))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)
    resolveFirst?.({ kind: 'ok', item: plusItem })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Other private article' })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: plusItem.title })).not.toBeInTheDocument()
  })

  it('clears a loaded Plus body as soon as the signed-in account changes', async () => {
    const load = vi.fn(async (_entry: ReadingCatalogEntry, _token: () => Promise<string | null>, _userId: string, signal?: AbortSignal) => {
      if (load.mock.calls.length === 1) return { kind: 'ok' as const, item: plusItem }
      return new Promise<{ kind: 'ok'; item: ReadingRuntimeItem }>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    })
    const renderResult = renderWithAppProviders(routeSet(plusCatalog, load), {
      session: { id: 'member-first', email: 'reader@example.com' },
      membershipAccessRepository: membership('active'),
      initialEntries: ['/read/synthetic-plus'],
    })
    expect(await screen.findByText(plusItem.japaneseMaterial.text)).toBeInTheDocument()
    renderResult.authClient.emitAuthStateChange({ id: 'member-second', email: 'reader@example.com' })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(plusItem.japaneseMaterial.text)).not.toBeInTheDocument()
  })

  it('clears a loaded Plus body immediately when the user signs out', async () => {
    const load = vi.fn(async () => ({ kind: 'ok' as const, item: plusItem }))
    const renderResult = renderWithAppProviders(routeSet(plusCatalog, load), {
      session: { id: 'member-plus', email: 'reader@example.com' },
      membershipAccessRepository: membership('active'),
      initialEntries: ['/read/synthetic-plus'],
    })
    expect(await screen.findByText(plusItem.japaneseMaterial.text)).toBeInTheDocument()
    renderResult.authClient.emitAuthStateChange(null)
    await waitFor(() => expect(screen.queryByText(plusItem.japaneseMaterial.text)).not.toBeInTheDocument())
    expect(screen.getByText('ログインして会員状態を確認')).toBeInTheDocument()
  })

  it('does not reuse a prior Plus body when the same user signs back in', async () => {
    const load = vi.fn(async (_entry: ReadingCatalogEntry, _token: () => Promise<string | null>, _userId: string, signal?: AbortSignal) => {
      if (load.mock.calls.length === 1) return { kind: 'ok' as const, item: plusItem }
      return new Promise<{ kind: 'ok'; item: ReadingRuntimeItem }>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    })
    const renderResult = renderWithAppProviders(routeSet(plusCatalog, load), {
      session: { id: 'member-plus', email: 'reader@example.com' },
      membershipAccessRepository: membership('active'),
      initialEntries: ['/read/synthetic-plus'],
    })
    expect(await screen.findByText(plusItem.japaneseMaterial.text)).toBeInTheDocument()
    renderResult.authClient.emitAuthStateChange(null)
    expect(await screen.findByText('ログインして会員状態を確認')).toBeInTheDocument()
    renderResult.authClient.emitAuthStateChange({ id: 'member-plus', email: 'reader@example.com' })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('heading', { name: plusItem.title })).toBeInTheDocument()
    expect(screen.queryByText(plusItem.japaneseMaterial.text)).not.toBeInTheDocument()
  })
})
