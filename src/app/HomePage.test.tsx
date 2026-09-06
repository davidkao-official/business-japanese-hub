import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithAppProviders } from '../test/appProviders'
import { HomePage } from './HomePage'

describe('learning-service home', () => {
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
})
