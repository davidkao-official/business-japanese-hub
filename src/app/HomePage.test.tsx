import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { getStrings, setLocalePreference } from '../i18n/strings'
import { renderWithAppProviders } from '../test/appProviders'
import { HomePage } from './HomePage'

beforeEach(() => {
  setLocalePreference('ja')
})

afterEach(() => {
  setLocalePreference(null)
})

describe('learning-service home', () => {
  it('keeps Japanese homepage headings readable as intact phrase units', () => {
    renderWithAppProviders(<HomePage />)

    const title = screen.getByRole('heading', {
      level: 1,
      name: '「試験の日本語」から「日本のビジネス社会で使う日本語」へ。',
    })
    expect(title).toHaveAttribute('aria-label', '「試験の日本語」から「日本のビジネス社会で使う日本語」へ。')
    expect(title).toHaveAttribute('lang', 'ja')
    expect(Array.from(title.querySelectorAll('.phrase'), (phrase) => phrase.textContent)).toEqual([
      '「', '試験の日本語', '」から「', '日本の', 'ビジネス社会で使う', '日本語', '」へ。',
    ])

    const featureTitle = screen.getByRole('heading', {
      level: 2,
      name: '実務で使う言葉を、文脈の中で読む',
    })
    expect(featureTitle).toHaveAttribute('aria-label', '実務で使う言葉を、文脈の中で読む')
    expect(Array.from(featureTitle.querySelectorAll('.phrase'), (phrase) => phrase.textContent)).toEqual([
      '実務で使う',
      '言葉を、',
      '文脈の中で',
      '読む',
    ])

    for (const [id, name] of [
      ['learning-modes-title', '次に役立つ学び方を選ぶ'],
      ['storefront-samples-title', '実際の文章と会話から学ぶ'],
      ['storefront-selections-title', '公開中の書籍から、読む場所を選ぶ'],
    ]) {
      expect(document.getElementById(id)).toHaveAttribute('aria-label', name)
      expect(screen.getByRole('heading', { name })).toHaveTextContent(name)
    }
  })

  it('leaves translated homepage headings and accessible names as their original strings', () => {
    setLocalePreference('zh-CN')
    renderWithAppProviders(<HomePage />)

    const title = screen.getByRole('heading', {
      level: 1,
      name: '从「日语考试中的日语」，成长为「日本商业社会中的日语」。',
    })
    expect(title).toHaveTextContent('从「日语考试中的日语」，成长为「日本商业社会中的日语」。')
    expect(title.querySelector('.phrase')).not.toBeNull()
  })

  it('presents the exact Traditional Chinese headline and working learning/about actions', () => {
    setLocalePreference('zh-TW')
    renderWithAppProviders(<HomePage />)

    const headline = '從「日文檢定的日文」，成長為「日本商業社會的日文」。'
    const title = screen.getByRole('heading', { level: 1, name: headline })
    expect(title).toHaveTextContent(headline)
    expect(title).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByRole('link', { name: '開始學習商業日文' })).toHaveAttribute('href', '/learn')
    expect(screen.getByRole('link', { name: '了解這個平台' })).toHaveAttribute('href', '/about')
    expect(document.querySelectorAll('.concept-journey__step')).toHaveLength(4)
    expect(document.querySelectorAll('.concept-pillar')).toHaveLength(4)
    expect(screen.getByRole('heading', { name: '連結工作旅程的學習方向' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '從四種能力，繼續學習在日本工作所需的日文。' })).toBeInTheDocument()
  })

  it('provides homepage messaging in English through the typed locale contract', () => {
    setLocalePreference('en')
    renderWithAppProviders(<HomePage />)

    expect(screen.getByRole('heading', {
      level: 1,
      name: 'Move from Japanese for JLPT exams to Japanese for Japan’s business world.',
    })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start learning' })).toHaveAttribute('href', '/learn')
    expect(document.querySelectorAll('.concept-journey__step')).toHaveLength(4)
    expect(document.querySelectorAll('.concept-pillar')).toHaveLength(4)
  })

  it('makes the five learning modes primary without rendering a one-time Book sales shell', () => {
    renderWithAppProviders(<HomePage />)

    const home = document.querySelector('.learning-service-home')
    expect(home).not.toBeNull()

    for (const href of ['/learn', '/read', '/practice', '/my-learning', '/experience']) {
      expect(home?.querySelector(`a[href="${href}"]`)).not.toBeNull()
    }

    expect(document.querySelector('.featured-book')).toBeNull()
    expect(document.querySelector('.storefront-catalog')).toBeNull()
    expect(document.querySelector('.storefront-offer')).toBeNull()
    expect(screen.queryByText('USD 12')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /購入する|Buy/i })).not.toBeInTheDocument()
  })

  it('keeps released editorial content discoverable as a Read projection', () => {
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
    expect(within(selections).getAllByRole('link', { name: '詳細を見る' })).toHaveLength(3)
    expect(screen.queryByRole('heading', { name: /stats/i })).not.toBeInTheDocument()
  })

  it('keeps the approved public founder and co-founder profiles available below the service entry points', () => {
    renderWithAppProviders(<HomePage />)

    const founderHeading = screen.getByRole('heading', { name: '創辦人｜David Kao' })
    expect(founderHeading.closest('article')).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByText('高中時期通過 JLPT N1')).toBeInTheDocument()
    expect(screen.getByText('四大日本法人 Business Consultant 經歷')).toBeInTheDocument()

    const cofounderHeading = screen.getByRole('heading', {
      name: '共同創辦人｜塔奇巧克力（TachikoChoko）',
    })
    expect(cofounderHeading.closest('article')).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByText('現居東京，並於東京的語言學校學習日文')).toBeInTheDocument()
  })

  it('uses locale-owned mode copy while language-scoping canonical mode names', () => {
    setLocalePreference('zh-TW')
    renderWithAppProviders(<HomePage />)

    const strings = getStrings('zh-TW')
    expect(
      screen.getByRole('heading', { level: 2, name: strings.learningModes.serviceTitle }),
    ).toBeInTheDocument()
    expect(screen.getByText(strings.learningModes.modes.read.summary)).toBeInTheDocument()

    const readLabel = document.querySelector(
      'a[href="/read"] .learning-modes__link-label',
    )
    expect(readLabel).toHaveAttribute('lang', 'en')
    expect(readLabel).toHaveTextContent('Read')
  })
})
