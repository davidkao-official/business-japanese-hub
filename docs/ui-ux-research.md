# UI/UX 設計方向研究 — Business Japanese Hub

> **狀態：** durable（長期有效）的 UI/UX 設計方向研究。是**設計層面的 canonical implementation contract（UI/UX 決策的單一 authority）**，也是 `docs/product-contract.md` §8（UI / Reader quality 是 P0）的具體化。
>
> **來源與版本：** 本文件是《Business Japanese Hub UI_UX 深度研究與實作設計簡報》（18 頁 PDF，2026-08，以下簡稱「研究簡報」）在 repository 內的 durable 落地形式。研究簡報是**有版本的 research provenance（2026-08 版）**，僅供追溯研究脈絡；**本文件才是 repository 內 UI/UX 實作決策的 canonical authority**。本文件忠實記錄研究結論與實作決策，**不另起一輪 competitive research，也不改寫其 design direction**。同步規則：當研究簡報後續版本與本文件不一致時，應更新本文件以反映新的研究結論，而不是以 PDF 覆寫 repository 內的實作 contract。
>
> **上位契約：** `docs/product-contract.md`（§5 平台 abstraction、§6 book-agnostic、§8 UI/Reader P0、§9 web-first）。
> **相關實作：** `docs/content-model.md`（#3 content model）、`src/styles/tokens.css`（design tokens）、`src/reader/`（#5 Universal Reader）。

---

## 1. 定位與核心判斷

產品契約已經把最重要的設計決策定死：核心 commerce unit 是 **Book**，不是 Course；**Web-first**；premium reader 是 **P0**；手機支援通勤閱讀、desktop 支援專注閱讀與 reference use；產品不能像 generic LMS、外國人教材或 AI wrapper。GitHub #2 進一步要求這套視覺必須同時讓進階外國專業人士與日本大學生／年輕職場人士覺得可信、值得付費，而且研究結果要能直接 unblock design-system skeleton 與 Universal Reader。

**核心判斷：這個產品不應設計成「比較高級的日語學習網站」，而應設計成「日本的 premium digital publishing imprint，剛好出版商務日語這個知識領域」。**

第一版 visual direction 定義為：

> **Quiet Editorial Modernism** — 靜謐、精準、有出版品感的數位書籍系統。

它應該更接近 **BNN** 的出版物可信度 + **BRUTUS** 的 editorial curation + **Stripe Press** 的知識產品品牌一致性 + **Apple Books / BOOK☆WALKER** 的閱讀器隱身能力，而不是 Duolingo、Udemy、Coursera、Notion dashboard 或 AI chat product。

### 1.1 設計維度總覽

| 設計維度 | 建議方向 | 不應變成 |
| --- | --- | --- |
| 平台人格 | 冷靜、成熟、知性、精準、有編輯判斷 | 「學日文好開心！」的 edtech |
| 視覺主角 | 書封與內容；平台 chrome 後退 | UI 卡片與品牌漸層搶戲 |
| 色彩 | 紙張中性色 + 墨色 + 單一低飽和 accent | 日本紅、櫻花粉、黑金 luxury cliché |
| Typography | 日文排版主導，英數服從日文版面 | 先做英文 SaaS layout 再塞日文 |
| Storefront | 最有 editorial expression | 電商 marketplace |
| Book Detail | 像出版社 product page / 書籍 colophon | 長篇 SaaS sales landing page |
| Library | 私人書架／閱讀桌 | 課程進度 dashboard |
| Reader | UI 幾乎消失 | Lesson page |
| Learning blocks | 書中的「例、注、比較、練習」 | quiz app / flashcard app |
| Premium 感來源 | 排版、比例、封面、紙感、節奏、內容品質 | shadow、glassmorphism、animation 數量 |

### 1.2 最重要的 design-system principle

> **「Book-level identity 可以很強；Platform-level identity 必須安靜。」**

不同書籍未來可以有截然不同的 cover art direction、攝影、插畫、主題色與語氣，但 **Storefront、Library、Reader 的 grid、typography、navigation、accessibility 與 interaction grammar 必須穩定**。這與 #3 要求的通用 `Book → Chapter → content blocks`、不能為第一本書硬寫特殊 React 元件完全一致。

### 1.3 premium ≠ decorative

日本書籍組版本身就是高度嚴格的設計領域。W3C **Japanese Layout Requirements（JLREQ）** 主要以 JIS X 4051 為基礎，涵蓋日本語行組、標點、和歐混植、ruby、heading、illustration、table、note 等，且特別指出**一般書籍是日本語組版中品質要求最高、問題最複雜的類型之一**。因此這個產品最有價值的「日本感」，應來自**真的把日本文排好**，而不是加日本符號。

---

## 2. Benchmark 與可借鑑模式

以下不是 mood board，而是應直接轉換成 **product behavior** 的 benchmark。

