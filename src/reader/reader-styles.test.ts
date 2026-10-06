/** Reader and app typography are checked against Vite's emitted production CSS. */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'

const readerCss = readFileSync(join(process.cwd(), 'src/styles/reader.css'), 'utf8')
const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')
let appCascade = ''
let appCssPath = ''
let outDir = ''

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'bjh-reader-css-'))
  await build({
    configFile: join(process.cwd(), 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, minify: false },
  })
  const cssFiles = readdirSync(join(outDir, 'assets')).filter((file) => file.endsWith('.css'))
  if (cssFiles.length !== 1) throw new Error(`Expected one emitted app stylesheet, got ${cssFiles.length}`)
  appCssPath = join(outDir, 'assets', cssFiles[0])
  appCascade = readFileSync(appCssPath, 'utf8')
}, 30_000)

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

function themeRoleValue(role: string, appTheme: string) {
  const dark = appTheme === 'dark'
  const themeBlock = dark
    ? tokensCss.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)?.[1]
    : undefined
  const declarations = [tokensCss.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '', themeBlock ?? '']
  const property = `--${role}`
  let value: string | undefined
  for (const declaration of declarations) {
    const match = declaration.match(new RegExp(`${property}:\\s*([^;]+);`))
    if (match) value = match[1].trim()
  }
  if (!value || !/^#[\da-f]{6}$/i.test(value)) throw new Error(`Could not resolve ${property} for ${appTheme}`)
  return value
}

function relativeLuminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16) / 255)
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(foreground: string, background: string) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

function installAppCascade() {
  const style = document.createElement('style')
  style.textContent = appCascade
  document.head.append(style)
  return style
}

