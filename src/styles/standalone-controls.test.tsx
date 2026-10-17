import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { sampleBook } from '../content/fixtures/sample-book'
import { ReaderTopBar } from '../reader/ReaderTopBar'

const styleFiles = [...readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf8')
  .matchAll(/import ['"]\.\/styles\/([^'"]+)['"]/g)]
  .map((match) => match[1])
  .filter((file): file is string => Boolean(file))

const standaloneTargets = [
  '.reader-topbar__back',
  '.site-footer__brand',
  '.site-footer__legal-list a',
  '.workplace-learn__browse-links a',
  '.workplace-learn__section-heading > a',
  '.workplace-learn__item h3 a',
  '.workplace-learn__read-link',
  '.workplace-learn__back',
  '.workplace-learn__related a',
  '.workplace-learn__body li > a',
  '.reading-card h3 a',
  '.reading-card__action',
  '.reading-back',
  '.reading-related a',
  '.reading-books__links a',
  '.reading-source dd > a',
]

function readStyle(file: string) {
  return readFileSync(join(process.cwd(), 'src/styles', file), 'utf8')
}

function withRules(check: (rules: CSSRule[], finalStyleRules: CSSRule[]) => void) {
  const styles = styleFiles.map((file) => {
    const style = document.createElement('style')
    style.textContent = readStyle(file)
    document.head.append(style)
    return style
  })

  try {
    check(
      styles.flatMap((style) => Array.from(style.sheet!.cssRules)),
      Array.from(styles.at(-1)!.sheet!.cssRules),
    )
  } finally {
    styles.forEach((style) => style.remove())
  }
}

function selectors(rule: CSSRule) {
  return rule instanceof CSSStyleRule
    ? rule.selectorText.split(',').map((selector) => selector.trim())
    : []
}