| Benchmark | 現在值得學的部分 | Business Japanese Hub 應採用 | 不要照抄 |
| --- | --- | --- | --- |
| BNN | 書籍詳細頁以封面、價格、description、規格、credit、目次構成完整出版物資訊；「書本身」是主角。 | Book Detail 有封面、作者、edition、publication metadata、TOC、內容 preview；讓書看起來像真正出版品。 | 大量外部 retailer purchase links |
| BRUTUS.jp | 2026 首頁仍由 issue、feature、WHAT'S NEW、FOCUS、SPECIAL 等 editorial framing 組成。 | Storefront 先策展，再 catalog；讓一本新書可以像「新刊特集」被認真介紹。 | 每頁都做成 magazine hero，Reader 尤其不行 |
| Rakuten Kobo Japan | 日本電子書 detail 直接提供「今すぐプレビューを読む」，同頁呈現作者、購買與書籍詳細資料。 | 試し読み必須與購買 CTA 同級可見；preview 應是購買決策的一部分。 | marketplace ranking、分類與促銷密度 |
| BOOK☆WALKER | Browser viewer 可點擊頁面喚出 menu，支援文字大小等設定；購入書列表有讀書進度。 | 購買後可以從購入済み書籍直接「読む」。Reader chrome hidden-by-default；Library 的主要 action 是「続きを読む」。 | 大量本棚分類、八種排序、下載狀態等成熟 marketplace complexity |
| Apple Books | Reader 可調 font size、theme、background、font、spacing、justification；iPhone 上讀者點頁面後才出現 menu。 | Reader preference 放在 progressive panel；閱讀時不常駐工具列。 | V1 一開始就提供十幾種設定 |
| Readwise Reader | Desktop 可以 keyboard-first 閱讀，寬螢幕上的 annotation 出現在右 margin；sidebars 可以藏起來。 | Desktop 可做「中央正文 + 可折疊 TOC + 條件式 marginalia」。 | 把產品做成 annotation / PKM 工具 |
| Stripe Press | 知識書籍與 publisher identity 共存；Scaling People 一書甚至內含超過 100 頁 worksheets、templates、exercises 與 examples，仍明確是一「本書」。 | exercise、worksheet、case study 可以很豐富，但仍是 chapter flow 中的 editorial block。 | 把 exercise 抽成「Lesson 3 Quiz」 |
| W3C JLREQ | 日本語組版以方形文字框、ベタ組為基本原則，並正式處理和歐混植、ruby、notes、tables 等出版需求。 | Reader typography 應有自己的 design primitives，不與普通 marketing typography 共用所有值。 | blanket letter-spacing、break-all 等英文網站補丁 |

**這些 benchmark 共同指向一個很清楚的產品層級：**

> **Storefront sells the editorial judgment → Book Detail sells this particular book → Library expresses ownership → Reader delivers the value.**

因此四個 surface **不應只是同一套 Card UI 換資料**：

- Storefront 可以有比較大膽的 asymmetrical editorial spacing、cover composition 與選書敘事。
- Book Detail 收斂成 publisher-like information architecture。
- Library 再收斂成私人空間。
- Reader 則幾乎只剩 typography。

這也是為什麼**不應先做一個通用 `<Card>`**，然後 Storefront、Library、Callout、Exercise、Book Detail 全部塞進 rounded card。

---

## 3. 日文 Typography 與閱讀規格

**日本文的 measure 必須先決定，其他 Reader layout 再圍繞它建立。** W3C JLREQ 明確建議**橫組日文一行大約最多 40 字**；如果版面導致行長更長，應縮短行長或改變欄位結構。一項針對 vertically scrolling Japanese electronic reader 的眼動／閱讀速度研究，在其特定測試條件下得到約 20–29 字／行的最佳折衷區間；這不能當成所有 web reader 的硬規則，但足以證明「desktop 撐滿 1000px 正文」沒有合理性。

### 3.1 V1 typography spec

| Token / 場景 | Mobile | Desktop | 備註 |
| --- | --- | --- | --- |
| Reader body | 17px | 18px | 主要長文 |
| Reader line-height | 1.82 | 1.80 | 約 31–32px |
| Reader target measure | 約 19–23 全形字 | 32–36 全形字 | hard cap 40 |
| Reader max width | viewport − 36/40px | 34em，約 612px @18px；最多約 640px | 不隨螢幕無限擴大 |
| Mobile gutters | 18–20px | — | 360px 寬裝置仍有合理正文 |
| UI body | 15–16px | 15–16px | buttons/navigation |
| Metadata | 13–14px | 13–14px | 不低於 13 作主要資訊 |
| H3 | 20–22px / 1.45 | 21–23px / 1.45 | |
| H2 | 25–28px / 1.4 | 27–30px / 1.35 | |
| Chapter title | 29–32px / 1.3 | 36–42px / 1.25 | 日文長標題必須容許自然換行 |
| Storefront display | 34–40px | 44–56px | 只用於 editorial hero |
| Paragraph spacing | 0.75–1em | 0.75–1em | Reader default |
| Font weight | 400 / 500 / 700 | 400 / 500 / 700 | 正文不要 300 |

17–18px 與約 1.8 line-height 不是從某個規格直接抄值，而是本案的設計起點：WCAG 2.2 **Success Criterion 1.4.12（Text Spacing，Level AA）** 要求內容在使用者把 line-height 覆寫到至少 1.5 倍、paragraph spacing／letter spacing 拉大時仍不能遺失內容或功能；WCAG 2.2 **Success Criterion 1.4.8（Visual Presentation，Level AAA）** 的增強型 presentation 指引則把 **CJK 40 glyphs** 視為 line-width 上限。CJK 40 glyph 屬 **AAA 呈現建議，不是 AA conformance 要求**；1.8 對密集漢字、括號、ruby、英數混排是比較安全且具有 premium 編輯感的 default。

