import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import catalogDocument from '../practice-web-test/released-discovery-catalog.json'
import {
  findPracticeDiscoveryCategory,
  findPracticeDiscoveryDomain,
  findPracticeDiscoveryFamily,
  practiceDiscoveryCategoryLabel,
  practiceDiscoveryFamilyLabel,
  validatePracticeDiscoveryCatalog,
  type PracticeDiscoveryCategory,
  type PracticeDiscoveryDomain,
  type PracticeDiscoveryFamily,
  type PracticeDiscoveryMode,
} from '../practice-web-test/discoveryCatalog'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { NotFoundPage } from './NotFoundPage'

const catalog = validatePracticeDiscoveryCatalog(catalogDocument) ? catalogDocument : null

const DOMAIN_LABELS: Record<PracticeDiscoveryDomain['domain'], string> = {
  verbal: '言語',
  nonverbal: '非言語',
}

const MODE_LABELS: Record<PracticeDiscoveryMode, string> = {
  'untimed-learning': '不計時學習',
  'timed-practice': '計時練習',
}

const WEB_TEST_DESCRIPTION = '獨立的日本求職 Web Test 練習入口，協助華語學習者準備 SPI 等選考中的日文閱讀與推理能力。'

function labelForFamily(testFamily: string): string {
  return catalog ? practiceDiscoveryFamilyLabel(catalog.releaseIdentity.contentId, testFamily) ?? '' : ''
}

function labelForCategory(
  testFamily: string,
  domain: PracticeDiscoveryDomain['domain'],
  category: PracticeDiscoveryCategory,
): string {
  return catalog
    ? practiceDiscoveryCategoryLabel(catalog.releaseIdentity.contentId, testFamily, domain, category.category) ?? ''
    : ''
}

function titleFor(...parts: string[]): string {
  return `${parts.join('｜')} — Business Japanese Hub`
}

function CatalogUnavailable() {
  return <NotFoundPage />
}

/** Keeps the Web Test route description scoped to its mounted route lifetime. */
function useWebTestDescription(): void {
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const description = existing ?? document.createElement('meta')
    const created = existing === null
    if (created) {
      description.name = 'description'
      document.head.append(description)
    }
    const previous = description.content
    description.content = WEB_TEST_DESCRIPTION
    return () => {
      if (created) description.remove()
      else description.content = previous
    }
  }, [])
}

