import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { COFOUNDER_PROFILE, FOUNDER_PROFILE } from './app/storefrontProfiles'

const REAL_WORLD_EXAMPLES = [
  "日本企業のプレゼン資料や企画書",
  "決算資料や統合報告書",
  "中期経営計画",
  "ビジネスニュースや業界レポート",
  "日本の社会人が読む書籍や雑誌",
  "職場で実際に使われる語彙",
  "会議、打ち合わせ、プレゼン、議論",
  "敬語の知識だけでは捉えきれない、細かな言葉のニュアンス",
] as const

const AUDIENCE_ITEMS = [
  "JLPT N1に合格したものの、次に何を学べばよいか分からない方",
  "日本での就職を準備していて、日本語の面接で感じる壁を乗り越えたい方",
  "すでに日本企業で働いているものの、会議やコミュニケーションについていくのが難しいと感じる方",
  "日本語の文章はおおむね理解できても、企業資料やビジネスメディアを読みこなせない方",
  "ビジネスの語彙、表現力、議論する力を伸ばしたい方",
  "母語による二次情報だけに頼らず、日本語で直接情報を得られるようになりたい方",
] as const

const NARRATIVE_CHECKPOINTS = [
  '「日本語試験のための日本語」から、「日本の社会人が使う日本語」へ。',
  'Business Japanese Hubは、JLPT N1に合格し、日本の職場やビジネスの世界で実際に活躍したい外国人の方のための日本語学習プラットフォームです。',
  "日本語を読んで理解できる",
  '日本語で読み、考え、議論し、働ける。',
  'なぜ、このプラットフォームを作ろうと思ったのか？',
  'N1に合格してから日本の職場で働くまでの道のりは、あまり教わる機会がありません。',
  'どんな方に向いている？',
  "「N1の先で、日本語を本当に仕事で使える力にするには？」",
  'なぜ、私が取り組むのか？',
] as const

function renderAppAt(pathname: string) {
  window.history.replaceState(null, '', pathname)
  return render(<App />)
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function expectOrderedText(checkpoints: readonly string[]): void {
  const pageText = normalizedText(document.body.textContent)
  let previousIndex = -1

  for (const checkpoint of checkpoints) {
    const index = pageText.indexOf(checkpoint)
    expect(index, `missing Japanese About draft copy: ${checkpoint}`).toBeGreaterThanOrEqual(0)
    expect(index, `About narrative is out of order at: ${checkpoint}`).toBeGreaterThan(previousIndex)
    previousIndex = index
  }
}

function expectOrderedListItems(items: readonly string[]): void {
  const renderedItems = Array.from(document.querySelectorAll('li')).map((item) =>
    normalizedText(item.textContent),
  )
  let previousIndex = -1

  for (const expected of items) {
    const index = renderedItems.findIndex(
      (item, candidateIndex) => candidateIndex > previousIndex && item === expected,
    )
    expect(index, `missing or out-of-order list item: ${expected}`).toBeGreaterThan(previousIndex)
    previousIndex = index
  }
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  document.title = ''
})

describe('Issue #72 About public contract', () => {
  it('serves a real /about route with one About H1 and route-level document title', async () => {
    renderAppAt('/about')

    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent("Business Japanese Hubについて")
    expect(screen.queryByRole('heading', { name: 'ページが見つかりません' })).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toContain("Business Japanese Hubについて"))
  })

  it('makes /about discoverable from normal public site chrome', () => {
    renderAppAt('/')

    const chrome = [screen.getByRole('banner'), screen.getByRole('contentinfo')]
    const aboutLinks = chrome.flatMap((landmark) =>
      Array.from(within(landmark).queryAllByRole('link')).filter((link) => {
        const href = link.getAttribute('href')
        if (!href) return false
        return new URL(href, window.location.origin).pathname.replace(/\/$/, '') === '/about'
      }),
    )

    expect(aboutLinks.length).toBeGreaterThan(0)
  })

  it('preserves the Japanese narrative sequence and core contrast', () => {
    renderAppAt('/about')

    expectOrderedText(NARRATIVE_CHECKPOINTS)
    expect(normalizedText(document.body.textContent)).toContain('N5 → N4 → N3 → N2 → N1')
  })

  it('renders all eight real-world examples and all six audience profiles as ordered list items', () => {
    renderAppAt('/about')

    expectOrderedListItems(REAL_WORLD_EXAMPLES)
    expectOrderedListItems(AUDIENCE_ITEMS)
  })

  it('uses semantic section headings and a blockquote for the core post-N1 question', () => {
    renderAppAt('/about')

    expect(screen.getByRole('heading', { name: "なぜ、このプラットフォームを作ろうと思ったのか？" })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: "N1に合格してから日本の職場で働くまでの道のりは、あまり教わる機会がありません。" }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "どんな方に向いている？" })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "なぜ、私が取り組むのか？" })).toBeInTheDocument()

    const coreQuestion = screen.getByText("「N1の先で、日本語を本当に仕事で使える力にするには？」")
    expect(coreQuestion.closest('blockquote')).not.toBeNull()
  })

  it('keeps the founder story and the existing founder/co-founder identities distinct', () => {
    renderAppAt('/about')

    const pageText = normalizedText(document.body.textContent)
    expect(pageText).toContain('高校時代に、JLPT N1に合格しました。')
    expect(pageText).toContain("大学時代には、台湾の日本語観光ガイド・日本語添乗員の国家資格を取得し、日本語の個別指導や中国語・日本語の通訳の経験も重ねました。")
    expect(pageText).toContain('その後、MBAを取得するために日本へ留学しました。')
    expect(pageText).toContain('日本の四大会計事務所の一つでコンサルティングに携わるようになってからは')
    expect(pageText).toContain("N1に合格することと、日本で日本語を使って働けることの間には、まだ長い道のりがあります。")

    expect(FOUNDER_PROFILE.heading).toBe('創辦人｜David Kao')
    expect(COFOUNDER_PROFILE.heading).toBe('共同創辦人｜塔奇巧克力（TachikoChoko）')
    expect(FOUNDER_PROFILE.credentials).toContain('於日本取得 MBA（工商管理碩士）')
    expect(COFOUNDER_PROFILE.credentials).toContain('現居東京，並於東京的語言學校學習日文')
  })
})