### 3.2 段落規則

V1 建議 **「不首行縮排 + 0.75–1em paragraph gap」**。這不是要否定日本紙本書常見的段首處理，而是 Universal Reader 裡 prose 會與 dialogue、example、comparison、figure、exercise 頻繁混合；使用 **spacing-based paragraph rhythm** 比同時混用 1em indent + 大段落 gap 更穩定。未來如果某本書需要傳統書籍版式，可以做 book theme，而不是第一版全平台混合兩套 paragraph grammar。

### 3.3 字距（tracking）

**正文不要全域增加 letter-spacing。** JLREQ 指出漢字、平假名、片假名在日本文組版中的基本前提是方形字框並以ベタ組排列。正文 tracking 應以 **0** 為基準；大 display title 最多只有非常輕微的 optical adjustment。常見「日系網站 = 全部 0.08em 字距」不適合一個真正長文 reader。

### 3.4 對齊

**不要強制 full justification。** JLREQ 的出版傳統重視版面與行位置，但 Web Reader 必須同時接受 responsive reflow、使用者字級修改與 accessibility overrides；WCAG 的 enhanced visual presentation 甚至明列 not justified。V1 應以**自然 start alignment** 為 default，不為了模仿紙本而在 browser 中強制製造異常字距。真正的 Japanese justification 可以等實機 typography QA 後再決定。

### 3.5 換行策略（Japanese-aware）

- **`lang` 所有權：** reading surface 的根元素／內容容器以**正在閱讀的 Book 的 `language`（BCP-47）**設定 `lang`；非閱讀 surface（storefront、library 等 platform shell）維持根元素 `lang="ja"` 的平台 default。混合語言內容（例如例句 translation、拉丁詞彙）用 **nested `lang` override** 標示，不要依賴全域 root 語言涵蓋。
- Japanese body 使用 standards-aware `normal`/`strict` line breaking；**browser QA 必須同時測 `line-break: normal` 與 `line-break: strict`** 兩種結果。
- **禁止以 `break-all` 當萬用解法。**
- URL、超長 identifier 才使用 emergency wrapping。
- headings 可以用作者指定 break opportunity 或 phrase-aware enhancement，**不能手工塞 `<br>` 綁死 viewport**。

### 3.6 和歐混植

和歐混植應以日文為 master rhythm。UI metadata、日期、百分比、價格、產品代號等，預設用**半形 Arabic numerals 與 Latin**；不要把 N1、2026、API、PDF 人為改成全形字。英文短語保持單字完整，數字與拉丁文字視需要使用 proportional figures；真正的 comparison/table 才使用 tabular figures。JLREQ 本身把 Western characters、European numerals 與和歐文混植列為日本文組版的一部分，而不是例外。

### 3.7 字體策略（雙角色，不是單一 brand font）

| 角色 | V1 決策 |
| --- | --- |
| UI / metadata / controls | Japanese Gothic / sans token |
| Dialogue / comparison / exercises | 同 UI 的 sans family，維持結構清楚 |
| Reader prose | 建立獨立 reader-serif 與 reader-sans token |

- V1 default **reader-serif**，讓正文有真正「書」的氣質；fallback platform-native Japanese serif / sans。
- 未來 reader setting 提供明朝／ゴシック切換。
- Noto 官方資料指出 Noto Sans 適合 online reading 與產品資訊，而 Serif 類型經常被用於書籍與報紙；Noto 同時提供 Noto Sans JP 與 Noto Serif JP，官方對 CJK web stack 也建議讓 Latin family 與 JP family 有意識地配對。
- **但 #4 不應因為「premium」而立刻把巨大 CJK font payload 鎖進產品架構。** 先把 `font.ui`、`font.reader`、`font.readerSans`、`font.readerSerif` 等 semantic tokens 建好；#5 做真實日本文內容與 Windows/macOS/iOS/Android browser typography comparison 後，再決定是否採 region-specific Noto webfont。Premium 感首先來自 measure、leading、hierarchy 與 spacing，不是「有下載自訂字體」本身。

### 3.8 Ruby 克制

JLREQ 把 ruby 當正式的日本文組版功能，但本產品是從 N1 往 professional competence，**不是初級日語教材**。因此**只 render 作者明確標記的 ruby**。不能把常用漢字全面附假名；否則 native Japanese reader 一眼就會把產品分類成「外国人向け教材」。

**V1 資料表示：** 目前 content model 沒有 inline ruby 的資料表示（`vocabulary.reading` 是單字讀音，不是 inline ruby）。在 content model 補上 ruby 表示法（bounded follow-up，依 `docs/content-model.md` §6）之前，V1 **不宣稱支援 ruby rendering**，也不把 ruby 放入視覺回歸 fixtures 的必要清單。

---

## 4. Storefront、Library、Reader 與裝置 UX

整體 navigation 非常淺：

```text
Store → Book Detail → Preview → Purchase / Owned → My Library → Reader
```

**不要出現第二套「Courses / Dashboard / Lessons / Practice / Progress」information architecture。** #1 明確把 course、subscription-first、AI main experience、full LMS 排除在 MVP 外；#6 也要求購入後要像擁有一本私人數位書，而不是 enrolled in a course。

### 4.1 Storefront

Storefront 應是四個 surface 中最像 editorial publication 的一個。