describe('Reader/app theme cascade (B1)', () => {
  it('checks the stylesheet Vite actually emits for production', () => {
    expect(appCssPath).toContain('/assets/')
    expect(appCascade).toContain('.reader-shell')
    expect(appCascade).toContain('.reader-topbar')
    expect(appCascade).toContain(':root[data-reader-theme=\'dark\']')
  })

  for (const appTheme of ['system', 'light', 'dark']) {
    for (const readerTheme of ['light', 'sepia', 'dark']) {
      it(`keeps app chrome and Reader paper independent for ${appTheme} app / ${readerTheme} Reader`, () => {
        const style = installAppCascade()
        const root = document.documentElement
        root.lang = 'ja'
        const previousTheme = root.getAttribute('data-theme')
        const previousReaderTheme = root.getAttribute('data-reader-theme')
        const fixture = document.createElement('div')
        fixture.innerHTML = `<main class="reader-shell">
          <h1 class="reader-chapter-header__title">章の見出し</h1>
          <div class="reader-blocks"><h2 class="reader-heading">節</h2></div>
          <div class="reader-main">本文</div>
          <div class="reader-topbar">Reader tools</div>
          <div class="reader-dialog"><section class="reader-dialog__panel">
            <header class="reader-dialog__header"><h2 class="reader-dialog__title">読書設定</h2></header>
            <div class="reader-dialog__body"><span class="reader-settings__label">文字サイズ</span>
              <button class="reader-settings__option">標準</button>
              <nav class="reader-toc"><a class="reader-toc__link"><span class="reader-toc__order">01</span>章</a>
                <a class="reader-toc__link reader-toc__link--current">現在の章</a>
                <a class="reader-toc__section-link">節</a></nav>
              <div class="reader-vocab-detail"><span class="reader-vocab-detail__reading">よみ</span>
                <span class="reader-vocab-detail__pos">名詞</span></div>
            </div>
          </section></div>
          <button class="reader-exercise__toggle">解答を見る</button>
        </main>`
        document.body.append(fixture)
        if (appTheme === 'system') root.removeAttribute('data-theme')
        else root.setAttribute('data-theme', appTheme)
        root.setAttribute('data-reader-theme', readerTheme)
        try {
          const appChrome = getComputedStyle(root).getPropertyValue('--role-surface-chrome').trim()
          const appInk = getComputedStyle(root).getPropertyValue('--role-text-primary').trim()
          const readerPaper = getComputedStyle(root).getPropertyValue('--reader-bg').trim()
          const readerBodyInk = getComputedStyle(root).getPropertyValue('--reader-text').trim()
          const readerChromeSurface = getComputedStyle(root).getPropertyValue('--reader-surface').trim()
          const expectedAppChrome = appTheme === 'dark' ? '#17181f' : '#f8f8fc'
          const expectedAppInk = appTheme === 'dark' ? '#ececf3' : '#252735'
          const expectedPaper = {
            light: 'var(--reader-light-bg)',
            sepia: 'var(--reader-sepia-bg)',
            dark: 'var(--reader-dark-bg)',
          }[readerTheme]

          // These values catch the prior cascade defect: Reader selection may
          // change its paper and readable body ink, but cannot re-skin app roles.
          expect(appChrome).toBe(expectedAppChrome)
          expect(appInk).toBe(expectedAppInk)
          expect(readerPaper).toBe(expectedPaper)
          expect(readerBodyInk).toBe({
            light: 'var(--reader-light-text)',
            sepia: 'var(--reader-sepia-text)',
            dark: 'var(--reader-dark-text)',
          }[readerTheme])
          expect(readerChromeSurface).toBe('var(--role-surface-content)')
          // jsdom does not compute modern var() declarations on regular CSS
          // properties; pin the production selectors alongside the computed
          // custom-property cascade above.
          expect(readerCss).toMatch(/\.reader-topbar\s*\{[^}]*background:\s*var\(--role-surface-chrome\)/s)
          expect(readerCss).toMatch(/\.reader-heading,[\s\S]*?\{\s*color:\s*var\(--reader-text\)/)
          expect(readerCss).toMatch(/\.reader-dialog__panel\s*\{[^}]*background:\s*var\(--role-surface-content\)[^}]*color:\s*var\(--role-text-primary\)/s)
          expect(readerCss).toMatch(/\.reader-dialog__header\s*\{[^}]*border-bottom:[^;]*var\(--role-border-subtle\)/s)
          expect(readerCss).toMatch(/\.reader-dialog__title\s*\{\s*color:\s*var\(--role-text-primary\)/)
          expect(readerCss).toMatch(/\.reader-settings__label\s*\{[^}]*color:\s*var\(--role-text-primary\)/s)
          expect(readerCss).toMatch(/\.reader-settings__option\s*\{[^}]*background:\s*var\(--role-surface-content\)[^}]*color:\s*var\(--role-text-primary\)/s)
          expect(readerCss).toMatch(/\.reader-settings__option--active\s*\{[^}]*background:\s*var\(--role-action-primary-background\)[^}]*color:\s*var\(--role-action-primary-foreground\)/s)
          expect(readerCss).toMatch(/\.reader-dialog__panel\s*\{[^}]*--reader-text:\s*var\(--role-text-primary\)/s)
          expect(readerCss).toMatch(/\.reader-dialog__panel\s*\{[^}]*--reader-muted:\s*var\(--role-text-secondary\)/s)
          expect(readerCss).toMatch(/\.reader-dialog__panel\s*\{[^}]*--reader-surface:\s*var\(--role-surface-content\)/s)
          expect(readerCss).toMatch(/\.reader-dialog__panel\s*\{[^}]*--reader-accent-soft:\s*var\(--role-accent-background\)/s)
          expect(readerCss).toMatch(/\.reader-dialog__panel\s*\{[^}]*--reader-accent-ink:\s*var\(--role-accent-foreground\)/s)
          expect(readerCss).toMatch(/\.reader-toc__link--current\s*\{[^}]*background:\s*var\(--reader-accent-soft\)[^}]*color:\s*var\(--reader-accent-ink\)/s)
          const accentForeground = themeRoleValue('role-accent-foreground', appTheme)
          const accentBackground = themeRoleValue('role-accent-background', appTheme)
          expect(contrastRatio(accentForeground, accentBackground)).toBeGreaterThanOrEqual(4.5)
          expect(readerCss).toMatch(/\.reader-toc__link\s*\{[^}]*color:\s*var\(--reader-text\)/s)
          expect(readerCss).toMatch(/\.reader-toc__order\s*\{[^}]*color:\s*var\(--reader-muted\)/s)
          expect(readerCss).toMatch(/\.reader-toc__section-link\s*\{[^}]*color:\s*var\(--reader-muted\)/s)
          expect(readerCss).toMatch(/\.reader-vocab-detail__reading\s*\{[^}]*color:\s*var\(--reader-muted\)/s)
          expect(readerCss).toMatch(/\.reader-vocab-detail__pos\s*\{[^}]*color:\s*var\(--reader-muted\)/s)
          expect(readerCss).toMatch(/\.reader-exercise__toggle\s*\{[^}]*background:\s*var\(--role-surface-content\)[^}]*color:\s*var\(--role-text-primary\)/s)
          const editorial = readFileSync(join(process.cwd(), 'src/styles/editorial-v2.css'), 'utf8')
          expect(editorial).toMatch(/\.reader-topbar__book\s*\{\s*font-family:\s*var\(--font-ja\)/)
        } finally {
          fixture.remove()
          style.remove()
          if (previousTheme === null) root.removeAttribute('data-theme')
          else root.setAttribute('data-theme', previousTheme)
          if (previousReaderTheme === null) root.removeAttribute('data-reader-theme')
          else root.setAttribute('data-reader-theme', previousReaderTheme)
        }
      })
    }
  }
})

