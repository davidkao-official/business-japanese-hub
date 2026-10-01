# Business Japanese Hub — Design System「Source & Gloss」

> **狀態：canonical / 視覺與互動設計 authority（v1，2026-10-02）。**
>
> 本文件定義 Business Japanese Hub 整個產品（main frontend 與 Career Game）的視覺識別、typography、色彩、marks、shell／navigation、components、各 surface 的 presentation grammar、states 與 implementation sequence。
>
> **Authority 位置：** 產品、商業、IA、learning taxonomy、資料、security、payment 與 deployment 規則仍以 [`product-contract.md`](product-contract.md)、[`post-n1-learning-map.md`](post-n1-learning-map.md)、[`platform-architecture.md`](platform-architecture.md) 等上位文件為準。本文件只決定「看起來、讀起來、用起來」怎麼做；遇到衝突時以上位文件為準，並回到 Product Owner。
>
> **取代：** 先前的視覺方向——Quiet Editorial Modernism（#2 / #74、[`docs/design/visual-redesign-reference.md`](design/visual-redesign-reference.md)）、#77 Distinction-style LP、#155 Concept C「Modern Learning Platform」——**不再是視覺 authority**。它們的 palette、字體、間距、版面、component 外觀與「日本感」motifs 都不延續。保留的只有仍然成立的契約：已核准文案、accessibility、Reader typography 研究、#157 斷行規則、#156 四語系 i18n 行為（見 §15）。
>
> **Execution：** epic [#190](https://github.com/davidkao-official/business-japanese-hub/issues/190)（implementation sequence、owner questions）；Stage 0 defects [#191](https://github.com/davidkao-official/business-japanese-hub/issues/191)。每次 merge 到 `main` 都是潛在 production release（#186），需另行授權。
>
> **Reference compositions：** [`docs/design/reference/`](design/reference/)（靜態 HTML + 截圖）。執行 `python3 -m http.server 4810 --directory docs/design/reference` 後開啟 `http://localhost:4810/`。

---

## 0. TL;DR

Business Japanese Hub 的每一個學習單位其實都是同一個形狀：

```text
日文原文（要學會使用的東西） + 中文解說（為什麼、怎麼用） + 你自己的紀錄（作答、儲存、錯題）
```

新的視覺系統「**Source & Gloss**」只做一件事：讓這三層在每個畫面都清楚、一致、可信。

- **日文原文是主角。** 它放在白色的 **sheet** 上，用日本商業文件實際使用的明朝體角色排版；介面與解說退到桌面（desk）上。
- **兩種語言、兩種聲音，絕不混用字體。** 字體跟著 `lang` 走，不跟著頁面 locale 走；繁中永遠不再用日文字型排版。
- **唯一的裝飾是「工作上的標記」：** 螢光筆（marker）、丸数字 ①②③、赤入れ（correction ink）、〇／×。
- **用平實的數字說真話。** 只用題數與分數（3／5），資料不足就說「資料不足」；沒有 mastery %、streak、進度環。
- **每個畫面只有一個下一步。**
- **專注模式讓 chrome 退場**（練習 runner、Reader、課程練寫）。
- **手機是通勤用的 app，桌機是工作桌。** 手機有底部 tab bar；桌機用原文與解說並排。
- **同一個家族，不同的文法。** 各 mode 版面不同，但 tokens、字體角色、marks、components 完全共用，包括 Career Game。

---

## 1. Investigation — 為什麼要整個重做

### 1.1 從第一原理理解產品

- **受眾：** 已有 JLPT N2–N1 程度、以繁體中文為母語或主要支援語言的學習者，正在準備日本求職、讀日本商業資料，或已經在日本企業工作（[`product-contract.md`](product-contract.md) §1）。他們**讀得懂日文**；缺的是「在工作上用日文判斷、閱讀與表達」。
- **他們在意的是：** 能不能過選考、能不能在職場上不出錯、時間花得值不值得。情緒是焦慮而務實，不是「學日文好開心」。
- **產品實際交付的東西：** 一句在職場上該說的日文（Learn）、一段要讀懂的商業原文（Read）、一題日文出題的 Web Test（Practice）、一個職場情境中的選擇（Experience），以及這些行為留下的紀錄（My Learning）。
- **差異化不在外觀，而在內容的結構：**
  - Learn unit contract：`Situation → Judgment → Natural Japanese → Why → Practice → Transfer`（[`post-n1-learning-map.md`](post-n1-learning-map.md) §3.1、§5）。
  - Read loop：`text → vocabulary → logic → business context → comprehension → save`（§3.2）。
  - Practice 的 foreigners-first 差異化：作答後的 **checkpoint ladder——題意 → 表示 → 計算**，描述「哪一步沒通過」而不宣稱原因（[`spi-web-test-foreigners-first-research.md`](spi-web-test-foreigners-first-research.md) §9）。
  - Learning System：只呈現 deterministic、可解釋的 evidence；資料不足時誠實顯示（product contract §4.4、§7）。
- **結論：** 產品的 identity 早就存在於內容裡——**日文原文 + 中文解說 + 自己的紀錄**。先前的視覺方向都從「品牌氣質」出發（出版社、editorial LP、orange learning platform），沒有從這個結構出發，所以每換一次方向只換了某幾頁的外觀。

### 1.2 Live product audit（2026-10-02，`main` @ `ce31570`）

截圖存於 [`docs/design/reference/screenshots/`](design/reference/screenshots/)（`audit-live-*`）。

**A. 不是一個系統，而是三個疊在一起。**
首頁上半部是 #155 Concept C（暖白、橘色、Inter、圓角 pill、floating journey card）；中段是 Quiet Editorial（明朝大標、mono uppercase 英文 eyebrow、01/02/03 編號欄）；Read、Practice、My Learning、Plus 是第三種米色＋灰綠按鈕；Career Game 又是獨立的 dossier／case-file 樣式。同一頁有三種 heading 字體與三種按鈕形狀。（`audit-live-home-desktop.jpg`）

**B. 確認的 defects（與重設計無關，現在就是 bug）：**

| # | Defect | 證據 / 影響 |
| --- | --- | --- |
| B1 | **Reader 深色主題下 headings 幾乎不可見。** App appearance = Light、系統為 dark 時，`data-reader-theme="dark"` 但 chapter title／H2 仍使用 light token `rgb(29,29,26)`，落在深色背景上。 | `audit-live-reader-dark-headings.jpg`；WCAG 1.4.3 失敗。 |
| B2 | **繁體中文用日文字型排版。** `--font-sans` 以 Noto Sans JP／Hiragino Kaku Gothic 為首，`lang="zh-TW"` 的段落也套用；全形標點位置錯誤（「，」偏左下，看起來像逗號加空格）、部分漢字為日本字形。主要使用者是台灣讀者。 | Learn 課程頁、全站 zh-TW 文字；`audit-live-learn-mobile.jpg`。 |
| B3 | **手機版 Learn 的「儲存到 My Learning」區塊是約 280px 高的空盒。** | `audit-live-learn-mobile.jpg` |
| B4 | **首頁 hero 的「」括號孤立。** 桌機與手機都出現「成長為「 / 日本商業社會的日文」。」 | `audit-live-home-desktop.jpg` |
| B5 | **工程用語出現在使用者文案。** 「Web Test 作答 evidence」「Workplace Learn 教材儲存」「Seller name pending confirmation」（zh UI 中的英文）。 | My Learning、Footer。 |
| B6 | **zh／ja 介面內的英文導覽標籤。** `Learn / Read / Practice / My Learning / Experience` 在所有 locale 都是英文。 | Header、`src/app/productModes.ts`。 |

**C. Acquisition 路徑斷在登入牆。** SPI 是 acquisition（product contract §4.1），但匿名訪客需經過 `Web Test → SPI → 非言語 → 類別` 四層點擊，最後只看到「需要登入」（`audit-live-spi-signin-wall.jpg`）。沒有任何一題可以先試。這部分是 access／content 決策（#187、#107），但 UI 也放大了問題：四層 drill-down 每層都只有 2–4 個選項。

**D. Taxonomy drift。** 首頁的四張「pillar」卡片（Business Reading / Professional Vocabulary / Japan Literacy / Business Discussion）既不是五個 learning modes，也不是四個 product roles，也不是 capability domains——是第三套分類，並以 orange／purple／green／blue 上色。

**E. 學習介面沒有被設計。** SPI runner 幾乎是未樣式化的 HTML（radio、`<p>`、`<button>`）；checkpoint ladder 這個最有差異化的功能在畫面上只是一行「檢查點：未測量／資料不足」。Read 文章把日文原文、詞彙、論點分成三塊互不連結的區域。My Learning 是條列文字。

**F. 字體與語言角色從未被定義。** 同一個畫面上，日文標題、日文例句、中文說明、英文 eyebrow、數字各自隨意使用 serif、sans、mono。

**G. 方向反覆。** 2026-08 以來視覺方向被重新決定了三次（#2/#74 → #77 → #155），每次都只作用在特定 surface（Library、LP、homepage），從沒有一份覆蓋全產品的 design authority。這就是「各頁分別上妝」的根本原因。

---

## 2. Design thesis：Source & Gloss（原文與解說）

> **The Japanese is the material. Everything else serves it.**

一個比喻貫穿全系統：**工作桌（desk）上放著文件（sheet），學習者在文件上做標記，旁邊是解說，最後留下紀錄。**

| 層 | 是什麼 | 視覺處理 |
| --- | --- | --- |
| **Source／原文** | 要學會使用的日文：關鍵表達、例句、商業原文、題目、案例台詞 | 白色 sheet、明朝體角色、最大的字級與最多的留白、genre label（例句／原文／題目） |
| **Gloss／解說** | 為什麼、怎麼用、注意什麼（繁中為主） | 在 desk 上、使用讀者本身語言的黑體、與原文以丸数字連結 |
| **Record／紀錄** | 作答、錯題、儲存、觀察 | 平實的列（rows）、tabular 數字、〇／×、誠實的「資料不足」 |
| **Marks／標記** | 把三層連起來 | marker、①②③、赤入れ、〇× |

這不是 metaphor 裝飾；它直接對應 data contracts：`whatToSayJapanese` / `japaneseMaterial.text` / `promptJa` 是 Source；`*ZhTW` 欄位與 support overlays 是 Gloss；attempts / review queue / saves 是 Record。

---

## 3. Principles

1. **原文是主角。** 每個 surface 先問「這頁的日文原文是哪一段？」——它得到最好的排版與最多的空間。
2. **兩種語言、兩種聲音。** 日文原文與中文解說在字體、位置、顏色上可區分；每個文字節點都有正確 `lang` 與對應字體。
3. **只有工作上的標記，沒有裝飾。** 不用和風 motif、漸層、glass、插畫填空。
4. **用平實的數字說真話。** 分數必附樣本數；資料不足是被設計過的狀態，不是錯誤。
5. **一個下一步。** 每個畫面結尾只有一個 primary action。
6. **專注時 chrome 退場。** 作答、閱讀、練寫時隱藏 global navigation。
7. **通勤用手機、工作用桌機。** 手機單手、短組練習；桌機原文與解說並排。
8. **同一個家族，不同的文法。** Mode 之間版面可以不同，但 tokens、字體角色、marks、components 一致。

---

## 4. Identity system

Token 規格：[`docs/design/reference/tokens.css`](design/reference/tokens.css)（命名描述角色，不描述外觀）。

### 4.1 Surfaces

- **desk**（app 背景）：中性淺灰，不是米色、不是暖白——日本職場文件是白紙，不是書頁。
- **sheet**（白紙）：**只承載日文原文**與少數需要被視為「文件」的物件（價格方塊、下一步）。1px hairline、6px radius、無陰影。
- **sheet-sunk**：計算過程、目標說明等次要容器。
- 列表（類別、錯題、儲存）是 **rows with rules**，不是卡片。卡片只保留給 sheet。

### 4.2 Color roles

| Token | Light | Dark | 用途 | 對比（實測） |
| --- | --- | --- | --- | --- |
| `desk` | `#F4F4F1` | `#111215` | App 背景 | — |
| `sheet` | `#FFFFFF` | `#1A1C21` | 原文紙面 | — |
| `sheet-sunk` | `#EDEDE8` | `#15171B` | 次要容器 | — |
| `ink` | `#1B1D23` | `#ECECE7` | 文字、primary action、focus | 16.9:1 / 14.4:1 on sheet |
| `ink-2` | `#464A54` | `#B9BBC1` | 次要文字 | 8.9:1 / 8.9:1 |
| `ink-3` | `#61666F` | `#8E919A` | caption、metadata | ≥4.9:1 on every light surface / ≥5.4:1 dark |
| `rule` | `#DCDCD5` | `#2D3037` | 裝飾性分隔線 | 非資訊性 |
| `rule-control` | `#878A84` | `#6E727C` | input、choice、chip 邊框 | ≥3.1:1（WCAG 1.4.11） |
| `marker` | `#FFE35A` | `#6A5A12` | 螢光筆底色 | ink on marker 13.1:1 / 5.75:1 |
| `marker-soft` | `#FFF4B8` | `#3A3418` | Plus chip、選取底色 | — |
| `ok` 〇 | `#1E7549` | `#58C793` | 正確、通過 | 5.7:1 / 8.1:1 |
| `ng` × | `#BE3219` | `#FF8069` | 錯誤、未通過、赤入れ | 5.7:1 / 6.9:1 |

規則：

- **Primary action = ink**（深色按鈕、白字；dark mode 反轉）。Marker **永遠不是按鈕色**。
- 沒有 brand orange，沒有分類彩虹色，沒有漸層。顏色只有語意：marker（重要的日文）、ok、ng。
- Marker 對 sheet 的非文字對比只有 1.3:1，因此 **marker 永遠不是唯一訊號**：必須搭配丸数字、可存取名稱或文字。
- System / Light / Dark 三態保留；Reader theme 必須使用同一組 role tokens（修正 B1）。

### 4.3 Typography：三種聲音

字體跟著 `lang` 走（`:lang()` 規則，見 tokens.css 結尾）。**V1 只使用系統字體，不載入 CJK webfont**（mobile performance gate，#96 / #77；Windows 10+ 內建 BIZ UD fonts、Apple 內建 Hiragino / PingFang）。

| 聲音 | 用途 | Stack（Latin 先、再 locale CJK） |
| --- | --- | --- |
| **原文 Source**（`.material:lang(ja)`） | 日文關鍵表達、例句、商業原文、題目、Reader 正文預設 | Hiragino Mincho ProN → BIZ UDPMincho → Yu Mincho → Noto Serif JP／CJK JP → 退回日文黑體 |
| **日文介面／日文標題**（`:lang(ja)`） | ja locale 介面、日文課名、日文選項 | Hiragino Sans → Hiragino Kaku Gothic ProN → BIZ UDPGothic → Yu Gothic UI → Meiryo → Noto Sans JP |
| **繁中 Gloss／介面**（`:lang(zh-Hant)`、`:lang(zh-TW)`） | 解說、介面、標題 | PingFang TC → Noto Sans TC → Microsoft JhengHei |
| **簡中**（`:lang(zh-Hans)`、`:lang(zh-CN)`） | zh-CN locale | PingFang SC → Noto Sans SC → Microsoft YaHei |
| **English** | en locale、品牌字 | Helvetica Neue → Segoe UI → Roboto → system-ui |

**為什麼原文用明朝角色：** 日本企業正式文件、決算短信、報紙與長期以來 Word 的預設日文字型都是明朝；台灣學習者熟悉的日文教材也以明朝排日文、以黑體排說明。這是功能性的角色分派（「這是你要學的那段日文」），不是 editorial 風格——**標題與介面永遠不用明朝**。

Scale（16px root，CJK 字距一律 0）：

| Token | 值 | 用途 |
| --- | --- | --- |
| `size-display` | clamp(28px → 44px) / 1.3 / 700 | 僅首頁與 Plus hero |
| `size-title-1` | clamp(26px → 36px) / 1.4 / 700 | 頁面標題 |
| `size-title-2` | 22px / 1.4 / 700 | 區段標題 |
| `size-title-3` | 18px / 1.5 / 700 | 小標 |
| `size-body` | 16px / zh 1.8・ja 1.75 | 內文 |
| `size-small` | 14px | 次要內文 |
| `size-caption` | 13px（最小資訊字級） | metadata |
| `size-material-key` | clamp(20px → 26px) / 1.85 | 關鍵表達 |
| `size-material` | 18px / 1.95 | 原文、題目、例句 |

規則：

- Measure：zh 內文 ≤ 38em；原文 ≤ 34em（JLREQ ≤ 40 字，見 [`ui-ux-research.md`](ui-ux-research.md) §3）。
- 所有數字（題數、分數、價格、日期、計時）使用 tabular numerals。
- **禁止** uppercase mono 英文 eyebrow；label 用 locale 文字、caption 字級、`ink-3`。
- 斷行沿用 #157：UI label 不換行；headings `word-break: auto-phrase` + `line-break: strict` + `text-wrap: balance`；**authored 的 zh／ja display heading 一律提供 phrase atoms**（`auto-phrase` 目前只對日文有效，中文必須靠 authored phrase），不手動塞 `<br>`。
- 丸数字 ①②③ 使用真正的字元（不是 inline-block 盒子），讓 kinsoku 規則保持有效（修正 B4 類問題）。

### 4.4 Marks（唯一的裝飾）

| Mark | 來源 | 語意 | 規則 |
| --- | --- | --- | --- |
| **Marker 蛍光** | 學生與上班族在紙本文件上畫重點 | 「這段日文是重點」 | 下半部色帶（約 0.52–0.92em）。只用在 Japanese source；非原文頁面（首頁、Plus）最多一個關鍵中文片語。必須是 deterministic 的：作者標註的範圍，或與 vocabulary／key term `surface` **完全一致**的字串。**不可猜測。** |
| **丸数字 ①②③** | 日本文件的箇條書き | 原文片語 ↔ 解說的連結 | 原文中與解說清單同號；screen reader 以 `aria-label="注1"` 或清單連結呈現。 |
| **赤入れ correction ink** | 日本職場上司的紅筆修改 | 錯誤、NG 用法、未通過的檢查 | 刪除線／波浪底線＋正確寫法；必附文字。 |
| **〇 ×** | 日本考試與 ○×表 | 正確／錯誤、通過／未通過 | 永遠搭配文字（「通過」「答錯了」）；「未測量」使用虛線圓。 |
| **Genre label** | 文件的種類 | 告訴學習者這是哪一種日文 | sheet 左上：`例句`、`原文`、`題目`、`關鍵表達` ＋ 情境（「對主管・口頭或聊天訊息」）。 |

### 4.5 Shape、space、elevation、motion

- Radius：sheet 6px、control 8px、chip 4px。**不使用 pill**（除了 segmented control 外框）。
- Space：4-based（4/8/12/16/24/32/48/64/96）；gutter `clamp(16px, 4vw, 40px)`；content max 1200px。
- Elevation：預設無陰影。只有 overlay（選單、bottom sheet、dialog）使用 `shadow-overlay`。
- Motion：120–180ms `cubic-bezier(.2,0,0,1)`；回饋出現時 marker 可 260ms 由左至右刷上。`prefers-reduced-motion` 全部歸零。不做 parallax、floating、scroll reveal。

### 4.6 Iconography 與 imagery

- 1.6px stroke 線性 icon，只用在 tab bar、關閉、方向、外部連結。不用 emoji、不用彩色 icon tile。
- **不需要照片或插畫才成立。** 首頁 hero 的視覺就是一段真的日文原文 sheet。未來若加入影像，必須是自有素材，且不可是 stock 人物充當品牌（#155 已有同樣要求）。
- Book cover art 是 Book 的內容資產（book-level identity），只出現在 Read 的長篇／書籍頁，不出現在平台 chrome。

### 4.7 Brand mark 與命名

- 參考稿使用暫定 glyph：墨色方塊內的「 」與一道 marker——直接取自品牌承諾「從『日文檢定的日文』，成長為『日本商業社會的日文』」。正式 logo 需另行設計（Q3）。
- Wordmark 建議全 locale 統一為 **Business Japanese Hub**（目前 zh-TW 顯示「商務日語中心」、ja 顯示「ビジネス日本語ハブ」，同一品牌三種名字）。需 Owner 確認（Q3）。

---

## 5. Shell & navigation

### 5.1 Header（≥ 960px）

`[glyph + Business Japanese Hub] [課程 閱讀 練習 我的學習 體驗] ……… [Plus chip] [語言] [登入／帳戶]`

- 高 64px；目前所在 mode 以粗體＋marker 底線表示（非僅顏色）。
- Appearance 控制維持在 footer（#155 已決定）。
- 語言選單維持 #156 的行為（roving tab stop、Escape、breakpoint close、persisted locale）。

### 5.2 Localized mode labels（D8）

Canonical mode IDs 與 routes 不變；**顯示名稱依 locale 在地化**：

| Mode ID | zh-TW | zh-CN | ja | en |
| --- | --- | --- | --- | --- |
| `learn` | 課程 | 课程 | 学ぶ | Learn |
| `read` | 閱讀 | 阅读 | 読む | Read |
| `practice` | 練習 | 练习 | 練習 | Practice |
| `my-learning` | 我的學習 | 我的学习 | マイ学習 | My Learning |
| `experience` | 體驗 | 体验 | 体験 | Experience |

### 5.3 Mobile（< 960px）

- Header 56px：glyph + wordmark + 登入／帳戶。
- **底部 tab bar**：`課程 / 閱讀 / 練習 / 我的學習 / 更多`。「更多」開啟 sheet：體驗（Career Game，另一個 origin）、Plus、關於、語言、外觀、法律資訊。
- Safe-area inset、44px 最小點擊區、目前 tab 以粗體＋marker icon 底表示。
- Tab bar 在專注模式中隱藏。

### 5.4 Focus mode（runner、Reader、課程練寫）

- 56px focus bar：`[× 結束] [context title] [第 2／5 題 或 計時]` + 3px 進度條。
- 隱藏 header、tab bar、footer。主要動作固定在底部 action bar（手機）。
- 結束一律回到進入點，不丟失作答紀錄（行為沿用 runner 既有 persistence contract）。

### 5.5 Footer

品牌一句話、mode 連結、Plus／關於、法律資訊、外觀 segmented control、販售者資訊。販售者 placeholder 必須在地化（B5）。

---

## 6. Components

Reference CSS：[`docs/design/reference/reference.css`](design/reference/reference.css)。實作時落在 `src/components/` 的共用 primitives，**不得每頁各自複製**。

| Component | 職責 | 關鍵規則 |
| --- | --- | --- |
| `Button` | primary（ink）／quiet（outline） | 48px 高（sm 36px）；label 不換行；一個畫面最多一個 primary |
| `TextLink` | 次要導向 | 永遠有底線 |
| `AccessChip` | `免費`／`Plus`／`需登入` | 文字 chip；Plus 用 marker-soft；access 由 server 判定，chip 只是呈現 |
| `Sheet` | 日文原文容器 | genre label 必填；內容 `lang="ja"` |
| `Material` | 原文文字 | 明朝角色；`--key` 變體用於關鍵表達 |
| `Mark` | marker | 只接受 authored range 或 exact-match surface |
| `GlossList` | ①②③ 解說清單 | 與原文丸数字同號 |
| `ChoiceRow` | 單選／複選選項 | ≥52px；A–E key；選取＝2px ink 邊框＋填色 key；結果＝ok／ng 色＋文字 flag。Practice 與 Career Game 共用 |
| `ResultMark` | 〇／×／未測量 | 必附文字 |
| `CheckpointLadder` | 題意 → 表示 → 計算 | 每步顯示問題與 ResultMark；附「這是觀察，不是原因判定」 |
| `ObservationTable` | 類別 × 正確／作答 | tabular 分數；n < 5 顯示「資料不足」，不顯示比率 |
| `NextStep` | 單一建議行動 | 說明理由（deterministic rule），一個按鈕 |
| `ListRow` | 類別、錯題、儲存 | 規則線分隔、標題＋meta＋尾端動作 |
| `StatePanel` | 空、資料不足、登入、需 Plus、錯誤、過期 | 虛線框、標題、一句說明、一個動作 |
| `Tabs` | 儲存類型等 | 2px ink 底線 |
| `BottomSheet` | 手機上點選 mark 顯示解說 | 拖曳 handle、Escape／返回關閉、focus 回到 mark |
| `Field` | input／textarea | `rule-control` 邊框；說明文字說清楚「不會儲存或評分」等事實 |

---

## 7. Surface grammars

每個 surface 以 reference composition 為準；以下是不可省略的結構。

### 7.1 首頁（public）— [`home.html`](design/reference/home.html)

1. **Hero：** 誰適合（kicker）→ 已核准 h1「從「日文檢定的日文」，成長為「日本商業社會的日文」。」（zh-TW 字句不可改，#155）以 marker 標出後半 → lead → `免費試做 SPI 題目`（primary，Q4）＋`了解 Plus 會員`。
   右側是 **specimen sheet**：一段真實的職場日文（目前取自已公開的 non-proprietary 教學範例），附 marker、①②③ 與中文解說，並連到該課程。它取代 floating「Learning Journey」卡片——訪客第一眼看到的就是產品的方法。
2. **Journey coverage：** canonical journey 五階段（準備日本求職 → 通過選考 → 進入日本企業 → 適應日本職場 → 持續提升）× 實際內容（練習／閱讀／課程／體驗）的覆蓋帶。取代四張非 canonical 的 pillar 卡片。
3. **Learning state：** product contract §4.4 的四個問題＋一個標示「示意」的 checkpoint ladder。
4. **Plus offer：** NT$299／月 Early Access＋「準備中，尚未開放付款」（依實際狀態）。
5. **Founder：** David Kao 的真實經歷＋連到關於頁。
- 移除：四張 pillar、`書本結構`／`表達範例`／`書籍選讀` editorial 區塊（Books 移到 Read）。

### 7.2 練習 hub（日本求職網路測驗刷題）— [`practice.html`](design/reference/practice.html)

- 一頁呈現 SPI 的 **非言語／言語 兩欄類別 rows**（名稱、題數、模式、上次結果），每列直接「練習」。
- 已登入：右上 `NextStep`（複習錯題／繼續上次）。
- 第一次來：連到「SPI 是什麼」explainer。
- `/practice/web-test/:family` 與 `/:family/:domain` routes 保留為 deep link／filtered view，不再是必經步驟（D11）。
- 獨立性聲明以 caption 保留。

### 7.3 練習 runner — [`runner.html`](design/reference/runner.html)

**Question state：** focus bar → `題目` sheet（明朝 `promptJa`、representation）→ `ChoiceRow` ×N → 固定底部「送出答案」。
**Feedback state（桌機兩欄、手機單欄）：**
- 左：結果（× 答錯了 + 你的答案／正確答案）→ 題目 sheet 重現，**以 overlay `keyTerms.surface` 完全比對**標出條件 ①②③ → 選項結果。
- 右：這題在問什麼（`whatIsAsked`）→ 怎麼列式（representation／solution）→ 常見誤讀（`commonMisread`，赤入れ左線）→ **理解檢查 ladder**（題意／表示／計算 + 〇×／未測量）→ 「已儲存作答；已加入錯題複習」→ 下一題。
- Checkpoint 問答本身沿用 runner 既有流程（逐一作答），ladder 是結果摘要。
- Timed mode（尚未發布）：計時顯示在 focus bar 右側，不遮題目、不閃爍；超時以文字標示。
- 完成頁：正確題數／作答時間／ladder 彙整＋一個 NextStep。

### 7.4 SPI explainer（SEO editorial）

長文 zh 排版、measure 38em、David 觀點以 founder commentary 區塊呈現（左側 2px ink 線＋署名），內文中的日文用語套用 Source 角色；結尾一個 CTA 到練習 hub。

### 7.5 課程（日本職場實戰）lesson — [`learn.html`](design/reference/learn.html)

順序依 Learn unit contract：`breadcrumb → 日文課名＋日文 lead → 學完你能（learningObjective）→ 情境 → 先判斷 → 這樣說（關鍵表達 sheet＋why）→ 換個情境（examples）→ 語氣與關係（caution）→ 換你寫寫看（rewrite，標明不儲存不評分）→ 帶走這一句（transferTakeaway）`。
- 桌機右側 rail：儲存（Plus）、段落目錄、本課語彙卡。手機：儲存移到標題下方，語彙卡移到文末。
- 關鍵表達的 marker：目前只有 related vocabulary 的 exact match 可自動標註（例：見込み）；完整 ①②③ 需要內容契約支援 authored ranges（Q6）。

### 7.6 職場語彙 entry

語彙（明朝大字）＋讀音 → 詞義 → 職場語感 → 使用情境／語域／對人關係（定義列表）→ 例句 sheet → 注意 → 相關課程。Ruby 只在作者標註時使用（沿用 ui-ux-research §3.8）。

### 7.7 閱讀 landing

類別 tabs（商業新聞／企業與 IR／產業報告／政府資料／商務文件）＋文章 rows（標題、摘要、來源、Free／Plus）。Plus 文章為空時用 StatePanel 誠實說明。長篇書籍以「長篇閱讀」區段列出（Books 是 Read 的一種格式）。

### 7.8 閱讀 article — [`read.html`](design/reference/read.html)

- 桌機：左 **原文 sheet（sticky）**，右 解說欄（讀解說明 → 詞彙 ①②③ → 論點脈絡 → 商務背景 → David 觀點 → 接著學）。
- 原文中：vocabulary `term` 以 exact match 標 marker＋丸数字；`logicAnalysis.japaneseText` 若能 exact match 到某句，該句左側顯示論點標籤（現況／措施／效果）。無法 match 時只在右欄列出，不猜。
- 手機：原文在上；點 mark 開 BottomSheet 顯示該詞解說；其餘段落依序排列。
- 來源 citation 與權利說明以 caption 置於原文下。

### 7.9 Books、Universal Reader、Library

- Reader 是 focus mode：focus bar（返回、章名、目錄、顯示設定）＋正文。正文預設 Source 明朝角色（可切黑體），測量規格沿用 ui-ux-research §3；**Reader theme 必須使用 role tokens，修正 B1**。
- Book detail 是 Read 下的長篇頁：封面（book-level art）＋目錄＋試讀。購買 CTA 是否保留見 Q5。
- 我的書庫（Library）沿用 rows 文法，主要動作「繼續閱讀」。

### 7.10 我的學習 — [`my-learning.html`](design/reference/my-learning.html)

`我的學習（說明只根據實際紀錄）→ NextStep（一個）→ 左：錯題複習、儲存的內容（tabs） → 右：觀察（ObservationTable）、理解檢查（各步驟 未通過／檢查次數）、最近作答（〇×）`。
- 所有數字都是 `x／n`；n < 5 → 「資料不足」。
- 不顯示 mastery %、streak、進度環、總分、AI 診斷。
- 理解檢查彙整需要擴充 read model（#109 延伸，Q7）；未實作前不顯示該區塊。
- Signed-out／非會員／會員狀態無法確認：各用 StatePanel，沿用既有 fail-closed 行為。

### 7.11 Plus — [`plus.html`](design/reference/plus.html)

Hero（「不只多幾篇內容，而是記得你做過什麼。」）＋價格方塊（Early Access NT$299／月、真實狀態、無年繳）→ Plus 回答的四個問題 → Free vs Plus 表（必須由 #107 access matrix 產生，不手寫承諾）→ 適合誰。不顯示 NT$399 為現價、不發明 trial／折扣（#127）。

### 7.12 體驗（Experience）與 Career Game

- Main site `/experience`：案例清單 rows（case 名稱、一句情境、免費），連到 Career Game origin。
- Career Game 保留自己的 narrative grammar（case、scene、choice、outcome、feedback），但改用共用 tokens：台詞放在 Sheet（說話者 label＋明朝原文）、選擇使用 `ChoiceRow`、結果使用 〇×＋解說、案例清單使用 rows。移除 mono typeface 與雙框 dossier 邊框。仍是獨立 artifact／release（D16）。

### 7.13 關於、法律、Auth、404

- 關於：#72 已核准文案逐字保留；核心問題「N1 之後，我要怎麼讓日文真正變成工作能力？」以 display 尺寸＋單一 marker 強調；長文 zh measure 38em。
- 法律：純文字長文排版，`lang` 依文件語言；zh-CN 顯示 zh-TW 文件時的 fallback notice 沿用 #156。
- Auth panel：單欄 Field、primary 一個；錯誤以文字＋ng 色。
- 404：一句話＋回首頁／練習。

---

## 8. States & truthfulness

| State | 呈現 | 文案原則 |
| --- | --- | --- |
| Signed-out | StatePanel＋登入／建立帳戶 | 說明登入後「能做什麼」，不暗示已有紀錄 |
| Plus required | StatePanel＋登入／了解 Plus | 「會員狀態只由伺服器判定」；client 永不推斷 access |
| Membership unavailable | StatePanel＋重試 | 不用本機資料替代 |
| Loading | 結構化 skeleton（與最終版面同尺寸），不是 spinner 牆 | — |
| Empty | StatePanel＋一個起點 | 「還沒有…」＋下一步 |
| Insufficient data | dotted marker＋「資料不足」＋還差多少 | 不顯示比率 |
| Stale / version changed | StatePanel＋重新載入 | 說明題目版本已更新 |
| Error / save failed | inline `role="alert"`＋重試 | 說「無法確認是否已儲存」，不假裝成功 |

---

## 9. Content & voice

- **zh／ja 介面中不出現英文 label**，除了品牌（Business Japanese Hub、Plus）與專有名詞（SPI、JLPT、Career Game 案名）。
- **禁用工程用語：** evidence、runtime、projection、Workplace Learn、Web Test 作答 evidence、payload、release identity。改用：作答紀錄、日本職場實戰、文章、課程、語彙。
- 語氣：冷靜、直接、像資深同事；不用驚嘆號、不用「超簡單」「立刻精通」。
- 描述觀察而不是診斷：「表示步驟未通過較多」而不是「你的弱點是邏輯」。
- 日文原文必須自然、職場真實；示意題與範例需標示「示意」或「架空範例」。

---

## 10. Accessibility contract

- WCAG 2.2 AA：文字 ≥ 4.5:1、控制元件邊界 ≥ 3:1（§4.2 實測值）。
- Marker、顏色、〇× 皆不得單獨承載意義。
- 每個文字節點正確 `lang`；跨語言片段用 nested `lang`（沿用 ui-ux-research §3.5）。
- Focus：2px ink outline + 2px offset + marker halo；focus mode 進出時 focus 移到標題。
- 點擊區 ≥ 44px；ChoiceRow ≥ 52px。
- Text spacing override（1.4.12）不得造成截斷；UI label nowrap 時容器必須能換行。
- `prefers-reduced-motion`、System／Light／Dark、200% zoom 不失功能。
- Landmarks：只有一個 banner；focus mode 仍保留 `main`。

---

## 11. Responsive model & QA matrix

- Breakpoints：`< 600`（手機）、`600–959`（大手機／平板直向，仍用 tab bar）、`≥ 960`（桌機 header＋並排版面）。
- 手機不是縮小的桌機：並排版面改為原文在上、解說在下；rail 內容重新安排位置。
- **每個 stage 的 QA matrix：** 4 locales × System/Light/Dark × 360 / 390 / 768 / 1024 / 1440；檢查 document horizontal overflow、label 截斷／換行、phrase 斷行、contrast、focus 路徑、`lang`／字體對應（用 computed font-family 抽查 zh 與 ja 節點）。
- Lighthouse mobile Performance／Accessibility 不得低於 stage 前 baseline（#77 / #96 gate）。
- 本機 browser／build 只是 functional／visual QA，**不是** private-content artifact admission（AGENTS.md）。

---

## 12. Implementation sequence

每個 stage 是一個 bounded issue／PR，依 #166 serial loop（Sol → Luna → Oracle/ego-lite）。**每次 merge 到 `main` 都是潛在 production release**（AGENTS.md、#186），需另行取得 deployment owner 授權。

| Stage | 範圍 | 主要檔案 | 依賴 | Acceptance 重點 |
| --- | --- | --- | --- | --- |
| **S0 Defects** | 修 B1–B5（Reader heading tokens、`:lang()` 字體、Learn 手機儲存空盒、hero phrase atoms、使用者文案工程用語） | `src/styles/tokens.css`、`global.css`、`reader.css`、`src/workplace-learn/workplace-learn.css`、`HomePage.tsx`、`MyLearningPage.tsx`、`src/i18n/strings.ts`、`Footer.tsx` | 無；可在 Owner 確認前先做 | 四 locale 文字 computed font 正確；Reader 三種 theme 組合 headings ≥ 4.5:1 |
| **S1 Tokens** | 引入 role tokens（light/dark）、type roles、compat aliases（舊 `--color-*` 暫時映射到新 roles）；移除 `--home-*` scoped tokens | `src/styles/tokens.css`、`lp-tokens.test.ts` | Q1 | 對比表以測試鎖定；不改版面時視覺差異只有色彩／字體 |
| **S2 Shell** | Header、在地化 mode labels、手機 tab bar＋更多 sheet、focus-mode bar、footer | `Header.tsx`、`Navigation.tsx`、`Layout.tsx`、`Footer.tsx`、`LanguageControl.tsx`、`AccountControl.tsx`、`productModes.ts`、i18n | S1、Q2 | 保留 #156 鍵盤／focus／inert 行為；1440 單列 header；360 無 overflow |
| **S3 Primitives** | §6 components 進 `src/components/`；共用 CSS | 新 `src/components/ui/*`、`src/styles/components.css`；替換 `PlusAccessBoundary` 外觀 | S1 | Storybook-free：以 component tests＋reference 對照 |
| **S4 Practice** | Hub 扁平化、runner 兩態重做、key-term marks、checkpoint ladder、完成頁、底部 action bar | `WebTestHubPage.tsx`（拆出 runner components）、新 practice CSS | S2、S3；匿名試做依 Q4 | 不改 persistence／access contract；手機無水平捲動 |
| **S5 Home / Plus / About** | 新首頁組成、Plus、About 套新系統；刪除 Concept C 與 editorial 首頁區塊 | `HomePage.tsx`、`homeEditorial.ts`、`PlusPage.tsx`、`AboutPage.tsx`、i18n、刪 `home-concept-c.css`、`editorial-v2.css` 對應段落 | S3、Q1、Q4 | 已核准文案逐字保留；無虛構數據 |
| **S6 My Learning** | NextStep、錯題、觀察（x／n、資料不足）、儲存 tabs | `MyLearningPage.tsx` | S3；理解檢查彙整依 Q7 | 無 mastery／%／streak；fail-closed 狀態保留 |
| **S7 Learn** | Lesson 重排＋rail、語彙 entry、landing rows | `src/workplace-learn/pages.tsx`、`workplace-learn.css`、`LearnUnitPage.tsx` | S3；完整 marks 依 Q6 | 依 Learn unit contract 順序 |
| **S8 Read** | Landing、article 原文 sheet＋exact-match marks＋論點標籤、手機 bottom sheet | `ReadLandingPage.tsx`、`ReadDetailPage.tsx`、`reading.css` | S3 | 不 match 不標；private delivery boundary 不變 |
| **S9 Reader / Books / Library** | Reader focus bar 與 type roles、Book detail、Library rows | `src/reader/*`、`reader.css`、`BookPage.tsx`、`LibraryPage.tsx`、`shop.css` | S1–S3、Q5 | Reader 設定與 reading position contract 不變 |
| **S10 Career Game** | 共用 tokens、ChoiceRow、Sheet 台詞、rows | `apps/career-game/src/shell.css`、`App.tsx` | S1、S3、Q10 | 獨立 artifact；scenario runtime 不動 |
| **S11 Cleanup & QA** | 刪除死 CSS、禁止 token 外 raw hex 的 lint、完整 QA matrix、Lighthouse | `src/styles/*` | 全部 | §11 matrix 全綠 |

S0 不依賴任何 Owner 決策，應優先；S4 是商業價值最高的重設計（acquisition 轉換點）。

---

## 13. Decision log

| ID | Decision | 理由 | 取代 |
| --- | --- | --- | --- |
| D1 | 先前所有視覺方向不再是 authority | 三次局部方向造成三套系統並存 | #2/#74 Quiet Editorial、#77、#155 Concept C 的視覺部分 |
| D2 | Thesis：Source & Gloss | identity 來自內容結構，而非品牌氣質 | — |
| D3 | 字體跟著 `lang`；日文原文＝明朝角色；zh＝TC 黑體 | 修正 B2；原文與解說可區分；與日本商業文件與教材慣例一致 | 全站 JP-first `--font-sans` |
| D4 | V1 不載入 CJK webfont | mobile performance gate；系統字體品質足夠 | — |
| D5 | Palette：desk／sheet／ink＋marker＋ok／ng；退役 orange 與分類色 | 顏色只承載語意；orange 在台灣教育／求職平台高度同質化 | #155 color tokens |
| D6 | Primary action = ink；marker 不做按鈕 | marker 的意義必須單一 | — |
| D7 | Marks 只能來自 authored ranges 或 exact match | Learning System 不得猜測（product contract §4.4、§11） | — |
| D8 | Mode 顯示名稱在地化，ID／routes 不變 | 修正 B6；zh／ja 介面不夾英文 | #108／#155 Stage 3 的英文 label 決定 |
| D9 | 手機底部 tab bar（4 modes＋更多） | 通勤單手；Experience 是另一個 origin，放在「更多」 | 手機 hamburger-only |
| D10 | Runner／Reader／練寫使用 focus mode | 作答與閱讀時 chrome 退場 | — |
| D11 | Practice hub 一頁呈現所有類別 | 四層 drill-down 傷害 acquisition | family／domain 必經頁 |
| D12 | 首頁改為 specimen＋journey coverage＋learning state＋Plus＋founder | 讓首屏展示方法本身；移除非 canonical taxonomy | Concept C hero、四 pillars、editorial 區塊 |
| D13 | My Learning 只用 x／n 與「資料不足」 | product contract §4.4；不做假 mastery | — |
| D14 | 文案禁用工程用語與 UI 內英文 label | 修正 B5、B6 | — |
| D15 | Wordmark 建議統一為 Business Japanese Hub | 一個品牌一個名字 | locale 別品牌名（待 Q3） |
| D16 | Career Game 共用 tokens／components，保留 narrative grammar | 同一家族、不同文法 | Career Game dossier 視覺 |
| D17 | 列表用 rows；卡片只給 sheet | 避免 generic SaaS card grid | — |

---

## 14. Unresolved questions（需要 Owner／其他 lane 決定）

| ID | 問題 | 影響 stage | 建議 |
| --- | --- | --- | --- |
| Q1 | Founder 是否確認以 ink＋marker 取代 #155 選定的 orange？ | S1、S5 | 建議確認；理由見 D5。S0 不受影響。 |
| Q2 | §5.2 在地化 mode labels 的最終用字 | S2 | 採用表列建議；可逆 |
| Q3 | 品牌名稱是否全 locale 統一為 Business Japanese Hub？正式 logo 由誰設計？ | S2 | 統一 wordmark；暫用參考 glyph |
| Q4 | 匿名訪客能否先試做 SPI（free sample 範圍，#187／#107） | S4、S5 | 首頁 primary CTA 依此決定；未決前導向 hub＋誠實的登入說明 |
| Q5 | 歷史單本 Book 購買 CTA（USD 12）在 Book detail 是否保留 | S9 | 待 commerce 決策；保留歷史 entitlement 不變 |
| Q6 | 內容契約是否加入 authored annotation ranges（Learn 關鍵表達、Read logic segments） | S7、S8 | 需另開 content-contract issue；未加入前只用 exact match |
| Q7 | My Learning 的理解檢查彙整 read model 與門檻 | S6 | 屬 #109 延伸；未實作前不顯示 |
| Q8 | Android 無明朝字體時接受退回黑體，或只為原文載入 subset webfont | S1 | 先接受 fallback；有量測證據再議 |
| Q9 | 是否需要自有攝影／插畫 | — | 不需要；如需要必須自有 |
| Q10 | Career Game 視覺遷移時程（獨立 release） | S10 | 排在主站之後 |
| Q11 | Timed practice 的計時 UI 細節 | S4 | 等 timed mode 真正發布時以真實題目驗證 |

---

## 15. 延續與取代

**延續（仍有效）：**

- [`ui-ux-research.md`](ui-ux-research.md) 的 Japanese typography 研究：§3（measure、line-height、不全域 tracking、不強制 justify、`lang` ownership、斷行策略、和歐混植、ruby 克制）、Reader 的 hidden-by-default chrome 與 progressive settings、accessibility 要求。
- `ui-ux-research.md` 中被其他文件引用的**行為契約**：§4.2 Preview boundary、§4.4 resume-state、§8.3 entitlement CTA states（見 `accounts-and-entitlement.md`、`authoring.md`）。新系統只改變它們的外觀，不改變行為。
- #157：UI label 不換行、heading phrase 斷行、`.phrase` atoms。
- #156：四 locale、persisted preference、selector 鍵盤行為、legal fallback notice。
- #155：zh-TW h1 文案、不得虛構 social proof、appearance 控制在 footer、header 單列。
- #72：About 文案逐字保留。

**取代（不得再作為 authority）：**

- `ui-ux-research.md` 的視覺方向段落（Quiet Editorial、色彩、Storefront／Book Detail 版面、book-as-commerce IA）——其產品 IA 部分早已被 product contract supersede，視覺部分由本文件 supersede。
- [`docs/design/visual-redesign-reference.md`](design/visual-redesign-reference.md)、[`docs/design/implementation-sequencing.md`](design/implementation-sequencing.md)（#74）。
- #77 的 LP 視覺規格、#155 的 color／radius／shadow／typography tokens 與 hero 構圖。
- `src/styles/tokens.css` 中 `--home-*`、editorial-v2 與 Concept C 的現行數值（S1 起替換）。

---

## 16. Reference artifacts

| 檔案 | 內容 |
| --- | --- |
| [`docs/design/reference/index.html`](design/reference/index.html) | 系統總覽：三種聲音、marks、色彩、components、Never 清單 |
| [`home.html`](design/reference/home.html)、[`practice.html`](design/reference/practice.html)、[`runner.html`](design/reference/runner.html)（`?state=feedback`）、[`learn.html`](design/reference/learn.html)、[`read.html`](design/reference/read.html)、[`my-learning.html`](design/reference/my-learning.html)、[`plus.html`](design/reference/plus.html) | 主要 surfaces（responsive；`?theme=dark`） |
| [`tokens.css`](design/reference/tokens.css)、[`reference.css`](design/reference/reference.css) | Token 規格與參考 component CSS |
| [`screenshots/`](design/reference/screenshots/) | 1440 桌機、390 手機（2x）、dark 樣本，以及 `audit-live-*` 現況證據 |

參考稿只使用已公開的 `non-proprietary-teaching-sample` 內容與為本參考原創、標示「示意」的範例（例如 runner 的示意題）；不含任何 private canonical content。My Learning 與結果畫面的數字是版面用的示意資料，不是產品宣稱。