- 小型 premium catalog **不需要**一開始做 category mega menu、faceted filters、ranking、星等與 recommendation engine。BRUTUS 的強項是「編輯部決定什麼值得你注意」，而 Kobo 等大型 bookstore 的分類與 marketplace affordances 是為數萬／數百萬商品解決 discovery，不是這個產品第一版的問題。
- **桌面**第一屏採 editorial feature composition：大封面佔約 4 columns，title / proposition / author / price / preview CTA 佔約 5–6 columns，保留大量 whitespace；下面才進入 3-column book catalog。
- **手機**第一本 featured book 使用單欄大 cover；其他 books 用 cover + concise metadata 的單欄 row 或 2-up cover shelf，取決於 title 長度。**不要做四個 SaaS cards 一排。**
- **BookCard 最少只需：** `cover → title → short proposition → author → price / owned state`。不需要在卡片上塞「N1」「Business」「12 chapters」「4.9 ★」「Intermediate」「New」「Popular」六顆 chips。Audience / prerequisite 是 detail-page metadata，不是讓 storefront 看成課程 catalog 的標籤牆。

### 4.2 Book Detail / Preview

BNN 的書籍頁把 cover、description、書籍規格、credit 與目次放在同一個出版品 context；Kobo 則直接讓讀者從 detail 點「今すぐプレビューを読む」。這兩者合起來非常接近本案應有的 Book Detail。

**Above the fold：**

```text
Cover | Title / Subtitle → Author → one-paragraph proposition → Price → 試し読み → 購入する
```

**已購買狀態：**

```text
Cover | Title / Subtitle → 取得済み → 読み始める / 続きを読む
```

已購買狀態下，primary action 應**取代 purchase**，且依閱讀狀態分流（與 §8.3 的 state matrix 一致）：**已擁有但未開始閱讀 → 「読み始める」；已有閱讀進度 → 「続きを読む」**。不要留下綠色「已購買」badge 再讓使用者自己找 reader。

**下方依序：** この本について → 想定読者 / 前提 → 目次 → Preview excerpt → Author → Publication details。

「JLPT N1」若一定要標示，建議寫成安靜 metadata：

```text
前提となる日本語力：JLPT N1 相当
```

而不是：

```text
🔥 LEVEL N1 ADVANCED
```

前者是出版社資訊；後者是語言教材。

**Preview 必須使用同一個 Universal Reader renderer 與同一套 content blocks，只是有 entitlement boundary。** 不要另做一個「preview page design」。這樣使用者在購買前看到的 dialogue、callout、comparison、typography，就是買下後得到的品質。Kobo 把 preview 放在 purchase decision 的主要位置，本質上也是降低購買不確定性。

**Preview-boundary contract（設計層）：** preview 是書的**有序章節前綴**（可細到 chapter 內的有序 block 前綴），以 **book-level 的 generic metadata** 表達（例如「preview 到第 N 章」或「preview 到某個 block id」的 boundary 欄位），**不得以 `if bookId === firstBook` 或另一套 renderer 表達**。platform 在**單一 Universal Reader 的 entitlement gate** 檢查 boundary 並隱藏其後的內容；確切的 metadata field 名稱與資料形狀由 `docs/content-model.md`（#3 content-model follow-up）定稿。

### 4.3 My Library

Library **不是 Storefront 的另一個 filter**。BOOK☆WALKER 的成熟「マイブック」可以顯示購入書、既讀／未讀／讀書進度與多種排序；這證明 progress 與 personal shelf 是電子書產品中的合理概念。但 Business Japanese Hub catalog 初期很小，因此只取最核心部分。

**第一個 section 應該是：**

```text
続きを読む
[cover] 書名
第三章　〜〜
最後に読んだ位置
続きを読む
```

接著才是：**所有している本**。

- Library 裡**不要**放「おすすめ」「あなたへのおすすめ」「次に購入する本」作主要 section。這個畫面是 ownership space，而不是再一次銷售。Cross-sell 可以日後放在書本完成後或非常底部，不應污染第一版。
- Progress 也要非常克制：**薄 progress line + % 或「第 3 / 8 章」**。不要圓形 completion chart、badge、weekly streak、「あと 37% で完了！」。讀一本書沒有「落後」。

### 4.4 Universal Reader

`#5` 已正確定義 Reader 為核心 product surface、mobile minimal chrome、desktop strong navigation but controlled line length，而且 UI 應退到內容後面。這份研究把這些原則具體化：

**手機 Reader**

- 正常 scroll 時只有正文。頂部可保留極細 overall progress indicator，但 navigation bar 應在**向上 scroll、tap 或明確 interaction** 時才出現。
- 顯示時只需要：`← 書籍 | chapter title | TOC | Aa`。
- **resume state 是必須（required）**：`Chapter.id` + block identity + 閱讀位置必須 **persistence**，Library「続きを読む」與百分比 progress 都依賴它（見 §4.4 與 §8.3）。**user bookmarks 是選用（optional）**：V1 只要 anchor-ready、可以保留結構，不強迫實作 persistence。
- **TOC 使用 bottom sheet / full-screen sheet，不要 280px permanent sidebar。** Footnote / vocabulary annotation 也使用 bottom sheet 或 anchored popover；任何 interaction 都必須可以關閉並回到原本 reading focus。
- Apple Books 在 iPhone 也是先閱讀、需要時點頁面喚出 menu，再進 Themes & Settings；BOOK☆WALKER browser viewer 也採畫面中央 tap 顯示上下 menu。這正是適合通勤閱讀的 interaction model：**content first, tools on intent**。

