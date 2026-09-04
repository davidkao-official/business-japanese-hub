import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import { AuthProvider, createNullAuthClient } from '@business-japanese-hub/platform-auth'
import { describe, expect, it } from 'vitest'
import { CareerGameRouter } from './CareerGameRouter'
import { careerGameCatalog } from './content/catalog'

function renderRoute(pathname: string, search = '') {
  return render(
    <AuthProvider authClient={createNullAuthClient()}>
      <CareerGameRouter pathname={pathname} search={search} />
    </AuthProvider>,
  )
}

describe('Career Game router surface', () => {
  it.each([
    ['/', ''],
    ['/cases/rookie-survival', ''],
    ['/case-link', '?scenarioId=rookie-survival'],
  ])('renders the configured Case for %s%s', async (pathname, search) => {
    renderRoute(pathname, search)

    expect(
      await screen.findByRole('heading', { level: 1, name: '新人社員生存戦' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'career-game-main')
    expect(screen.getByRole('heading', { level: 2, name: 'ケースを選ぶ' })).toBeInTheDocument()
    const headings = within(screen.getByRole('main')).getAllByRole('heading')
    expect(headings[0]).toHaveTextContent('新人社員生存戦')
    expect(headings[1]).toHaveTextContent('ケースを選ぶ')
    for (const scenario of careerGameCatalog.scenarios) {
      expect(
        screen.getByRole('link', { name: new RegExp(scenario.title) }),
      ).toHaveAttribute('href', `/cases/${scenario.slug}`)
    }
  })

  it.each(careerGameCatalog.scenarios)(
    'renders the selected production case from its direct route: %s',
    async (scenario) => {
      renderRoute(`/cases/${scenario.slug}`)

      expect(
        await screen.findByRole('heading', { level: 1, name: scenario.title }),
      ).toBeInTheDocument()
      expect(screen.getByRole('main')).toHaveAttribute('id', 'career-game-main')
    },
  )

  it.each(careerGameCatalog.scenarios)(
    'renders the selected production case from its stable link: %s',
    async (scenario) => {
      renderRoute('/case-link', `?scenarioId=${encodeURIComponent(scenario.id)}`)

      expect(
        await screen.findByRole('heading', { level: 1, name: scenario.title }),
      ).toBeInTheDocument()
    },
  )

  it.each([
    ['/cases/missing', ''],
    ['/case-link', ''],
    ['/case-link', '?scenarioId=missing'],
    ['/unknown', ''],
  ])('renders an accessible unavailable surface for %s%s', (pathname, search) => {
    renderRoute(pathname, search)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'ケースを開けません' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '新人社員生存戦' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '現在のケースを開く' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Libraryへ移動' })).toHaveAttribute(
      'href',
      'https://business-japanese-hub.pages.dev/',
    )
  })
})
