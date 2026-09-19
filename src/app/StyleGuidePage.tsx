import type { ReactNode } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function StyleGuidePage() {
  useDocumentTitle('スタイルガイド')

  return (
    <section className="page styleguide-page" aria-labelledby="styleguide-title">
      <header className="styleguide-page__intro">
        <p className="styleguide-page__eyebrow">VISUAL QA</p>
        <h1 className="page__title" id="styleguide-title">
          日本語 UI スタイルガイド
        </h1>
        <p className="page__lead">
          共通コンポーネントを、実運用で想定される長めの日本語文字列で確認するための QA ページです。
        </p>
      </header>

      <div className="styleguide-grid">
        <StyleGuideExample title="Button">
          <button className="btn btn--primary" data-nowrap type="button">
            無料の学習を始める
          </button>
        </StyleGuideExample>

        <StyleGuideExample title="Navigation">
          <nav aria-label="スタイルガイド用ナビゲーション">
            <a className="site-nav__link" data-nowrap href="#navigation-sample">
              マイライブラリ
            </a>
          </nav>
        </StyleGuideExample>

        <StyleGuideExample title="Badge">
          <span className="badge styleguide-badge" data-nowrap>
            Early Access メンバー
          </span>
        </StyleGuideExample>

        <StyleGuideExample title="Tag">
          <span className="tag styleguide-tag" data-nowrap>
            日本企業の公開資料
          </span>
        </StyleGuideExample>

        <StyleGuideExample title="Hero title" wide>
          <h2 className="styleguide-hero-title" aria-label="ビジネス日本語ハブ">
            <span className="phrase" aria-hidden="true">ビジネス</span>
            <span className="phrase" aria-hidden="true">日本語</span>
            <span className="phrase" aria-hidden="true">ハブ</span>
          </h2>
        </StyleGuideExample>

        <StyleGuideExample title="Section title" wide>
          <h2 className="styleguide-section-title">日本企業の資料を文脈から読み解く</h2>
        </StyleGuideExample>
      </div>
    </section>
  )
}

function StyleGuideExample({
  title,
  wide = false,
  children,
}: {
  title: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <section className={`styleguide-example${wide ? ' styleguide-example--wide' : ''}`}>
      <p className="styleguide-example__label">{title}</p>
      <div className="styleguide-example__surface">{children}</div>
    </section>
  )
}
