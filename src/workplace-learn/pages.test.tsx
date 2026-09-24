import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkplaceLearnCatalogEntry, WorkplaceLearnRuntimeItem } from './types'
import { workplaceLearnCatalog } from './catalog'
import { sampleWorkplaceLearnItem } from './sample'
import { toWorkplaceLearnCatalogEntry } from './validate'
import { WorkplaceLessonPage, WorkplaceVocabularyIndexPage } from './pages'
import { renderWithAppProviders } from '../test/appProviders'
import { setLocalePreference } from '../i18n/strings'
import App from '../App'
import { COURSE_CORRECTION_LEARN_SLUG, getLearningUnitByLearnSlug } from '../app/learningUnits'

afterEach(() => {
  setLocalePreference(null)
  window.history.replaceState(null, '', '/')
})

describe('Workplace Learn routes and details', () => {
  it('routes the public discovery path to vocabulary and lesson details', async () => {
    setLocalePreference('zh-TW')
    window.history.replaceState(null, '', '/learn')
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: '日本職場實戰' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /語彙列表/ })[0]).toHaveAttribute('href', '/learn/vocabulary')
    expect(screen.getByText('報告時に事実と次の対応を短く伝える')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('link', { name: /語彙列表/ })[0]!)
    expect(await screen.findByRole('heading', { level: 1, name: '日本職場語彙' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /見込み/ }))
    expect(await screen.findByRole('heading', { level: 1, name: '見込み' })).toBeInTheDocument()
    expect(screen.getByText(/預估、預期/)).toBeInTheDocument()
    expect(screen.getByText(/不代表所有公司/)).toBeInTheDocument()
  })

  it('keeps the Book-projected Learn slug available on its original route', () => {
    const existing = getLearningUnitByLearnSlug(COURSE_CORRECTION_LEARN_SLUG)
    expect(existing).toBeDefined()
    setLocalePreference('zh-TW')
    window.history.replaceState(null, '', `/learn/${COURSE_CORRECTION_LEARN_SLUG}`)
    render(<App />)
    expect(screen.getByRole('heading', { name: existing!.title })).toBeInTheDocument()
  })

  it('shows a truthful empty state for a vocabulary catalog without entries', () => {
    renderWithAppProviders(
      <Routes><Route path="/learn/vocabulary" element={<WorkplaceVocabularyIndexPage catalogEntries={[]} />} /></Routes>,
      { initialEntries: ['/learn/vocabulary'] },
    )
    expect(screen.getByText('公開中の職場語彙はありません。')).toBeInTheDocument()
  })

  it('does not render an injected Free item when its runtime metadata differs from the catalog', () => {
    setLocalePreference('zh-TW')
    const wrongMetadata: WorkplaceLearnCatalogEntry[] = [{ ...workplaceLearnCatalog[0]!, title: 'Different title' }]
    renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={wrongMetadata} publicItems={[sampleWorkplaceLearnItem]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${wrongMetadata[0]!.slug}`] },
    )
    expect(screen.queryByText(sampleWorkplaceLearnItem.whatToSayJapanese)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('目前無法載入教材')
  })

  it('clears a loaded Plus body when the authenticated identity changes', async () => {
    const privateItem: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceLearnItem,
      id: 'private-workplace-lesson-test',
      slug: 'private-workplace-lesson-test',
      title: 'Member only title',
      access: 'plus',
      sampleLabel: undefined,
      whatToSayJapanese: '私有本文の識別用フレーズです。',
      relatedVocabularyIds: [],
    }
    const revision = 'd'.repeat(64)
    const plusEntry = toWorkplaceLearnCatalogEntry(privateItem, { contentId: privateItem.id, revision })
    const repo = { getAccess: vi.fn().mockResolvedValue('active' as const) }
    const loadPayload = vi.fn().mockResolvedValue({ kind: 'ok' as const, item: privateItem })
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[plusEntry]} publicItems={[]} loadPayload={loadPayload} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${plusEntry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: repo },
    )

    expect(await screen.findByText('私有本文の識別用フレーズです。')).toBeInTheDocument()
    act(() => view.authClient.emitAuthStateChange(null))
    await waitFor(() => expect(screen.queryByText('私有本文の識別用フレーズです。')).not.toBeInTheDocument())
    expect(screen.getByText('ログインして会員状態を確認')).toBeInTheDocument()
  })
})
