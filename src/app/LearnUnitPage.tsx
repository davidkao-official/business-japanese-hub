import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export const COURSE_CORRECTION_SLUG = 'meeting-course-correction'

/**
 * The first reusable Learn presentation surface. Its route is deliberately
 * slug-based so future units can use the same bounded page seam without
 * coupling Learn to the Book / Reader content model.
 */
export function LearnUnitPage() {
  useDocumentTitle('議論を本筋に戻す — Learn')

  return (
    <section className="page learning-unit-page" aria-labelledby="learning-unit-title">
      <div className="learning-unit-page__intro">
        <p className="product-mode-page__eyebrow" lang="en">
          Course Correction · Learn
        </p>
        <h1 className="page__title" id="learning-unit-title" lang="ja">
          議論を本筋に戻す
        </h1>
        <p className="page__lead">
          會議討論偏離主題時，先承接對方的意見，再把大家帶回可以做判斷與決定的主線。
        </p>
      </div>

      <p className="learning-unit-page__sequence" lang="zh-TW">
        承接 → Pivot → 收斂
      </p>

      <ol className="learning-unit-flow" aria-label="Learn unit steps">
        <li>
          <span className="learning-unit-flow__number" aria-hidden="true">01</span>
          <div>
            <h2 lang="zh-TW">承接</h2>
            <p>先讓對方的關切被聽見，明確指出你接住的是哪個觀點。</p>
          </div>
        </li>
        <li>
          <span className="learning-unit-flow__number" aria-hidden="true">02</span>
          <div>
            <h2 lang="en">Pivot</h2>
            <p>使用「その点を踏まえて」等緩衝表達，把注意力轉回本次會議的目的。</p>
          </div>
        </li>
        <li>
          <span className="learning-unit-flow__number" aria-hidden="true">03</span>
          <div>
            <h2 lang="zh-TW">收斂</h2>
            <p>確認下一個要決定的問題、負責人與時限，讓討論留下可執行的出口。</p>
          </div>
        </li>
      </ol>

      <section className="learning-unit-page__note" aria-labelledby="learning-unit-note-title">
        <p className="learning-unit-page__label" lang="en">Transfer to work</p>
        <h2 id="learning-unit-note-title">把語言選擇連回職場判斷</h2>
        <p>
          Course correction 的重點不是打斷別人，而是保留關係、重新標定議題，並讓團隊知道現在要收斂到哪個決定。
        </p>
      </section>

      <div className="learning-unit-page__actions">
        <Link className="btn btn--primary" to={`/practice/${COURSE_CORRECTION_SLUG}`}>
          前往 Practice：練習改寫
        </Link>
        <Link className="btn btn--secondary" to="/learn">
          返回 Learn
        </Link>
      </div>
    </section>
  )
}
