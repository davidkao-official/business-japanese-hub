import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const SECTIONS = [
  'SPI 3 是什麼？',
  'SPI 主要在測什麼？',
  'SPI 3 的主要種類',
  'SPI 怎麼考？',
  'SPI 大概要考多久？',
  'SPI 真正考的是「快速＋正確」',
  '為什麼很多 N1 合格者還是覺得 SPI 很難？',
  '對外國人而言，SPI 往往比 JLPT 更難',
  '外國人最大的問題：腦中還在「翻譯」',
  '什麼叫做「快速解題」？',
  '什麼叫做「正確解題」？',
  '想進大型企業，SPI 不能只是「有準備就好」',
  '正答率 90% 可以當作高標準目標',
  '能力測驗高分，也不代表一定會通過',
  '日本求職不只有 SPI',
  '外國人應該怎麼開始準備？',
  'David 給想在日本工作的外國人的建議',
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="spi-explainer__section" aria-labelledby={`spi-${SECTIONS.indexOf(title as typeof SECTIONS[number])}`}>
      <h2 id={`spi-${SECTIONS.indexOf(title as typeof SECTIONS[number])}`}>{title}</h2>
      {children}
    </section>
  )
}

function DavidCallout({ children }: { children: ReactNode }) {
  return (
    <aside className="spi-explainer__david" aria-label="David 觀點">
      <p className="spi-explainer__label">David 觀點</p>
      {children}
    </aside>
  )
}

