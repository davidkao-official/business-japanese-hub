import { Link, useParams } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { NotFoundPage } from './NotFoundPage'
import { getLearningUnit } from './learningUnits'

/**
 * A generic Practice destination for the course-correction activity family.
 * This is a presentation surface only; persistence and attempt semantics
 * remain outside this bounded issue.
 */
export function PracticeActivityPage() {
  const { slug } = useParams()
  const learningUnit = getLearningUnit(slug)
  const strings = useStrings()
  useDocumentTitle(learningUnit ? `${learningUnit.courseLabel} Practice` : strings.notFound.title)

  if (!learningUnit) return <NotFoundPage />

  return (
    <section className="page practice-activity-page" aria-labelledby="practice-activity-title">
      <div className="practice-activity-page__intro">
        <p className="product-mode-page__eyebrow" lang="en">
          Practice · Course Correction
        </p>
        <h1 className="page__title" id="practice-activity-title" lang="ja">
          議論を本筋に戻す：Practice
        </h1>
        <p className="page__lead">
          在可重複的 situational 練習中，判斷哪一句話能承接對方、轉回主線，並完成收斂。
        </p>
      </div>

      <div className="practice-activity-grid">
        <section className="practice-activity-card" aria-labelledby="practice-situation-title">
          <p className="practice-activity-card__label" lang="en">Situational</p>
          <h2 id="practice-situation-title">場面：討論開始發散</h2>
          <p>
            會議成員提出了重要但不屬於本次議題的問題。先辨識誰在意什麼，再決定如何保留這個關切。
          </p>
        </section>

        <section className="practice-activity-card" aria-labelledby="practice-rewrite-title">
          <p className="practice-activity-card__label" lang="en">Rewrite</p>
          <h2 id="practice-rewrite-title">書き換え：調整語氣與焦點</h2>
          <p>
            將直接的「それは今回の議題ではありません」改寫成能承接、pivot，再提出下一步的職場表達。
          </p>
        </section>

        <section className="practice-activity-card" aria-labelledby="practice-authority-title">
          <p className="practice-activity-card__label" lang="en">Authority &amp; context</p>
          <h2 id="practice-authority-title">立場與上下關係</h2>
          <p>
            依照對方是主管、同儕或跨部門夥伴，調整 cushion、直接程度與請對方做決定的方式。
          </p>
        </section>
      </div>

      <div className="practice-activity-page__actions">
        <Link className="btn btn--secondary" to={`/learn/${learningUnit.slug}`}>
          回到 Learn unit
        </Link>
      </div>
    </section>
  )
}
