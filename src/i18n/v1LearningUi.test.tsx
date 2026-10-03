import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App'
import { jaLearningUi, zhTWLearningUi } from './learningUi'
import { LOCALE_STORAGE_KEY, setLocalePreference } from './strings'
import { practiceDiscoveryCategoryLabel } from '../practice-web-test/discoveryCatalog'

const legacyInterfaceCopy = Object.entries(zhTWLearningUi)
  .filter(([key, value]) => typeof value === 'string' && value.length > 6 && value !== jaLearningUi[key as keyof typeof jaLearningUi])
  .map(([, value]) => value as string)

afterEach(() => {
  setLocalePreference(null)
  window.history.replaceState(null, '', '/')
})

describe('Japanese learning interface', () => {
  it.each([
    ['/', '「試験の日本語」から「日本のビジネス社会で使う日本語」へ。'],
    ['/practice/web-test', jaLearningUi.webTitle],
    ['/practice/web-test/spi/verbal', jaLearningUi.webVerbal],
    ['/my-learning', jaLearningUi.myTitle],
    ['/plus', 'Business Japanese Hub Plus'],
    ['/learn', '日本の職場で実践する'],
    ['/read', '日本のビジネス資料を、文脈とともに読む'],
    ['/about', 'Business Japanese Hubについて'],
    ['/practice/web-test/about-spi', 'SPIとは？日本での就職・転職前に知っておきたいWebテスト'],
  ])('renders %s in Japanese without rewriting the dormant preference', (path, heading) => {
    setLocalePreference('zh-TW')
    window.history.replaceState(null, '', path)
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('ja')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-TW')
    expect(screen.queryByRole('button', { name: /表示言語/ })).not.toBeInTheDocument()
    const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      // Authored content retains its own language until the separate #195 lane.
      if (!node.parentElement?.closest('[lang="zh-TW"], [lang="zh-Hant"]')) {
        for (const oldCopy of legacyInterfaceCopy) expect(node.textContent).not.toContain(oldCopy)
      }
      node = walker.nextNode()
    }
  })

  it('uses draft Japanese category labels by default and retains dormant Chinese labels', () => {
    expect(practiceDiscoveryCategoryLabel('practice-web-test-spi-v1', 'spi', 'verbal', 'semantic-relation')).toBe('二語の関係')
    expect(practiceDiscoveryCategoryLabel('practice-web-test-spi-v1', 'spi', 'verbal', 'semantic-relation', 'zh-TW')).toBe('語句關係')
    expect(practiceDiscoveryCategoryLabel('practice-web-test-spi-v1', 'spi', 'verbal', 'private-editorial-label')).toBeUndefined()
  })
})