function exactRule(rules: CSSRule[], selector: string) {
  return rules.find(
    (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && selectors(rule).includes(selector),
  )
}

function declarations(rules: CSSRule[], selector: string) {
  const result = new Map<string, string>()

  for (const rule of rules) {
    if (rule instanceof CSSStyleRule && selectors(rule).includes(selector)) {
      for (const property of Array.from(rule.style)) {
        result.set(property, rule.style.getPropertyValue(property))
      }
    }
  }

  return result
}

function nestedMediaRules(rules: CSSRule[]): CSSStyleRule[] {
  return rules.flatMap((rule) => {
    if (rule instanceof CSSMediaRule) {
      return Array.from(rule.cssRules).flatMap((nested) =>
        nested instanceof CSSMediaRule
          ? nestedMediaRules([nested])
          : nested instanceof CSSStyleRule ? [nested] : [],
      )
    }
    return []
  })
}

describe('standalone control targets', () => {
  it('applies the shared 44px target to explicit standalone links in final stylesheet order', () => {
    withRules((rules, finalStyleRules) => {
      expect(styleFiles.at(-1)).toBe('standalone-controls.css')
      const inlineRule = exactRule(finalStyleRules, '.reader-topbar__back')
      expect(inlineRule).toBeInstanceOf(CSSStyleRule)
      expect(inlineRule!.style.getPropertyValue('display')).toBe('inline-flex')
      expect(inlineRule!.style.getPropertyValue('align-items')).toBe('center')

      for (const selector of standaloneTargets) {
        const rule = exactRule(finalStyleRules, selector)
        expect(rule, `${selector} has a shared inline-flex target`).toBeInstanceOf(CSSStyleRule)
        if (!rule) throw new Error(`Missing standalone selector: ${selector}`)
        expect(rule!.style.getPropertyValue('display')).toBe('inline-flex')
        expect(rule!.style.getPropertyValue('align-items')).toBe('center')
        expect(declarations(rules, selector).get('min-inline-size')).toBe('var(--control-min-h)')
        expect(declarations(rules, selector).get('min-block-size')).toBe('var(--control-min-h)')
      }

      expect(declarations(rules, ':root').get('--control-min-h')).toBe('2.75rem')

      const readerBack = declarations(rules, '.reader-topbar__back')
      expect(readerBack.get('flex-shrink')).toBe('0')
      expect(readerBack.get('justify-content')).toBe('center')
    })
  })

  it('gives appearance labels the same target while keeping their compact visual segment', () => {
    withRules((rules) => {
      const appearance = declarations(rules, '.appearance-control__option')
      expect(appearance.get('min-inline-size')).toBe('var(--control-min-h)')
      expect(appearance.get('min-block-size')).toBe('var(--control-min-h)')
      expect(appearance.get('display')).toBe('grid')
      expect(appearance.get('align-items')).toBe('center')

      const label = declarations(rules, '.appearance-control__label')
      expect(label.get('display')).toBe('inline-block')
    })
  })

  it('keeps the Reader target stable across media rules and scopes selectors away from prose', () => {
    withRules((rules, finalStyleRules) => {
      const mediaReaderRules = nestedMediaRules(rules)
        .filter((rule) => selectors(rule).includes('.reader-topbar__back'))
      for (const rule of mediaReaderRules) {
        expect(rule.style.getPropertyValue('min-inline-size')).toBe('')
        expect(rule.style.getPropertyValue('min-block-size')).toBe('')
        expect(rule.style.getPropertyValue('min-width')).toBe('')
        expect(rule.style.getPropertyValue('min-height')).toBe('')
        expect(rule.style.getPropertyValue('flex-shrink')).not.toBe('1')
      }

      const standaloneRules = finalStyleRules.filter(
        (rule) => rule instanceof CSSStyleRule,
      ) as CSSStyleRule[]
      expect(standaloneRules.length).toBeGreaterThan(0)
      for (const rule of standaloneRules) {
        for (const selector of selectors(rule)) {
          expect(selector).not.toMatch(/^(?:p|a)(?:$|[\s>+~.#:[,])/)
        }
      }
    })
  })

  it('keeps the footer legal rows compact while each wrapped link retains its target', () => {
    withRules((rules) => {
      expect(declarations(rules, '.site-footer__legal-list').get('row-gap')).toBe('var(--space-1)')
      expect(declarations(rules, '.site-footer__legal-list a').get('min-inline-size'))
        .toBe('var(--control-min-h)')
      expect(declarations(rules, '.site-footer__legal-list a').get('min-block-size'))
        .toBe('var(--control-min-h)')
    })
  })

  it('keeps the stacked Read summary from covering the title target', () => {
    withRules((_rules, finalStyleRules) => {
      const narrow = finalStyleRules.find((rule) => rule instanceof CSSMediaRule
        && rule.conditionText === '(max-width: 52rem)') as CSSMediaRule
      expect(narrow).toBeInstanceOf(CSSMediaRule)
      expect(declarations(Array.from(narrow.cssRules), '.reading-card > p').get('margin-block-start'))
        .toMatch(/^0(?:px)?$/)
    })
  })
})

describe('Reader topbar back target', () => {
  it('keeps its accessible name and destination, hides decoration, and removes hidden controls from interaction', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ReaderTopBar
          book={sampleBook}
          chapter={sampleBook.chapters[0]}
          tocOpen={false}
          hidden={false}
          onToggleToc={() => {}}
          onOpenSettings={() => {}}
        />
      </MemoryRouter>,
    )

    const back = screen.getByRole('link', { name: '書籍へ戻る' })
    expect(back).toHaveAttribute('href', '/books/keigo-essentials')
    expect(back.querySelector('.reader-topbar__back-text')).not.toHaveAttribute('aria-hidden', 'true')
    expect(back.querySelector('.reader-topbar__back-mark')).toHaveAttribute('aria-hidden', 'true')

    rerender(
      <MemoryRouter>
        <ReaderTopBar
          book={sampleBook}
          chapter={sampleBook.chapters[0]}
          tocOpen={false}
          hidden
          onToggleToc={() => {}}
          onOpenSettings={() => {}}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('banner')).toHaveAttribute('inert')
  })
})