**桌面 Reader**

不要單純把 mobile column 拉寬。建議**三區結構**：

```text
[TOC 240–280]  [正文 600–640]  [optional marginalia 240–300]
```

- TOC 可折疊，正文位置應保持視覺穩定。
- 右側**只有在 chapter 有 notes、vocabulary、footnotes 或 reader annotations 時才出現**，不要預設顯示一個空 sidebar。
- Readwise Reader 的 web 模式證明寬螢幕上的 marginal annotations 與可隱藏 sidebars 很適合 reference reading，也支援 keyboard-based navigation。但本產品**不應複製它的 PKM complexity**；只借「資訊可以放在旁邊，而正文仍保持窄 measure」這個模式。
- 桌面 Reader 的 **chapter 結尾**才顯示：

```text
← 前の章　　　　　　　　　次の章 →
```

不要把 prev/next 固定在 viewport bottom。

### 4.5 手機通勤 vs 桌面專注閱讀

| | 手機通勤 | Desktop 專注／reference |
| --- | --- | --- |
| 核心目標 | 5–20 分鐘立即續讀 | 深讀、回看、對照 |
| 正文 | 17px / ~1.82 | 18px / ~1.8 |
| measure | viewport 內自然約 19–23 字 | 32–36 字，max 40 |
| Navigation | hidden chrome | collapsible TOC |
| Notes | sheet / popover | margin panel |
| TOC | full-screen / bottom sheet | persistent-capable sidebar |
| Reading settings | compact Aa | same settings panel |
| Entry | Library 一鍵「続きを読む」 | Library / deep link / TOC |
| Progress | 很細，不搶內容 | TOC 中可顯示 current chapter |
| Controls | touch target 盡量 44×44px | mouse + keyboard |
| Layout | single column only | 中央 column，旁欄不改正文 measure |

WCAG 2.2 AA 的 pointer target minimum 是 24×24 CSS px；44×44 是 WCAG enhanced criterion 的規模。對通勤中的單手觸控，這個產品應把 **44×44px 當 house target**，而不是只滿足最低 AA。

**Reader settings 的 V1** 不需要複製 Apple Books 所有選項，但 Apple Books 已證明 font size、theme/background、font、spacing 與 justification 都是合理的 reader preferences。本案**第一版只公開三項**：

```text
文字サイズ / 表示テーマ / 書体（明朝・ゴシック）
```

spacing 與 paragraph controls 先在 architecture 上可承受，不必把設定頁做成 typographer console。

**不建議顯示固定「Page 41 / 137」。** 使用者改 font size、measure、device width 後，reflowed Web Reader 的 page identity 沒有穩定意義；Apple Books 本身允許廣泛改變 typography 與 layout，也顯示 reader layout 本質上可變。**resume state 以 stable `Chapter.id` + block id 為 key**，再搭配 offset 語意（「章節 id + 章內 block 位置，可選 block 內字元／段落 offset」），百分比從中推導。**內容 reflow 或 block 被編輯／移除時**，resume 應 fallback 到「該 block 之前最近的 stable block 或 chapter 起點」，不得因 anchor 消失就丟失閱讀狀態。user bookmarks（選用）採相同 anchor 語意，但不必納入 V1 的 persistence 需求。

---

## 5. Content Blocks 的 Rendering Grammar

`#3` 已定義第一批 universal content vocabulary（`paragraph`、`heading`、`image`、`quote`、`callout`、`table`、`vocabulary`、`dialogue`、`example`、`comparison`、`caseStudy`、`doDont`、`exercise`、`authorNote`）；其中 exercise 的 **answer** 是 block 內 property（inline reveal），作者／專家註記對應 **`authorNote`**，不是獨立 block type。**關鍵不是為每個 type 發明一張漂亮 card，而是建立少量共用 editorial grammars。**

| Block | 建議呈現 | Mobile behavior |
| --- | --- | --- |
| Book Cover | 保持 `cover.width / cover.height` 的原始比例；不可為了統一卡片而 crop；最多輕 border / shadow 等比例縮放，contain 邏輯。 | — |
| TOC | Chapter number + title + optional section；Reader 標 current chapter。 | sheet 中單欄；不需要每列 lock icon |
| Prose | 純正文，沒有 card surface。 | 17px / 1.82 |
| Callout / Note | 一條 side rule + 小 label + 正文；最多 3 個 semantic variants。 | full width inset，仍跟正文 rhythm |
| Dialogue | Speaker label + utterance；desktop speaker rail。 | speaker label 移到每段上方 |
| Example | 小 label「例」「表現例」+ 很淡 paper tint。 | 單欄 |
| Comparison | 成對 row；desktop 2 columns。 | stacked pair，不要橫向縮成小字 |
| Do / Don't | semantic label/icon + sentence。 | 不得只靠紅／綠辨識 |
| Exercise | prompt → interaction → 解答を見る。 | inline、單欄、觸控友善 |
| Answer（exercise 內） | 預設 collapsed，使用者要求後 inline reveal。 | reveal 後 focus 清楚，不做跳頁 |
| Vocabulary | term + concise definition；desktop 可 margin。 | tap 打開 sheet / popover |
| Quote | typography / rule 建立層級。 | 不用巨型 decorative quotation mark |
| Author Note（`authorNote`） | author/expert attribution + note。 | author identity 清楚，但不要 testimonial card |
| Case Study | 像章節中的 mini-section，有 kicker/title。 | 正常 document flow |
| Figure | image + caption + source。 | 高資訊圖才提供 zoom |
| Table | semantic table、足夠字級。 | 真正需要時 horizontal scroll；不可縮成 11px |