describe('Reader design contract', () => {
  it('preserves Japanese material and lets explicit language descendants select their own stacks', () => {
    const style = installAppCascade()
    const root = document.documentElement
    root.lang = 'ja'
    const fixture = document.createElement('div')
    fixture.innerHTML = `<main class="material"><p>原文 <em>強調</em></p>
        <span lang="en" class="material-english">English <span lang="zh-TW" class="material-traditional">繁體中文 <span lang="ja" class="material-japanese-return">日本語 <span lang="zh-CN" class="material-simplified">简体中文 <span lang="ko" class="material-korean">한국어</span></span></span></span></span>
      </main>
      <span lang="en" class="english-ui">English <span lang="zh-TW" class="traditional-ui">漢字 <span lang="ja" class="japanese-ui">日本語</span></span></span>
      <section class="reader-shell" data-reader-font="serif"><article class="reader-main"><p>文章 <em lang="en">English</em></p></article></section>
      <section class="reader-shell" data-reader-font="sans"><article class="reader-main"><p>文章 <em lang="en">English</em></p></article></section>`
    document.body.append(fixture)
    try {
      const material = fixture.querySelector('.material')!
      expect(getComputedStyle(material).fontFamily).toBe('var(--font-material)')
      expect(getComputedStyle(material.querySelector('em')!).fontFamily)
        .toBe(getComputedStyle(material).fontFamily)
      expect(getComputedStyle(fixture.querySelector('.material-english')!).fontFamily).toBe('var(--font-en)')
      expect(getComputedStyle(fixture.querySelector('.material-traditional')!).fontFamily).toBe('var(--font-zh-hant)')
      expect(getComputedStyle(fixture.querySelector('.material-japanese-return')!).fontFamily).toBe('var(--font-material)')
      expect(getComputedStyle(fixture.querySelector('.material-simplified')!).fontFamily).toBe('var(--font-zh-hans)')
      expect(getComputedStyle(fixture.querySelector('.material-korean')!).fontFamily).toBe('var(--font-ko)')

      expect(getComputedStyle(fixture.querySelector('.english-ui')!).fontFamily).toBe('var(--font-en)')
      expect(getComputedStyle(fixture.querySelector('.traditional-ui')!).fontFamily)
        .toBe('var(--font-zh-hant)')
      expect(getComputedStyle(fixture.querySelector('.japanese-ui')!).fontFamily).toBe('var(--font-ja)')

      const serifReader = fixture.querySelector('[data-reader-font="serif"] .reader-main')!
      const sansReader = fixture.querySelector('[data-reader-font="sans"] .reader-main')!
      expect(getComputedStyle(serifReader.querySelector('em')!).fontFamily).toBe('var(--font-en)')
      expect(getComputedStyle(sansReader.querySelector('em')!).fontFamily).toBe('var(--font-en)')
      expect(getComputedStyle(serifReader).fontFamily).not.toBe(getComputedStyle(sansReader).fontFamily)
      expect(getComputedStyle(serifReader).fontFamily).toBe('var(--font-reader-serif)')
      expect(getComputedStyle(sansReader).fontFamily).toBe('var(--font-reader-sans)')
      expect(tokensCss).toMatch(/\.material:lang\(ja\),\s*\.material :lang\(ja\)\s*\{[^}]*font-family:\s*var\(--font-material\)[^}]*line-height:\s*var\(--leading-material\)/s)
      expect(tokensCss).not.toMatch(/\.material\s*\*\s*\{\s*font-family:\s*inherit/)
      expect(appCascade).toMatch(/:where\(\[lang\]:lang\(en\)\)\s*\{[^}]*font-family:\s*var\(--font-en\)/s)
      expect(appCascade).not.toMatch(/(?:^|})\s*:lang\(en\)\s*\{[^}]*font-family:/s)
      expect(readerCss).not.toMatch(/\.reader-main\s*:lang\(/)
    } finally {
      fixture.remove()
      style.remove()
    }
  })

  it('keeps component type roles while explicit nested languages cross their boundaries', () => {
    const style = installAppCascade()
    const root = document.documentElement
    root.lang = 'ja'
    const fixture = document.createElement('div')
    fixture.innerHTML = `<h1 class="book-hero__title">本 <em lang="en">Book</em></h1>
      <h1 class="about-page__title">About <em lang="en">Story</em></h1>
      <main class="concept-c-home"><h1>Home <em lang="zh-TW">首頁</em></h1></main>
      <section class="plus-audience"><h2>Plus <em lang="ko">유료</em></h2></section>
      <h2 class="learning-modes__title">Learn <em lang="zh-CN">学习</em></h2>
      <section class="reader-shell" data-reader-font="serif"><header class="reader-chapter-header">
        <span class="reader-chapter-header__label">第1章</span></header><article class="reader-main">
        <p>本文 <em lang="en">English</em></p></article><aside class="reader-marginalia">
        <span class="reader-marginalia__title">語彙</span></aside></section>`
    document.body.append(fixture)
    try {
      const cases = [
        ['.book-hero__title', '.book-hero__title em', 'var(--font-serif)', 'var(--font-en)'],
        ['.about-page__title', '.about-page__title em', 'var(--font-serif)', 'var(--font-en)'],
        ['.concept-c-home', '.concept-c-home em', 'var(--font-sans)', 'var(--font-zh-hant)'],
        ['.plus-audience h2', '.plus-audience em', 'var(--font-serif)', 'var(--font-ko)'],
        ['.learning-modes__title', '.learning-modes__title em', 'var(--font-serif)', 'var(--font-zh-hans)'],
        ['.reader-main', '.reader-main em', 'var(--font-reader-serif)', 'var(--font-en)'],
      ] as const
      for (const [roleSelector, boundarySelector, roleFont, languageFont] of cases) {
        expect(getComputedStyle(fixture.querySelector(roleSelector)!).fontFamily).toBe(roleFont)
        expect(getComputedStyle(fixture.querySelector(boundarySelector)!).fontFamily).toBe(languageFont)
      }
      expect(getComputedStyle(fixture.querySelector('.reader-chapter-header__label')!).fontFamily)
        .toBe('var(--font-reader-sans)')
      expect(getComputedStyle(fixture.querySelector('.reader-marginalia')!).fontFamily)
        .toBe('var(--font-reader-serif)')
      // jsdom does not implement the full CSS cascade/specificity model for
      // every modern selector. This test checks computed declarations for the
      // fixture cases; the assertions above also pin the emitted production
      // selector form so an implementation that drops :where() fails here.
      expect(appCascade).toContain(':where([lang]:lang(zh-TW))')
      expect(appCascade).toContain(':where([lang]:lang(ko))')
    } finally {
      fixture.remove()
      style.remove()
    }
  })

  it('keeps the locked Reader typography baseline in the shared token file', () => {
    expect(tokensCss).toContain('--reader-body-mobile: 1.0625rem')
    expect(tokensCss).toContain('--reader-body-desktop: 1.125rem')
    expect(tokensCss).toContain('--reader-leading-mobile: 1.82')
    expect(tokensCss).toContain('--reader-leading-desktop: 1.8')
    expect(tokensCss).toContain('--reader-measure: 34em')
    expect(tokensCss).toContain('--reader-measure-max: 40rem')
    expect(tokensCss).toContain('--reader-gutter-mobile: 1.125rem')
  })

  it('keeps Reader palettes out of reader.css and editorial-v2.css', () => {
    expect(readerCss).not.toMatch(/--reader-(?:light|sepia|dark)-/)
    expect(readerCss).not.toMatch(/:root\[data-reader-theme=.*--reader-(?:bg|text|accent)/s)
    const editorial = readFileSync(join(process.cwd(), 'src/styles/editorial-v2.css'), 'utf8')
    expect(editorial).not.toMatch(/:root\[data-reader-theme=.*--reader-(?:bg|text|accent)/s)
  })

  it('keeps the Reader responsive geometry and avoids the §7 anti-patterns', () => {
    expect(readerCss).toContain('@media (min-width: 64rem)')
    expect(readerCss).toContain('@media (min-width: 80rem)')
    expect(readerCss).not.toMatch(/word-break:\s*break-all/)
    expect(readerCss).not.toMatch(/overflow-wrap:\s*break-all/)
    expect(readerCss).not.toContain('max-width: 1000px')
    expect(readerCss).not.toMatch(/letter-spacing:\s*(?!\s*normal\s*;)[^;]+;/)
  })
})
