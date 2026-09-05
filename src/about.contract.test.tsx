import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { COFOUNDER_PROFILE, FOUNDER_PROFILE } from './app/storefrontProfiles'

const REAL_WORLD_EXAMPLES = [
  '日本企業的簡報與企劃書',
  '決算資料與統合報告書',
  '中期經營計畫',
  '商業新聞與產業報告',
  '日本社會人閱讀的書籍與雜誌',
  '公司裡真正使用的語彙',
  '會議、打合せ、簡報與討論',
  '敬語之外更加細微的語感',
] as const

const AUDIENCE_ITEMS = [
  '已通過 JLPT N2／N1，卻不知道下一步該學什麼的人',
  '準備到日本求職，希望突破日文面試瓶頸的人',
  '已經在日本企業工作，卻覺得跟不上會議與溝通的人',
  '日文文章大致看得懂，卻讀不懂企業資料與商業媒體的人',
  '想提升商業語彙、表達與議論能力的人',
  '希望不再只靠中文二手資訊，而能直接取得日本資訊的人',
] as const

const NARRATIVE_CHECKPOINTS = [
  '從「日文檢定的日文」，走進「日本社會人的日文」',
  'Business Japanese Hub 是為已經具備中高階日文能力、希望真正進入日本職場與商業世界的人所打造的日文學習平台',
  '看得懂日文',
  '能用日文閱讀、思考、討論與工作',
  '為什麼想做這個平台',
  'N1 與日本職場之間，存在一段很少有人教的距離',
  '這個平台適合誰',
  '「N1 之後，我要怎麼讓日文真正變成工作能力？」',
  '為什麼是我',
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
    expect(index, `missing approved About copy: ${checkpoint}`).toBeGreaterThanOrEqual(0)
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
    expect(h1s[0]).toHaveTextContent('關於 Business Japanese Hub')
    expect(screen.queryByRole('heading', { name: 'ページが見つかりません' })).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toContain('關於 Business Japanese Hub'))
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

  it('preserves the approved narrative sequence and core contrast', () => {
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

    expect(screen.getByRole('heading', { name: '為什麼想做這個平台？' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'N1 與日本職場之間，存在一段很少有人教的距離。' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '這個平台適合誰？' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '為什麼是我？' })).toBeInTheDocument()

    const coreQuestion = screen.getByText('「N1 之後，我要怎麼讓日文真正變成工作能力？」')
    expect(coreQuestion.closest('blockquote')).not.toBeNull()
  })

  it('keeps the approved founder story and the existing founder/co-founder identities distinct', () => {
    renderAppAt('/about')

    const pageText = normalizedText(document.body.textContent)
    expect(pageText).toContain('高中時，我通過了 JLPT N1')
    expect(pageText).toContain('台灣日語導遊、日語領隊國家資格')
    expect(pageText).toContain('後來來到日本攻讀 MBA')
    expect(pageText).toContain('進入日本四大事務所做 Consulting 之後')
    expect(pageText).toContain('考過 N1，和能不能在日本用日文工作，中間還隔著很長一段路')

    expect(FOUNDER_PROFILE.heading).toBe('創辦人｜David Kao')
    expect(COFOUNDER_PROFILE.heading).toBe('共同創辦人｜塔奇巧克力（TachikoChoko）')
    expect(FOUNDER_PROFILE.credentials).toContain('於日本取得 MBA（工商管理碩士）')
    expect(COFOUNDER_PROFILE.credentials).toContain('現居東京，並於東京的語言學校學習日文')
  })
})
