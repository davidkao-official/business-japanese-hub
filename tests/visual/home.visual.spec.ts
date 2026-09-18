import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const WIDTHS = [375, 768, 1100, 1440] as const
const THEMES = ['light', 'dark'] as const
const BASELINE_URL =
  process.env.VISUAL_BASELINE_URL ?? 'https://business-japanese-hub.pages.dev/'
const CANDIDATE_URL = process.env.VISUAL_CANDIDATE_URL ?? 'http://127.0.0.1:4173/'
const ARTIFACT_ROOT = 'artifacts/visual-qa'
const THEME_STORAGE_KEY = 'business-japanese-hub.appearance'

async function applyTheme(page: Page, url: string, theme: (typeof THEMES)[number]) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: THEME_STORAGE_KEY, value: theme },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('main').waitFor({ state: 'visible' })
  await page.evaluate(async () => {
    if ('fonts' in document) await document.fonts.ready
  })
}

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))

  expect(
    Math.max(metrics.html, metrics.body),
    `horizontal overflow: viewport=${metrics.viewport}, html=${metrics.html}, body=${metrics.body}`,
  ).toBeLessThanOrEqual(metrics.viewport + 1)
}

async function assertNowrapContract(page: Page) {
  const violations = await page.locator('body').evaluate(() => {
    const selector = 'button, .btn, nav a, .tag, .badge, [data-nowrap]'
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector))

    return elements.flatMap((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        style.display === 'none' ||
        style.visibility === 'hidden'
      ) {
        return []
      }

      const lineHeight = Number.parseFloat(style.lineHeight)
      const paddingBlock =
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      const borderBlock =
        Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
      const contentHeight = rect.height - paddingBlock - borderBlock

      const range = document.createRange()
      range.selectNodeContents(element)
      const lineTops = new Set(
        Array.from(range.getClientRects())
          .filter((line) => line.width > 0 && line.height > 0)
          .map((line) => Math.round(line.top * 10) / 10),
      )

      const wrapsByHeight =
        Number.isFinite(lineHeight) && lineHeight > 0
          ? contentHeight > lineHeight + 2
          : false
      const wrapsByRects = lineTops.size > 1
      const wrongWhiteSpace = style.whiteSpace !== 'nowrap'

      if (!wrapsByHeight && !wrapsByRects && !wrongWhiteSpace) return []

      return [
        {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          text: element.textContent?.trim().replaceAll(/\s+/g, ' ').slice(0, 120) ?? '',
          whiteSpace: style.whiteSpace,
          contentHeight,
          lineHeight,
          lineCount: lineTops.size,
        },
      ]
    })
  })

  expect(violations, `nowrap violations:\n${JSON.stringify(violations, null, 2)}`).toEqual([])
}

async function assertPhraseContract(page: Page) {
  const violations = await page.locator('body').evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLElement>('.phrase')).flatMap((element) => {
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return []

      const range = document.createRange()
      range.selectNodeContents(element)
      const lineTops = new Set(
        Array.from(range.getClientRects())
          .filter((line) => line.width > 0 && line.height > 0)
          .map((line) => Math.round(line.top * 10) / 10),
      )
      const whiteSpace = getComputedStyle(element).whiteSpace

      if (lineTops.size <= 1 && whiteSpace === 'nowrap') return []
      return [
        {
          text: element.textContent,
          lineCount: lineTops.size,
          whiteSpace,
        },
      ]
    })
  })

  expect(violations, `phrase violations:\n${JSON.stringify(violations, null, 2)}`).toEqual([])
}

test.beforeAll(async () => {
  await mkdir(`${ARTIFACT_ROOT}/before`, { recursive: true })
  await mkdir(`${ARTIFACT_ROOT}/after`, { recursive: true })
})

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`homepage visual QA — ${width}px / ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme: theme,
      })
      const page = await context.newPage()

      await applyTheme(page, BASELINE_URL, theme)
      await page.screenshot({
        path: `${ARTIFACT_ROOT}/before/home-${width}-${theme}.png`,
        fullPage: true,
      })

      await applyTheme(page, CANDIDATE_URL, theme)
      await assertNoHorizontalOverflow(page)
      await assertNowrapContract(page)
      await assertPhraseContract(page)
      await page.screenshot({
        path: `${ARTIFACT_ROOT}/after/home-${width}-${theme}.png`,
        fullPage: true,
      })

      await context.close()
    })
  }
}

test('styleguide exercises longest Japanese UI strings at 375px', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 900 },
    colorScheme: 'light',
  })
  const page = await context.newPage()

  await applyTheme(page, `${CANDIDATE_URL.replace(/\/$/, '')}/styleguide`, 'light')
  await assertNoHorizontalOverflow(page)
  await assertNowrapContract(page)
  await assertPhraseContract(page)

  await context.close()
})
