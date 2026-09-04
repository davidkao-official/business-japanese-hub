import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithAppProviders } from '../test/appProviders'
import { HomePage } from './HomePage'

function clickWithoutNavigation(link: HTMLElement, init: MouseEventInit = {}) {
  link.addEventListener('click', (event) => event.preventDefault(), { once: true })
  fireEvent.click(link, init)
}

function auxiliaryClickWithoutNavigation(link: HTMLElement, button = 1) {
  link.addEventListener('auxclick', (event) => event.preventDefault(), { once: true })
  fireEvent(
    link,
    new MouseEvent('auxclick', { bubbles: true, cancelable: true, button }),
  )
}

describe('storefront', () => {
  it('features the commercial Book and lists both free Books as a compact shelf', async () => {
    renderWithAppProviders(<HomePage />)

    const feature = document.querySelector('.featured-book') as HTMLElement
    expect(feature).not.toBeNull()
    expect(within(feature).getByRole('heading', { name: '会議の日本語', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'すべての書籍' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /ビジネス日本語：敬語の基礎/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /ビジネスメールの作法/ })).toBeInTheDocument()
    })
  })

  it('organizes the storefront around read, practice, and continue paths', () => {
    renderWithAppProviders(<HomePage />)

    const paths = document.querySelector('.storefront-paths')
    expect(paths).not.toBeNull()
    const pathsScope = within(paths as HTMLElement)
    expect(pathsScope.getByText('READ')).toBeInTheDocument()
    expect(pathsScope.getByText('PRACTICE')).toBeInTheDocument()
    expect(pathsScope.getByText('CONTINUE')).toBeInTheDocument()
    expect(pathsScope.getByRole('link', { name: '詳細を見る' })).toHaveAttribute(
      'href',
      '/books/meeting-japanese',
    )
    expect(pathsScope.getByRole('link', { name: 'ケースをプレイ' })).toHaveAttribute(
      'href',
      'https://business-japanese-career-game.pages.dev/',
    )
    expect(pathsScope.getByRole('link', { name: '続きを読む' })).toHaveAttribute(
      'href',
      '/library',
    )
  })

  it('renders the supported mid-page editorial sections from released content', () => {
    renderWithAppProviders(<HomePage />)

    const features = document.querySelector('.storefront-features') as HTMLElement
    expect(features).not.toBeNull()
    expect(within(features).getAllByRole('listitem')).toHaveLength(3)
    expect(within(features).getByText('BOOK')).toBeInTheDocument()
    expect(within(features).getByText('CHAPTER')).toBeInTheDocument()
    expect(within(features).getByText('EXPRESSION')).toBeInTheDocument()

    const samples = document.querySelector('.storefront-samples') as HTMLElement
    expect(samples).not.toBeNull()
    expect(
      within(samples).getByText(
        '本日の目的は、三つの企画案から来月検証する一案を決めることです。',
      ),
    ).toBeInTheDocument()
    expect(within(samples).getByText('敬語（けいご）')).toBeInTheDocument()
    expect(
      within(samples).getByText(
        'お手数をおかけしますが、ご確認のほどよろしくお願いいたします。',
      ),
    ).toBeInTheDocument()
    expect(within(samples).getByText('敬語（けいご）')).toHaveAttribute('lang', 'ja')
    expect(within(samples).getByText('麻煩您確認，謝謝。')).toHaveAttribute('lang', 'zh-TW')
    expect(within(samples).getByText('依頼を締めくくる定番表現です。')).toHaveAttribute(
      'lang',
      'ja',
    )
    expect(within(samples).getByRole('region')).toHaveAttribute(
      'aria-label',
      '実際の文章と会話から学ぶ',
    )

    const selections = document.querySelector('.storefront-selections') as HTMLElement
    expect(selections).not.toBeNull()
    expect(within(selections).getAllByRole('img')).toHaveLength(3)
    expect(screen.queryByRole('heading', { name: /stats/i })).not.toBeInTheDocument()
  })

  it('renders the approved founder and co-founder profiles on the public storefront', () => {
    renderWithAppProviders(<HomePage />)

    const founderHeading = screen.getByRole('heading', { name: '創辦人｜David Kao' })
    expect(founderHeading).toBeInTheDocument()
    expect(founderHeading.closest('article')).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByText('高中時期通過 JLPT N1')).toBeInTheDocument()
    expect(screen.getByText('通過台灣國家考試，取得日語導遊、日語領隊資格')).toBeInTheDocument()
    expect(screen.getByText('大學期間累積日文家教及中日口譯經驗')).toBeInTheDocument()
    expect(screen.getByText('於日本取得 MBA（工商管理碩士）')).toBeInTheDocument()
    expect(screen.getByText('四大日本法人 Business Consultant 經歷')).toBeInTheDocument()
    expect(screen.getByText('透過日本高度人才制度取得日本永久居留資格')).toBeInTheDocument()

    const languagesLabel = screen.getByText('Languages')
    const languagesLine = languagesLabel.parentElement
    expect(languagesLabel).toHaveAttribute('lang', 'en')
    expect(languagesLine).not.toBeNull()
    expect(languagesLine).toHaveTextContent('Languages繁體中文｜日本語｜English')
    const languageScope = within(languagesLine as HTMLElement)
    expect(languageScope.getByText('繁體中文')).toHaveAttribute('lang', 'zh-TW')
    expect(languageScope.getByText('日本語')).toHaveAttribute('lang', 'ja')
    expect(languageScope.getByText('English')).toHaveAttribute('lang', 'en')

    const cofounderHeading = screen.getByRole('heading', {
      name: '共同創辦人｜塔奇巧克力（TachikoChoko）',
    })
    expect(cofounderHeading).toBeInTheDocument()
    expect(cofounderHeading.closest('article')).toHaveAttribute('lang', 'zh-TW')
    expect(screen.queryByRole('heading', { name: '作者｜塔奇巧克力（TachikoChoko）' })).not.toBeInTheDocument()
    expect(screen.getByText('曾於直播平台「初樂（TrueLoveLive）」擔任後端工程師')).toBeInTheDocument()
    expect(screen.getByText('曾於冰角工作室擔任後端 Lead，主要負責後端系統開發')).toBeInTheDocument()
    expect(
      screen.getByText('長期關注資料庫效能優化、查詢速度與系統架構等後端工程議題'),
    ).toBeInTheDocument()
    expect(screen.getByText('名字中的「塔奇」取自《攻殼機動隊》的塔奇克馬')).toBeInTheDocument()
    expect(screen.getByText('現居東京，並於東京的語言學校學習日文')).toBeInTheDocument()
    expect(
      screen.getByText('以工程師與日語學習者的雙重視角，參與 Business Japanese Hub 的產品與技術開發'),
    ).toBeInTheDocument()
  })

  it('shows authoritative USD pricing plus purchase and preview actions for the paid feature', async () => {
    renderWithAppProviders(<HomePage />)

    const feature = document.querySelector('.featured-book') as HTMLElement
    await waitFor(() => expect(within(feature).getByText('USD 12')).toBeInTheDocument())
    expect(within(feature).getByRole('button', { name: '購入する（USD 12）' })).toBeInTheDocument()
    expect(within(feature).getByRole('link', { name: '試し読み' })).toHaveAttribute(
      'href',
      '/books/meeting-japanese/read/meeting-purpose',
    )
  })

  it('closes with one catalog-driven paid Book offer and the existing CTA seam', async () => {
    renderWithAppProviders(<HomePage />)

    const offer = document.querySelector('.storefront-offer') as HTMLElement
    expect(offer).not.toBeNull()
    expect(within(offer).getByRole('heading', { name: '会議の日本語', level: 2 })).toBeInTheDocument()
    await waitFor(() => expect(within(offer).getByText('USD 12')).toBeInTheDocument())
    expect(within(offer).getByRole('button', { name: '購入する（USD 12）' })).toBeInTheDocument()
    expect(within(offer).getByRole('link', { name: '試し読み' })).toHaveAttribute(
      'href',
      '/books/meeting-japanese/read/meeting-purpose',
    )
    expect(within(offer).getByRole('link', { name: '詳細を見る' })).toHaveAttribute(
      'href',
      '/books/meeting-japanese',
    )
  })

  it('keeps the two Prototype books visibly free without changing their access tier', async () => {
    renderWithAppProviders(<HomePage />)

    await waitFor(() => expect(screen.getAllByText('無料')).toHaveLength(2))
    expect(screen.queryByText('¥880')).not.toBeInTheDocument()
    expect(screen.queryByText('¥660')).not.toBeInTheDocument()
  })

  it('offers a quiet content-neutral link and tracks rapid activation only once', () => {
    const track = vi.fn()
    renderWithAppProviders(<HomePage analytics={{ track }} />)

    const link = screen.getByRole('link', { name: 'ケースをプレイ' })
    expect(link).toHaveAttribute(
      'href',
      'https://business-japanese-career-game.pages.dev/',
    )

    clickWithoutNavigation(link)
    clickWithoutNavigation(link)

    expect(track).toHaveBeenCalledExactlyOnceWith({
      event: 'cross_product_link_clicked',
      direction: 'library_to_career_game',
    })
  })

  it('uses the public Career Game origin override without letting analytics block the link', () => {
    const analytics = {
      track: vi.fn(() => {
        throw new Error('analytics unavailable')
      }),
    }
    renderWithAppProviders(
      <HomePage
        analytics={analytics}
        careerGameOriginValue="https://game-preview.example.jp"
      />,
    )

    const link = screen.getByRole('link', { name: 'ケースをプレイ' })
    expect(link).toHaveAttribute(
      'href',
      'https://game-preview.example.jp/',
    )
    expect(() => clickWithoutNavigation(link)).not.toThrow()
  })

  it('deduplicates rapid modified activation and tracks later genuine movements', () => {
    const track = vi.fn()
    renderWithAppProviders(<HomePage analytics={{ track }} />)
    const link = screen.getByRole('link', { name: 'ケースをプレイ' })
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)

    try {
      clickWithoutNavigation(link, { metaKey: true })
      clickWithoutNavigation(link, { metaKey: true })
      expect(track).toHaveBeenCalledTimes(1)

      clock.mockReturnValue(1_500)
      clickWithoutNavigation(link, { metaKey: true })
      clickWithoutNavigation(link)

      expect(track).toHaveBeenCalledTimes(3)
    } finally {
      clock.mockRestore()
    }
  })

  it('tracks middle-button movement without counting duplicate or context-menu gestures', () => {
    const track = vi.fn()
    renderWithAppProviders(<HomePage analytics={{ track }} />)
    const link = screen.getByRole('link', { name: 'ケースをプレイ' })

    auxiliaryClickWithoutNavigation(link)
    auxiliaryClickWithoutNavigation(link)
    auxiliaryClickWithoutNavigation(link, 2)

    expect(track).toHaveBeenCalledExactlyOnceWith({
      event: 'cross_product_link_clicked',
      direction: 'library_to_career_game',
    })
  })
})
