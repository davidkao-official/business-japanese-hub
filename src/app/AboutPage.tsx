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
        <p className="about-page__lead">
          Business Japanese Hub 是為已經具備中高階日文能力、希望真正進入日本職場與商業世界的人所打造的日文學習平台。
        </p>
        <div className="about-page__contrast" aria-label="學習目標">
          <p>
            <span>看得懂日文</span>
          </p>
          <span className="about-page__contrast-arrow" aria-hidden="true">
            →
          </span>
          <p className="about-page__contrast-emphasis">
            <strong>能用日文閱讀、思考、討論與工作</strong>
          </p>
        </div>
      </header>

      <div className="about-page__sections">
        <section className="about-page__section" aria-labelledby="about-purpose-title">
          <p className="about-page__section-label" lang="en">
            WHY THIS PLATFORM
          </p>
          <h2 id="about-purpose-title">為什麼想做這個平台？</h2>
          <p>
            學會文法與通過檢定，是重要的起點；但真正進入日本社會之後，還需要理解資訊的脈絡、工作的判斷，以及語言背後的距離與語感。
          </p>
          <p>
            我們希望把這段從學習到實踐之間的距離，整理成能持續使用的內容、練習與學習路徑，讓學習者可以逐步走向日本求職、選考與職場成長。
          </p>
        </section>

        <section className="about-page__section about-page__section--distance" aria-labelledby="about-distance-title">
          <p className="about-page__section-label" lang="en">
            BEYOND THE TEST
          </p>
          <h2 id="about-distance-title">N1 與日本職場之間，存在一段很少有人教的距離。</h2>
          <p>
            很多人走過了 N5 → N4 → N3 → N2 → N1，卻在通過 N1 之後發現，原本清楚的學習地圖突然消失了。
          </p>
          <p>
            你可能已經能夠看懂一般文章，卻還不熟悉日本企業的資訊如何被整理、工作的討論如何展開，以及一句話在不同關係中為什麼會有不同的重量。
          </p>
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
          <p>
            如果你想把已經累積的日文能力，轉成能在日本求職、閱讀商業資訊與工作現場使用的能力，這裡就是為你準備的。
          </p>
          <ol className="about-page__list about-page__list--audience">
            {AUDIENCE_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <section className="about-page__section about-page__section--question" aria-labelledby="about-question-title">
          <p className="about-page__section-label" lang="en">
            THE QUESTION
          </p>
          <h2 id="about-question-title">從問題開始</h2>
          <blockquote>
            「N1 之後，我要怎麼讓日文真正變成工作能力？」
          </blockquote>
        </section>

        <section className="about-page__section about-page__section--founders" aria-labelledby="about-founders-title">
          <p className="about-page__section-label" lang="en">
            THE PEOPLE BEHIND IT
          </p>
          <h2 id="about-founders-title">為什麼是我？</h2>
          <div className="about-page__founder-story">
            <p>
              高中時，我通過了 JLPT N1，也通過台灣國家考試，取得台灣日語導遊、日語領隊國家資格。這些經驗讓我很早就知道，考試裡的正確答案和真實語境中的選擇，並不是同一件事。
            </p>
            <p>
              後來來到日本攻讀 MBA，進入日本四大事務所做 Consulting 之後，我更清楚看見語言能力如何影響一個人理解資料、參與討論，以及在工作中被理解的方式。
            </p>
            <p>
              考過 N1，和能不能在日本用日文工作，中間還隔著很長一段路。Business Japanese Hub 就是從這段路出發。
            </p>
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
