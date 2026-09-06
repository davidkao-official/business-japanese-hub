import { useDocumentTitle } from '../lib/useDocumentTitle'
import {
  COFOUNDER_PROFILE,
  FOUNDER_PROFILE,
  type PublicProfile,
} from './storefrontProfiles'

const REAL_WORLD_EXAMPLES = [
  '日本企業的簡報與企劃書',
  '決算資料與統合報告書',
  '中期經營計畫',
  '商業新聞與產業報告',
  '日本社會人閱讀的書籍與雜誌',
  '公司裡真正使用的語彙',
  '會議、打合せ、簡報與討論',
  '敬語之外更加細微的語感',
] as const

const AUDIENCE_ITEMS = [
  '已通過 JLPT N2／N1，卻不知道下一步該學什麼的人',
  '準備到日本求職，希望突破日文面試瓶頸的人',
  '已經在日本企業工作，卻覺得跟不上會議與溝通的人',
  '日文文章大致看得懂，卻讀不懂企業資料與商業媒體的人',
  '想提升商業語彙、表達與議論能力的人',
  '希望不再只靠中文二手資訊，而能直接取得日本資訊的人',
] as const

/**
 * Public About page for the platform. The narrative is intentionally kept
 * here as editorial content rather than folded into the Book or membership
 * runtime; the platform owns the presentation and the approved story owns
 * the copy.
 */
export function AboutPage() {
  useDocumentTitle('關於 Business Japanese Hub — ビジネス日本語ハブ')

  return (
    <article className="about-page" lang="zh-TW" aria-labelledby="about-title">
      <header className="about-page__hero">
        <p className="about-page__eyebrow" lang="en">
          ABOUT
        </p>
        <h1 className="about-page__title" id="about-title">
          關於 Business Japanese Hub
        </h1>
        <p className="about-page__tagline">
          從「日文檢定的日文」，走進「日本社會人的日文」。
        </p>
        <p className="about-page__hero-copy">
          通過 JLPT N1，不代表日文學習已經結束。
        </p>
        <p className="about-page__hero-copy">
          很多時候，反而只是另一個階段的開始。
        </p>
        <p className="about-page__lead">
          <strong>
            Business Japanese Hub 是為已經具備中高階日文能力、希望真正進入日本職場與商業世界的人所打造的日文學習平台。
          </strong>
        </p>
        <p className="about-page__hero-copy">這裡不以「再考一張日文證書」為終點。</p>
        <p className="about-page__hero-copy">我們想做的是，幫助你從：</p>
        <div className="about-page__contrast" aria-label="學習目標">
          <p>
            <strong>看得懂日文</strong>
          </p>
          <p className="about-page__contrast-arrow">進階到：</p>
          <p className="about-page__contrast-emphasis">
            <strong>能用日文閱讀、思考、討論與工作。</strong>
          </p>
        </div>
      </header>

      <div className="about-page__sections">
        <section className="about-page__section" aria-labelledby="about-purpose-title">
          <p className="about-page__section-label" lang="en">
            WHY THIS PLATFORM
          </p>
          <h2 id="about-purpose-title">為什麼想做這個平台？</h2>
          <h3>因為我看過太多人，考過 N1 之後才遇到真正的日文瓶頸。</h3>
          <p>在我身邊，有不少已經通過 JLPT N1 的朋友。</p>
          <p>有人來到日本之後開始找工作，才第一次發現：</p>
          <p>
            明明履歷上寫著 N1，面試時也大致聽得懂對方在說什麼，但真正要說明自己的經驗、回答追問、表達觀點時，卻很難像日本社會人一樣自然地組織語言。
          </p>
        </section>

        <section className="about-page__section about-page__section--distance" aria-labelledby="about-distance-title">
          <p className="about-page__section-label" lang="en">
            BEYOND THE TEST
          </p>
          <h2 id="about-distance-title">N1 與日本職場之間，存在一段很少有人教的距離。</h2>
          <p>一般日文學習的路徑非常清楚：</p>
          <p className="about-page__progression"><strong>N5 → N4 → N3 → N2 → N1</strong></p>
          <p>你有教材。</p>
          <p>有單字表。</p>
          <p>有文法書。</p>
          <p>有模擬考。</p>
          <p>也知道下一步應該學什麼。</p>
          <p>但是通過 N1 之後呢？</p>
          <p>突然之間，學習地圖消失了。</p>
          <p>真正的日本社會不會再按照 JLPT 等級替你整理內容。</p>
          <p>你開始遇到的是：</p>
          <ol className="about-page__list about-page__list--examples">
            {REAL_WORLD_EXAMPLES.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ol>
        </section>

        <section className="about-page__section" aria-labelledby="about-audience-title">
          <p className="about-page__section-label" lang="en">
            FOR WHOM
          </p>
          <h2 id="about-audience-title">這個平台適合誰？</h2>
          <p>Business Japanese Hub 特別適合：</p>
          <ol className="about-page__list about-page__list--audience">
            {AUDIENCE_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <div className="about-page__audience-close">
            <p>如果你的目標只是通過 JLPT，</p>
            <p>市面上已經有很多優秀的教材。</p>
            <p>但如果你開始問：</p>
          </div>
          <div className="about-page__question">
            <blockquote>
              <strong>「N1 之後，我要怎麼讓日文真正變成工作能力？」</strong>
            </blockquote>
            <p className="about-page__question-close">這就是我們想陪你解決的問題。</p>
          </div>
        </section>

        <section className="about-page__section about-page__section--founders" aria-labelledby="about-founders-title">
          <p className="about-page__section-label" lang="en">
            THE PEOPLE BEHIND IT
          </p>
          <h2 id="about-founders-title">為什麼是我？</h2>
          <div className="about-page__founder-story">
            <p>我自己也是從「學日文」一路走到「用日文工作」的人。</p>
            <p>
              高中時，我通過了 JLPT N1。
            </p>
            <p>
              在大學期間取得台灣日語導遊、日語領隊國家資格，也累積許多的日文家教與中日口譯經驗。
            </p>
            <p>
              後來來到日本攻讀 MBA。
            </p>
            <p>
              進入日本四大事務所做 Consulting 之後，我每天閱讀日本企業與日本政府資料、製作商業文件、整理論點，並在日本職場裡以日文與不同的人溝通。
            </p>
            <p>也是在這個過程中，我才真正體會到：</p>
            <h3>
              <strong>考過 N1，和能不能在日本用日文工作，中間還隔著很長一段路。</strong>
            </h3>
            <p>而這段路，過去很少有一套清楚的學習地圖。</p>
            <p>我想把自己曾經花很多年摸索的東西，重新整理成一條更清楚的路。</p>
          </div>
          <div className="about-page__profiles">
            <ProfileBlock profile={FOUNDER_PROFILE} />
            <ProfileBlock profile={COFOUNDER_PROFILE} />
          </div>
        </section>
      </div>
    </article>
  )
}

function ProfileBlock({ profile }: { profile: PublicProfile }) {
  return (
    <article className="about-profile" lang={profile.language}>
      <h3>{profile.heading}</h3>
      <ul>
        {profile.credentials.map((credential) => (
          <li key={credential}>{credential}</li>
        ))}
      </ul>
      {profile.languages && (
        <p className="about-profile__languages">
          <strong lang="en">Languages</strong>
          <br />
          {profile.languages.map((language, index) => (
            <span key={language.label} lang={language.language}>
              {index > 0 && <span aria-hidden="true">｜</span>}
              {language.label}
            </span>
          ))}
        </p>
      )}
    </article>
  )
}