**Dialogue 絕對不要畫成 LINE / chatbot bubble。** 產品契約明確排除 AI chatbot 作為主要 abstraction；訊息泡泡會把「商務對話案例」心理上降格成 chat simulation。更成熟的做法是**戲劇／訪談式 transcript**：speaker label 是資訊，speech bubble 不是。

**Exercise 也不要被抽離成 quiz mode。** Stripe Press 的 Scaling People 有超過 100 頁 worksheets、templates、exercises 與 examples，仍然是一本 practical book。這正好是本產品的 model：練習可以 interactive，但一定要保持「我正在讀一本高品質專業書」的心理模型。所以 exercise **不應有**：

```text
Question 4 of 10 → Score 80 → Correct! 🎉 → +10 XP
```

而應是：

```text
考えてみる → 問い → 自分の回答 / 選択 → 解答を見る → 解説
```

這是「閱讀中的思考工具」，不是 assessment engine。

---

## 6. 第一版 Design Tokens

`#4` 本來就要求 centralized typography、spacing、color、surface、focus、motion tokens，且明確說 skeleton 不應先硬鎖 generic SaaS styling。**第一版就用 semantic tokens，不要把 component 寫死成 gray-700, blue-600。**

以下數值可以直接成為 design implementation 的 starting baseline，但 accent 最後仍可在 visual prototype 後微調。

### 6.1 Color

| Token | V1 建議值 | 說明 |
| --- | --- | --- |
| color.canvas | `#F8F6F1` | warm paper |
| color.surface | `#FFFFFF` | |
| color.ink | `#1F1F1C` | 正文墨色 |
| color.muted | `#67645E` | |
| color.rule | `#D9D5CB` | |
| color.accent | `#31566B` | muted deep blue |
| color.accentContrast | `#FFFFFF` | |
| color.focus | `#005FCC` | |
| Dark canvas | `#181817` | |
| Dark surface | `#222220` | |
| Dark ink | `#F2F0EA` | |
| Dark muted | `#B7B2A8` | |
| Dark rule | `#3E3B36` | |

這組 palette 的目的**不是建立「藍色品牌」，而是建立 paper/ink hierarchy**。Book cover 的顏色不要自動污染全站 UI；最多可以在 Book Detail hero 做非常克制的 artwork-derived treatment，但核心 navigation 與 Reader **不應依每一本書變色**。

### 6.2 Spacing / Radius / Elevation / Motion

- **Spacing scale：** `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96`。長文產品需要 48–96 這一段「真正的 whitespace」，不能只靠 8/16/24 做 SaaS density。
- **Radius：** `0 / 4 / 8`。Cover 接近 0–2；button / field 4–8。**不要**一開始定 16 / 24 / full pill 為全站 signature。
- **Elevation：** 只保留兩種角色：**cover** 與 **overlay**。一般 content surface 不需要 shadow。書封可以有極輕 paper/object shadow；Dialog、Sheet 才使用明顯 elevation。
- **Motion：** `120ms / 180ms / 240ms`。只有 control feedback、drawer/sheet 與 subtle state transition；尊重 reduced-motion。Reader 不做 spring、bounce、page celebration。

### 6.3 Typography tokens

`ui-xs / ui-sm / ui-md / reader-body / reader-small / h3 / h2 / chapter-title / editorial-display`

並另外定：

```text
measure.reader = 34em
measure.readerMax ≈ 640px
measure.salesCopy ≈ 36–40 Japanese glyphs
```

這比全站只有 `max-width: 1200px` 重要得多。

### 6.4 第一版 Component Inventory

不需要做巨大 Storybook library。第一輪只建立可支撐四個核心 surface 與 #3 blocks 的 component set：

| Layer | Components |
| --- | --- |
| Foundation | AppShell, Page, EditorialContainer, ReaderMeasure, Stack, Cluster, Grid, Divider |
| Navigation | Header, Footer, Breadcrumb/BackLink, IconButton |
| Interaction | Button, TextLink, Sheet, Dialog/Popover, Focus treatment |
| Book | BookCover, BookCard, BookMeta, Price, EntitlementState |
| Commerce | PreviewCTA, PurchaseCTA |
| Detail | BookHero, TOCPreview, PublicationMeta |
| Library | ContinueReading, LibraryBookTile, ReadingProgress |
| Reader shell | ReaderShell, ReaderTopBar, ReaderSidebar, ReaderTOC, ReaderSettings, ReaderProgress |
| Reader nav | ChapterHeader, ChapterNav, FootnoteAnchor / AnnotationSurface |
| Content | 一個 generic BlockRenderer + #3 semantic block renderers |

**最重要的是：不要有一個 UniversalCard component 成為所有東西的 default。**

---

## 7. 必須明文禁止的 UI Anti-patterns