export function SpiExplainerPage() {
  useDocumentTitle('SPI是什麼？在日本求職前一定要知道的 網路測驗 | Business Japanese Hub')

  return (
    <article className="spi-explainer" lang="zh-TW" aria-labelledby="spi-explainer-title">
      <header className="spi-explainer__hero">
        <p className="spi-explainer__eyebrow" lang="en">JAPAN JOB HUNTING · WEB TEST</p>
        <h1 id="spi-explainer-title">SPI是什麼？在日本求職前一定要知道的 網路測驗</h1>
        <p className="spi-explainer__dek">如果你打算進入日本企業工作，只準備 JLPT 並不夠。SPI 3 是日本企業在新卒採用與中途採用中，都可能遇到的重要適性測驗。</p>
        <p>很多外國求職者第一次接觸日本求職時，會以為 SPI 只是日本大學生找第一份工作時才需要考的測驗。其實，SPI 會出現在新卒採用，也可能出現在中途採用。即使已有數年工作經驗，轉職時仍可能遇到。</p>
        <DavidCallout>
          <p>David 認識許多正在找工作的學生，以及正在轉職的社會人士，不論是日本人還是外國人，都曾經因為沒有好好準備 Web Test，而在選考初期就被淘汰。</p>
          <p>即使履歷、學歷、工作經驗都沒有問題，只要網路測驗沒有通過，<strong>連之後參加面試、向企業展現自己的機會都可能拿不到。</strong></p>
        </DavidCallout>
        <p>因此，Web Test 不應該等收到考試通知之後才開始準備。對很多企業而言，它本身就是正式選考的一部分。</p>
      </header>

      <aside className="spi-explainer__source-note">
        <strong>閱讀說明</strong>
        <span>SPI 的制度、測驗方式與時間資訊依 Recruit Management Solutions 公開資料整理；外國求職者的準備觀點與 David 個人觀察會另外標示。</span>
      </aside>

      <div className="spi-explainer__sections">
        <Section title={SECTIONS[0]}>
          <p>SPI 3 是 Recruit Management Solutions 提供的適性測驗，日本企業用它了解應徵者的基礎能力與個人特質。企業會依招募目的選擇測驗內容與實施方式，並非所有職缺都採用完全相同的組合。</p>
        </Section>

        <Section title={SECTIONS[1]}>
          <p>SPI 的測驗分為能力測驗與性格測驗。能力測驗主要分為言語與非言語；企業可透過結果了解應徵者處理資訊與工作的基礎能力。</p>
          <div className="spi-explainer__table-wrap"><table><thead><tr><th>領域</th><th>內容</th></tr></thead><tbody><tr><th scope="row">能力測驗</th><td>言語、非言語，確認語言理解、數量處理與邏輯思考等基礎能力</td></tr><tr><th scope="row">性格測驗</th><td>行為傾向、工作方式與組織適性等個人特質</td></tr></tbody></table></div>
        </Section>

        <Section title={SECTIONS[2]}>
          <p>SPI 3 會依應徵者類型與企業需求提供不同測驗版本。常見名稱包括 SPI-U、SPI-G 與 SPI-H；實際內容仍以企業通知為準。</p>
          <div className="spi-explainer__table-wrap"><table><thead><tr><th>種類</th><th>主要對象</th><th>測驗內容</th></tr></thead><tbody><tr><th scope="row">SPI-U</th><td>大學畢業者、新卒採用</td><td>言語、非言語、性格等，依企業設定</td></tr><tr><th scope="row">SPI-G</th><td>中途採用</td><td>言語、非言語、性格等，依企業設定</td></tr><tr><th scope="row">SPI-H</th><td>高中畢業者</td><td>言語、非言語、性格等，依企業設定</td></tr></tbody></table></div>
          <p className="spi-explainer__warning">「已經不是新卒，所以不用準備 SPI」是一個非常危險的誤解。</p>
        </Section>

        <Section title={SECTIONS[3]}>
          <p>SPI 3 可能以不同方式實施，包含測驗中心、企業內 CBT、網路測驗與紙本測驗。作答環境、流程與可測項目會因形式而異，請優先依應徵企業寄來的說明準備。</p>
          <ul className="spi-explainer__chips"><li>Test Center 測驗中心</li><li>In-house CBT 企業內電腦測驗</li><li>WEB Testing 網路測驗</li><li>Paper Testing 紙本測驗</li></ul>
        </Section>

        <Section title={SECTIONS[4]}>
          <p>Recruit 公開資料將 SPI 3 的作答時間概括為約 30 至 40 分鐘，實際時間依實施方式而異。這不代表所有測驗都使用相同時間或相同題數，應以個別企業的考試指示為準。</p>
          <p className="spi-explainer__source">來源：Recruit Management Solutions，SPI 3 服務介紹。公開概略時間為「30 分鐘至 40 分鐘」，並註明依實施方式而異。</p>
        </Section>

        <Section title={SECTIONS[5]}>
          <p>企業真正想看的，是候選人能不能在有限時間內，快速而且正確地處理問題。只理解解法還不夠，還要讀懂條件、選擇方法並穩定作答。</p>
        </Section>

        <Section title={SECTIONS[6]}>
          <div className="spi-explainer__table-wrap"><table><thead><tr><th>JLPT</th><th>SPI</th></tr></thead><tbody><tr><td>確認日文理解與語言知識</td><td>在求職測驗情境下，結合閱讀、判斷與基礎能力作答</td></tr><tr><td>可依題目逐步理解</td><td>必須在時間限制內處理資訊</td></tr></tbody></table></div>
          <p className="spi-explainer__pullquote">JLPT 在問你看不看得懂日文。SPI 更接近在問你能不能用日文快速工作。</p>
        </Section>

        <Section title={SECTIONS[7]}>
          <p>SPI 言語會要求快速處理詞語關係、詞彙與用法、句子排序、填空及長文理解。非言語則可能涉及比例、百分比、速度、集合、機率、排列、表格與推論等數量或邏輯資訊。</p>
          <p>對不少外國學習者來說，SPI 可能比 JLPT 難上許多，因為它把日文理解、邏輯、資訊處理與時間壓力放在同一場測驗中。這些是常見練習範圍的整理，不代表 Recruit 公布的固定完整題型清單。<strong>N1 合格，不代表 SPI 言語自然就能拿高分。</strong></p>
        </Section>

        <Section title={SECTIONS[8]}>
          <div className="spi-explainer__translation"><p><strong>日本母語者</strong><br />閱讀 → 理解 → 判斷 → 作答</p><p><strong>外國求職者若仍逐句翻譯</strong><br />閱讀日文 → 翻譯成母語 → 理解 → 判斷 → 作答</p></div>
          <p>如果每題都要先在腦中翻譯，有限時間就會被理解流程消耗。SPI 言語真正需要培養的是看到日文後，直接用日文理解與判斷。</p>
        </Section>

        <Section title={SECTIONS[9]}>
          <p>快速解題，是在有限時間內找到關鍵資訊並採取合適步驟。這與實際工作中快速閱讀資料、整理重點、作出判斷的能力相通。</p>
        </Section>

        <Section title={SECTIONS[10]}>
          <p>正確解題，是不漏讀條件、不混淆數值，並在時間壓力下確認答案。練習時應同時回看理解、列式或推理與計算的過程，不只記住結果。</p>
        </Section>

        <Section title={SECTIONS[11]}>
          <p>Web Test 可能成為選考初期的足切り關卡。若未通過，有些企業不會安排後續面試；履歷、學歷與工作經驗便可能沒有機會在面試中被看見。</p>
          <DavidCallout>
            <p>David 認識不少日本人與外國人，本身的學歷與工作經歷其實並不差，但因為沒有事先準備 SPI、玉手箱或其他 Web Test，最後直接在筆試階段被淘汰。</p>
            <p>問題不是面試表現不好，而是<strong>根本沒有進入面試。</strong></p>
          </DavidCallout>
        </Section>

        <Section title={SECTIONS[12]}>
          <p>正答率 90% 可以作為高標準的練習目標，幫助自己檢視穩定度；它不是所有企業共用的公開合格門檻。各企業的判斷標準可能不同，也沒有一個適用所有企業的固定公開分數。</p>
        </Section>

        <Section title={SECTIONS[13]}>
          <p>能力測驗表現不等於一定通過選考。企業也可能參考性格測驗，以了解個人特質與職務、組織的適配情形。性格測驗不是一套可推算的固定 pass/fail 公式。</p>
        </Section>

        <Section title={SECTIONS[14]}>
          <p>日本企業也可能使用其他適性測驗。實際採用的形式依公司與職缺而異，收到通知後先確認測驗名稱，再安排準備重點。</p>
          <ul className="spi-explainer__chips"><li>SPI</li><li>玉手箱</li><li>TG-WEB</li><li>CAB</li><li>GAB</li></ul>
        </Section>

        <Section title={SECTIONS[15]}>
          <p>可以先建立跨題型都用得到的基礎，再針對應徵企業通知的形式練習：</p>
          <ul className="spi-explainer__skills"><li>日文閱讀速度與語彙</li><li>邏輯判斷與條件整理</li><li>心算、比例與百分比</li><li>基礎公式與圖表閱讀</li></ul>
          <p>從小段練習開始，逐步熟悉讀題、判斷與作答節奏。</p>
        </Section>

        <Section title={SECTIONS[16]}>
          <p>如果你已經通過 JLPT N1，代表你的日文已經達到相當高的程度。但是在日本求職市場中，<strong>N1 不是終點。</strong></p>
          <p>企業下一步真正想確認的是，你能不能使用日文快速理解資訊、解決問題，並且在日本的工作環境中完成任務。</p>
          <p className="spi-explainer__pullquote">N1，是證明你會日文。SPI，是日本企業開始判斷你能不能用日文工作的地方。</p>
          <p>SPI 並不只是新卒學生才需要面對的考試。新卒會遇到，中途轉職也可能遇到。若 Web Test 沒有通過，再好的履歷、學歷與工作經驗，都可能還來不及讓面試官看到。</p>
          <DavidCallout>
            <p>David 建議先從日文閱讀速度、語彙、邏輯判斷與基礎計算開始，再依企業指定的測驗形式安排練習。</p>
          </DavidCallout>
          <p className="spi-explainer__closing">真正的日本求職日文，往往從 JLPT N1 之後才開始。</p>
        </Section>
      </div>

      <footer className="spi-explainer__sources" aria-label="資料來源與編輯說明">
        <h2>資料來源與編輯說明</h2>
        <p>SPI 一般制度說明依 Recruit Management Solutions 公開資料整理；詳細題型名稱依研究整理的常見準備分類，並非 Recruit 公布的官方完整清單。外國求職者的學習觀點與個人觀察屬 Business Japanese Hub 編輯內容。</p>
        <ul>
          <li><a href="https://www.spi.recruit.co.jp/" target="_blank" rel="noreferrer">Recruit Management Solutions，SPI 3 官方網站</a></li>
          <li><a href="https://www.spi.recruit.co.jp/spi3/faq/" target="_blank" rel="noreferrer">Recruit Management Solutions，SPI 3 常見問題</a></li>
          <li><a href="https://www.spi.recruit.co.jp/lp/spi_lp01a.html" target="_blank" rel="noreferrer">Recruit Management Solutions，SPI 3 測驗概要與作答時間</a></li>
          <li><a href="https://www.spi.recruit.co.jp/testcenter/" target="_blank" rel="noreferrer">Recruit Management Solutions，測驗中心資訊</a></li>
        </ul>
      </footer>

      <footer className="spi-explainer__cta">
        <p className="spi-explainer__label" lang="en">START PRACTICING</p>
        <h2>從 SPI 開始，練習日本企業選考中真正需要的閱讀速度、語彙、推理與解題能力。</h2>
        <Link className="btn btn--primary" to="/practice/web-test">日本求職網路測驗刷題</Link>
      </footer>
    </article>
  )
}