export function WebTestHubPage() {
  useDocumentTitle('日本求職網路測驗刷題 — Business Japanese Hub')
  useWebTestDescription()
  if (!catalog) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang="zh-TW" aria-labelledby="web-test-hub-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang="en">Practice · Web Test</p>
        <h1 className="page__title" id="web-test-hub-title">日本求職網路測驗刷題</h1>
        <p className="page__lead">
          從 SPI 開始，透過日文題幹與解法練習日本求職選考中常見的閱讀與推理能力。
        </p>
      </div>

      <section className="web-test-hub__families" aria-labelledby="web-test-family-title">
        <h2 id="web-test-family-title">選擇測驗類型</h2>
        <ul>
          {catalog.families.map((family) => (
            <li key={family.testFamily}>
              <Link className="web-test-hub__family-link" to={`/practice/web-test/${family.testFamily}`}>
                <span className="web-test-hub__family-title">{labelForFamily(family.testFamily)}</span>
                <span>{releasedCount(family)} 題已發布</span>
                <span>選擇言語或非言語類別</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="web-test-hub__disclaimer">
        本服務為獨立的日本求職 Web Test 練習入口，與 SPI、玉手箱及任何出題或測驗機構無隸屬關係，亦不提供官方題目。
      </p>
    </section>
  )
}

export function WebTestFamilyPage() {
  const { family: familyParam } = useParams()
  const family = catalog && findPracticeDiscoveryFamily(catalog, familyParam)
  useDocumentTitle(family ? titleFor(labelForFamily(family.testFamily), '日本求職網路測驗刷題') : '頁面不存在')
  if (!catalog || !family) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang="zh-TW" aria-labelledby="web-test-family-page-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang="en">Practice · {labelForFamily(family.testFamily)}</p>
        <h1 className="page__title" id="web-test-family-page-title">{labelForFamily(family.testFamily)}</h1>
        <p className="page__lead">先選擇要練習的能力範圍。</p>
      </div>
      <section className="web-test-hub__families" aria-labelledby="web-test-domain-title">
        <h2 id="web-test-domain-title">選擇領域</h2>
        <ul>
          {family.domains.map((domain) => (
            <li key={domain.domain}>
              <Link className="web-test-hub__family-link" to={`/practice/web-test/${family.testFamily}/${domain.domain}`}>
                <span className="web-test-hub__family-title">{DOMAIN_LABELS[domain.domain]}</span>
                <span>{releasedCount(domain)} 題已發布</span>
                <span>查看已發布類別</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <Link className="page__action" to="/practice/web-test">返回測驗類型</Link>
    </section>
  )
}

export function WebTestCategoryPage() {
  const { family: familyParam, domain: domainParam } = useParams()
  const family = catalog && findPracticeDiscoveryFamily(catalog, familyParam)
  const domain = catalog && findPracticeDiscoveryDomain(catalog, familyParam, domainParam)
  useDocumentTitle(
    family && domain
      ? titleFor(DOMAIN_LABELS[domain.domain], labelForFamily(family.testFamily), '日本求職網路測驗刷題')
      : '頁面不存在',
  )
  if (!catalog || !family || !domain) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang="zh-TW" aria-labelledby="web-test-category-page-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang="en">Practice · {labelForFamily(family.testFamily)} · {DOMAIN_LABELS[domain.domain]}</p>
        <h1 className="page__title" id="web-test-category-page-title">{DOMAIN_LABELS[domain.domain]}</h1>
        <p className="page__lead">選擇想先練習的類別。</p>
      </div>
      <section className="web-test-hub__families" aria-labelledby="web-test-category-title">
        <h2 id="web-test-category-title">選擇類別</h2>
        <ul>
          {domain.categories.map((category) => (
            <li className="web-test-hub__category" key={category.category}>
              <h3>{labelForCategory(family.testFamily, domain.domain, category)}</h3>
              <p>{category.releasedCount} 題已發布</p>
              <ul className="web-test-hub__mode-list">
                {category.modes.map((mode) => (
                  <li key={mode}>
                    <Link to={runnerEntryHref(family.testFamily, domain.domain, category.category, mode)}>
                      {MODE_LABELS[mode]}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <Link className="page__action" to={`/practice/web-test/${family.testFamily}`}>返回領域</Link>
    </section>
  )
}

/**
 * Stable direct-load handoff for #116. It names a released selection but does
 * not fetch, render, or infer access to proprietary question content.
 */
export function WebTestRunnerEntryPage() {
  const { family: familyParam, domain: domainParam, category: categoryParam } = useParams()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')
  const validSearch = [...searchParams.keys()].length === 1 && searchParams.has('mode')
  const family = catalog && findPracticeDiscoveryFamily(catalog, familyParam)
  const domain = catalog && findPracticeDiscoveryDomain(catalog, familyParam, domainParam)
  const category = catalog && findPracticeDiscoveryCategory(catalog, familyParam, domainParam, categoryParam)
  const validMode = typeof mode === 'string' && category?.modes.includes(mode as PracticeDiscoveryMode)
  useDocumentTitle(
    family && domain && category && validSearch && validMode
      ? titleFor(labelForCategory(family.testFamily, domain.domain, category), DOMAIN_LABELS[domain.domain], labelForFamily(family.testFamily))
      : '頁面不存在',
  )
  if (!catalog || !family || !domain || !category || !validSearch || !validMode) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang="zh-TW" aria-labelledby="web-test-runner-entry-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang="en">Practice · {labelForFamily(family.testFamily)} · {DOMAIN_LABELS[domain.domain]}</p>
        <h1 className="page__title" id="web-test-runner-entry-title">{labelForCategory(family.testFamily, domain.domain, category)}</h1>
        <p className="page__lead">{MODE_LABELS[mode as PracticeDiscoveryMode]} · {category.releasedCount} 題已發布</p>
      </div>
      <section className="web-test-hub__runner-handoff" aria-labelledby="web-test-runner-handoff-title">
        <h2 id="web-test-runner-handoff-title">練習準備中</h2>
        <p>這個類別的練習尚未開放。你可以先瀏覽其他類別，稍後再回來練習。</p>
      </section>
      <Link className="page__action" to={`/practice/web-test/${family.testFamily}/${domain.domain}`}>返回類別</Link>
    </section>
  )
}

function releasedCount(source: PracticeDiscoveryFamily | PracticeDiscoveryDomain): number {
  if ('testFamily' in source) return source.domains.reduce((total, domain) => total + releasedCount(domain), 0)
  return source.categories.reduce((total, category) => total + category.releasedCount, 0)
}

function runnerEntryHref(
  family: string,
  domain: PracticeDiscoveryDomain['domain'],
  category: string,
  mode: PracticeDiscoveryMode,
): string {
  return `/practice/web-test/${family}/${domain}/${category}?mode=${encodeURIComponent(mode)}`
}