| Anti-pattern | 為什麼禁止 |
| --- | --- |
| Dashboard shell：固定左側 navigation + tiles + metrics | 立即變 SaaS，不像書 |
| Course catalog terminology：Course / Module / Lesson | 違反 Book-first contract |
| Completion rings / streak / XP / badges | 把閱讀變課程績效 |
| Sakura、富士山、日本旗、毛筆紅、anime mascot | 「外國人學日本」刻板視覺，native credibility 直接下降 |
| Dialogue speech bubbles | 像 chatbot / language practice app |
| Persistent AI floating button | 讓 AI 取代書與作者成為產品中心 |
| Card soup：每個 paragraph/example/callout 都有 rounded rectangle | 視覺噪音 |
| Pastel semantic rainbow：一章充滿紫、綠、黃、藍 instructional boxes | 視覺噪音 |
| Black + gold luxury cliché | premium 被理解成裝飾性 luxury，而不是 editorial quality |
| Glassmorphism / gradient background | 與長時間閱讀和出版感相衝 |
| Marketplace density：ranking、points、coupon、sale ribbons、recommendations | 擠滿 bookstore |
| Crop book covers | 破壞出版設計本身 |
| 1000px 寬正文 | 超過日本文合理 measure；JLREQ 橫組建議最多約 40 字 |
| Tiny gray Japanese text | 漢字細節與低對比一起惡化閱讀 |
| Weight 300 長文 | 日文筆畫在部分顯示器上過細 |
| Global tracking | 破壞日文ベタ組 rhythm |
| break-all | 會破壞英數與 Japanese line-breaking grammar |
| 强制 justification | responsive / accessibility 下容易製造異常 spacing |
| Mobile persistent top + bottom bars | 浪費最珍貴的閱讀 viewport |
| Hover-only notes | 手機與 keyboard 無法可靠使用 |
| 紅／綠是 comparison 唯一資訊 | accessibility 問題 |
| 12px table 字體來換取「fit」 | 應 scroll/reflow，而不是讓文字不可讀 |
| Preview 用 screenshot/PDF image | 與真正 Universal Reader 不一致 |
| 大量 furigana | 將產品重新定位為 learner textbook |

WCAG 2.2 同時要求使用者覆寫較大的 line height、paragraph spacing、letter spacing 等時不能造成內容或功能遺失；pointer targets 也有明確 minimum。因此 design QA **不能只截一張 1440px desktop screenshot 就算完成**。

---

## 8. 對 GitHub #4 / #5 / #6 的實作建議

### 8.1 GitHub #4 — design-system skeleton

直接落實以下 contract：

1. **token 命名全部 semantic**：使用 `text.primary` / `surface.paper` / `reader.measure` / `focus` 這類角色，不把視覺綁死在 gray-900 / blue-500。
2. **Layout primitives 至少把三種 measure 分開**：`EditorialContainer`、`Commerce/BookDetailContainer`、`ReaderMeasure`。絕對不要讓所有頁面都落到同一個 `max-width: 1200px` container。
3. **第一輪就建立 `font.ui`、`font.readerSerif`、`font.readerSans`**。日文必須是 first-class default，不是 i18n 完成之後才測。
4. **建立 Japanese visual regression fixtures**，內容至少包括：長日文書名、全角標點、括號、英數混排、N1/API/2026/30%、長英文單字、URL、dialogue、comparison、table、長 TOC。ruby 待 content model 提供 inline ruby 表示後再加入（見 §3.8）。
5. **accessibility baseline 對齊 WCAG 2.2 AA**；touch controls 的 internal design target 用 44×44px，而不是只做到 AA 24px minimum。同時測 text resizing / spacing override、keyboard focus、reduced motion。
6. **不先建立 Dashboard、SidebarNav、StatCard、CourseCard 等 generic SaaS components**。#4 應該為「出版平台」搭骨架，而不是先搭 administration template。
7. **#4 的 Definition of Done 應額外加入**：在 360、390、768、1024、1440px widths 下，一段真實日本長文不需要 component-specific hack 就能遵守 design tokens。

### 8.2 GitHub #5 — Universal Reader vertical slice

這個 issue 應是 #2 研究結果**最優先的落地點**。

**Reader baseline 鎖定：**

- **Mobile：** 17px / 1.82 / 18–20px gutter / single-column。
- **Desktop：** 18px / 1.80 / 34em target measure / 約 600–640px 正文。
- JLREQ 建議橫組一行最大約 40 字，因此 **desktop 不能因為 viewport 變大而放大 measure**。
- 在 **desktop ≥ 約 1024px** 時才出現 collapsible TOC rail；更寬 viewport 才開 right marginalia slot。這個 slot **要「有 annotation 才存在」**，不能只是裝飾。
- **Mobile reader chrome 預設 hidden**；使用者有 navigation intent 時出現。這與 Apple Books 和 BOOK☆WALKER 已成熟使用的閱讀模式一致。
- **Progress 應綁 chapter/block anchors 與 semantic reading position**，而不是固定 page number。
- **Fixture book 必須真的覆蓋 `#3` 所有初始 block**，而不是只放兩段 lorem ipsum。尤其優先驗證：`dialogue → example → comparison → vocabulary → callout → exercise（含 inline answer reveal）→ authorNote → table`。因為真正會讓 Reader 崩掉的不是普通 paragraph，而是這些 blocks 串在同一章時的 **vertical rhythm**。
- **Exercise 採 inline reveal，不做 scoring system；dialogue 採 transcript，不做 message bubbles；comparison 在手機 stack，不把兩欄縮小；footnote interaction 完成後必須把 keyboard focus 還給原本 anchor。**
- **Reader settings V1 實作：** `文字サイズ / テーマ / 書体`。Apple Books 提供更完整的字體、spacing、background、justification 等設定，可作為未來 evolution benchmark，但本案第一版不需要一次複製。
- **#5 的 visual regression matrix 至少為：** 360 × mobile、390 × mobile、768 × tablet、1024 × compact desktop、1440 × wide desktop；並額外測 **200% text zoom / enlarged text-spacing、keyboard-only、dark theme、very long Japanese heading**。WCAG 要求 user text-spacing overrides 不造成內容或功能遺失。

