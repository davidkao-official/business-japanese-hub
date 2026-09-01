import { describe, expect, it } from 'vitest'
import {
  CANONICAL_CAREER_GAME_ORIGIN,
  careerGameCaseLinkHref,
  careerGameHomeHref,
  resolveCareerGameOrigin,
} from './careerGame'

describe('Library Career Game links', () => {
  it('uses the canonical Game origin and stable scenario-id resolver', () => {
    expect(resolveCareerGameOrigin(undefined)).toBe(CANONICAL_CAREER_GAME_ORIGIN)
    expect(careerGameHomeHref(undefined)).toBe(
      'https://business-japanese-career-game.pages.dev/',
    )
    expect(careerGameCaseLinkHref('rookie survival', undefined)).toBe(
      'https://business-japanese-career-game.pages.dev/case-link?scenarioId=rookie+survival',
    )
  })

  it('permits an origin-only HTTPS override and localhost development origins', () => {
    expect(resolveCareerGameOrigin('https://game.example.jp/')).toBe('https://game.example.jp')
    expect(resolveCareerGameOrigin('http://localhost:4174')).toBe('http://localhost:4174')
    expect(resolveCareerGameOrigin('http://127.0.0.1:5174/')).toBe('http://127.0.0.1:5174')
    expect(careerGameHomeHref('https://game.example.jp/')).toBe('https://game.example.jp/')
  })

  it.each([
    'http://game.example.jp',
    'https://user:secret@game.example.jp',
    'https://game.example.jp/path',
    'https://game.example.jp/?query=private',
    'https://game.example.jp/#fragment',
    'not a URL',
  ])('fails closed to the canonical origin for unsafe override %s', (value) => {
    expect(resolveCareerGameOrigin(value)).toBe(CANONICAL_CAREER_GAME_ORIGIN)
  })
})