### 8.3 GitHub #6 — Storefront / Book Detail / Preview / Library

- Storefront 第一版**不要實作 faceted search/filter architecture**。以 editorial feature + compact catalog 為主。一本書即使只有三本 inventory，也應像三本真的出版品，不應像三門線上課程。
- **BookCard 的封面比例必須由 book metadata 尊重原圖（`cover.width / cover.height`）；不要固定 crop 成相同 thumbnail ratio。** portrait 與非 portrait 封面都要測。BNN 這類出版社 detail page本身把 cover visuals 與完整 publication metadata 當作書的 identity。
- **Book Detail 明確定義四種 CTA state：**

  | Entitlement | Primary | Secondary |
  | --- | --- | --- |
  | Unowned + preview | 購入する | 試し読み |
  | Unowned + no preview | 購入する | — |
  | Owned + unread | 読み始める | 目次を見る |
  | Owned + progress | 続きを読む | 目次を見る |

  未來 ECPay 應只替換 purchase action backend，不應要求重新設計 BookDetail interaction model。
- **Preview 必須直接進 Universal Reader，並使用同一個 block rendering system。** Content contract 應有可表達 preview boundary 的 generic metadata（contract 定義見 §4.2），而不是 `if bookId === firstBook`。
- **Library 只顯示 owned books**；第一個 section 是 続きを読む。Progress 使用 subtle line / text；沒有 completion donut。初期只需要「最近読んだ順」，甚至不需要 filter。只採用 ownership、reading state 與 resume 這三個核心概念。

---

## 9. 最終設計決策

現在已經有足夠資訊開始 design implementation，**不需要再等另一輪 broad competitive research**。

尚需要做的工作是**設計驗證**，而不是更多方向性研究：第一個 Reader prototype 完成後，應拿真實的 2–3 章日文商務內容，在 iPhone Safari、Android Chrome、macOS Safari/Chrome、Windows Chrome/Edge 上做 typography QA；並讓至少幾名日本 native 大學生／年輕職場人士與 N1+ 外國專業人士實際閱讀，確認「這像我會付費買的專業數位書」而非「外國人教材」。這是對已確立方向的 validation，不是阻塞 #4–#6 的新 research dependency。

GitHub #2 要求的 visual direction、日本文 typography、Storefront／Library／Reader role、mobile vs desktop、block treatment、anti-pattern、initial tokens/components 都已可以轉化為 implementation decisions；也與 #1 的 Book-first invariants、#3 的 generic content model，以及 #4–#6 的既有 scope 一致。

```text
VERDICT: READY FOR DESIGN IMPLEMENTATION
```

---

## 附錄：Benchmark 來源

- ［新版］ポール・ランド、デザインの授業 | 株式会社ビー・エヌ・エヌ — https://bnn.co.jp/products/9784802511810
- Requirements for Japanese Text Layout - 日本語組版処理の要件（日本語版） — https://www.w3.org/International/jlreq/
- ブルータス | BRUTUS.jp — https://brutus.jp/
- 憐憫 電子書籍 作：島本理生 - EPUB | 楽天Kobo 日本 — https://www.kobo.com/jp/ja/ebook/X_Led81p6Deat5SaHgmZdQ
- ブラウザビューアの基本操作について教えてください | BOOK☆WALKER — https://help.bookwalker.jp/faq/3416
- 電子書籍の読み方について教えてください | BOOK☆WALKER — https://help.bookwalker.jp/faq/63
- Change a book's appearance in Books on Mac - Apple Support — https://support.apple.com/guide/books/change-a-books-appearance-ibks8923126d/mac
- Highlights, Tags, and Notes - Readwise Docs — https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes
- Stripe Press — Scaling People — https://press.stripe.com/purchase-scaling-people
- Relation between Reading Speed, Eye Movements, and Line Length in Japanese Electronic Text Reader | CiNii Research — https://cir.nii.ac.jp/crid/1390846637104169856
- Web Content Accessibility Guidelines (WCAG) 2.2 — https://www.w3.org/TR/WCAG22/
- noto-docs/docs/website/use.md | notofonts/noto-docs | GitHub — https://github.com/notofonts/noto-docs/blob/main/docs/website/use.md
- 〖マイブック〗マイブックの使い方について教えてください。 | BOOK☆WALKER — https://help.bookwalker.jp/faq/6325
- Read books in the Books app on iPhone - Apple Support — https://support.apple.com/guide/iphone/read-books-iphc1af7c57/ios
