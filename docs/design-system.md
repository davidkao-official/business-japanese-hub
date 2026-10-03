# Business Japanese Hub — Design System「Source & Gloss」

> **狀態：canonical / 視覺與互動設計 authority（v2.3.2，2026-10-04）。**
>
> 本文件定義 Business Japanese Hub 整個產品（main frontend 與 Career Game）的視覺識別、typography、色彩、marks、shell／navigation、components、各 surface 的 presentation grammar、states 與 implementation sequence。
>
> **產品前提（已核准，product contract §1 / §13.15）：** launch audience 是**已通過 JLPT N1 的外國學習者（不限母語）**；**V1 全產品以日文為主**（介面、解説、原文皆為日文）；**V1 不開放未完成的非日文 locale**；英文、中文、韓文等在 launch 後逐步加入。保留在地化能力，但不讓它主導 V1。價格幣別是獨立的商業決策，不影響本文件。
> 產品、商業、access、payment、security、deployment 規則仍以上位文件為準；本文件只決定「看起來、讀起來、用起來」怎麼做。**日文解説與行銷文案的字句品質屬內容審閱 lane，與本視覺 authority 分開**（D22）。
>
> **取代：** Quiet Editorial Modernism（#2／#74、[`docs/design/visual-redesign-reference.md`](design/visual-redesign-reference.md)）、#77 LP、#155 Concept C 的**視覺方向**不再是 authority（見 §15）。
>
> **Execution：** epic [#190](https://github.com/davidkao-official/business-japanese-hub/issues/190)；Stage 0 defects [#191](https://github.com/davidkao-official/business-japanese-hub/issues/191)；Japanese-first UI copy [#194](https://github.com/davidkao-official/business-japanese-hub/issues/194)；Japanese 解説 content contracts [#195](https://github.com/davidkao-official/business-japanese-hub/issues/195)；product premise [#193](https://github.com/davidkao-official/business-japanese-hub/issues/193)（已核准）。每次 merge 到 `main` 都是潛在 production release（#186），需另行授權。
>
> **Reference compositions：** [`docs/design/reference/`](design/reference/)（日文靜態 HTML + 截圖）。`python3 -m http.server 4810 --directory docs/design/reference` 後開啟 `http://localhost:4810/`。

---

## 0. TL;DR

每一個學習單位都是同一個形狀：

```text
原文（工作上要會用的日文） + 解説（日文：為什麼這樣說、要注意什麼） + 自己的紀錄（解答、錯題、保存）
```

V1 這三層**全部是日文**。所以「Source & Gloss」的重點不是兩種語言，而是**同一種語言裡的三種角色**：

- **原文是主角。** 放在白色 **sheet** 上，用日本商業文件實際使用的**明朝體角色**；**解説**用黑體、較小、`ink-2`，以丸数字 ①②③ 連回原文；**介面與紀錄**用黑體與 tabular 數字。這正是日本參考書與商業書區分「本文／例文」與「解説」的方式。
- **讀者已經通過 N1。** 不加常用漢字的振假名、不簡化日文、不用學習 app 的語氣；解説是給能讀日文的人看的職場與語用判斷，不是翻譯。
- **唯一的裝飾是工作上的標記：** 螢光筆（marker）、丸数字、赤入れ、〇／×。
- **用平實的數字說真話。** 只用 `3／5` 這類計數；證據不足時誠實顯示「データ不足」——**何時算不足由 learning authority 定義，不由本文件定義**（§8.1）。沒有 mastery %、streak、進度環。
- **共用的是外觀，不是語意。** Practice 的〇×、作者設定的確認問題、Career Game 的 strong／mixed／risky 判斷結果，都由各自的產品 contract 決定；共用元件不得把它們改寫成同一種東西（§6、§7.3、§7.12）。
- **每個畫面一個下一步；專注時 chrome 退場。**
- **手機是通勤用 app（底部 tab bar），桌機是工作桌（原文與解説並排）。**
- **在地化是之後的一層，不是 V1 的形狀。** 字體跟著 `lang`、文字全部走 i18n keys、為 support language 預留一個可選的位置，但 V1 的版面、文案與 QA 不依賴它。

---

## 1. Investigation

### 1.1 從第一原理理解產品（v2 前提）

- **受眾：** 已通過 JLPT N1、母語各不相同（中文、韓文、英文、越南文……）的人，正在或準備在日本求職、讀日本企業資料、在日本企業工作。**他們讀得懂日文，也預期被當成能讀日文的人對待。**
- **缺口：** 不是字彙量，而是「在工作上用日文判斷」——報連相的時機與分寸、會議中的用語、企業資料的論點結構、Web テスト在時間壓力下的題意判讀。
- **共同語言只有日文。** 沒有一個共同母語可以當解說語言。用某一種母語當 V1 的解說層，會讓其他所有使用者變成次要客群。因此 **V1 的解説必須是日文**，而且寫給 N1 讀者：精準、職場化、不幼稚化。
- **產品實際交付：** 一句職場上該說的日文（学ぶ）、一段要讀懂的商業原文（読む）、一題日文出題的 Web テスト（練習）、一個職場情境中的選擇（体験），以及這些行為留下的紀錄（学習記録）。
- **差異化在內容結構：** Learn unit contract `Situation → Judgment → Natural Japanese → Why → Practice → Transfer`；Read loop `text → vocabulary → logic → context → comprehension → save`；Practice 的**作者設定確認問題**（dimension：meaning／representation／execution，顯示為 題意／整理／処理；對 N1 合格者依然成立：日文流利但仍可能在題意判讀或整理條件上失分）；Career Game 的**情境判斷**（strong／mixed／risky，不是正誤）；Learning System 只呈現 deterministic evidence。
- **結論：** identity 來自「原文 + 解説 + 紀錄」的結構。v2 的關鍵設計問題變成：**三層都是日文時，如何仍然一眼分得清？** 答案是字體角色、紙面與位置（§4）。

### 1.2 Live product audit（`main` @ `ce31570`）

截圖：[`docs/design/reference/screenshots/`](design/reference/screenshots/)（`audit-live-*`）。

**A. 三套視覺系統疊在一起。** 首頁上半是 #155 Concept C（橘色、Inter、pill、floating card），中段是 Quiet Editorial（明朝大標、mono 英文 eyebrow、01/02/03），Read／Practice／My Learning／Plus 是第三種米色＋灰綠按鈕，Career Game 是獨立的 dossier 樣式。方向自 2026-08 起被重設三次，每次只作用於單一 surface。

**B. Defects：**

| # | Defect | 證據／影響 | v2 優先度 |
| --- | --- | --- | --- |
| B1 | Reader 深色主題下 headings 幾乎不可見（app Light＋系統 Dark 時 heading 仍用 light ink）。 | `audit-live-reader-dark-headings.jpg`；WCAG 1.4.3 | P0 |
| B2 | 字體不跟著 `lang`：`--font-sans` 一律以日文字型開頭，`lang="zh-TW"` 文字也被套用。 | 非日文 locale 的標點位置與字形錯誤 | 降為 foundation（S2 `:lang()` 架構），非 V1 P0 |
| B3 | 手機版 Learn 的儲存區塊是約 280px 的空盒。 | `audit-live-learn-mobile.jpg` | P0 |
| B4 | 首頁 hero 的「」括號孤立（phrase atoms 不正確）。 | `audit-live-home-desktop.jpg` | P1（S6 會整個替換） |
| B5 | 工程用語出現在使用者文案（evidence、Workplace Learn…）。 | My Learning、Footer | P0（與 B7 一併處理） |
| B6 | 日文介面內的英文導覽標籤（Learn / Read / Practice / My Learning / Experience）。 | Header | P0（S1，#194） |
| **B7** | **核心學習 surfaces 繞過 i18n、寫死繁體中文。** SPI explainer（約 2,300 漢字）、Practice hub／runner（約 790）、My Learning（約 680）、About、Learn unit、mode pages、Read landing 皆以 `lang="zh-TW"` 寫死。預設 `ja` locale 下，acquisition（SPI）與 subscription justification（My Learning）仍是中文畫面。 | `src/app/*Page.tsx` | **P0：V1 blocker**（#194） |
| **B8** | **Content contracts 只有中文解說欄位**（`meaningZhTW`、`explanationZhTW`、`whyItWorksZhTW`…），Plus 的日文文案把受眾寫成「中国語話者」。 | `src/reading/types.ts`、`src/workplace-learn/types.ts`、ja strings | **P0**（contract：#195；文案：#194） |

**C. Acquisition 斷在登入牆。** 匿名訪客要點四層（Web テスト → SPI → 非言語 → 分野）才看到「需要登入」，沒有任何一題可以先試（#187／#107）。

**D. Taxonomy drift。** 首頁四張 pillar（Business Reading / Professional Vocabulary / Japan Literacy / Business Discussion）是第三套分類，且以四種顏色編碼。

**E. 學習介面沒有被設計。** SPI runner 幾乎是未樣式化 HTML；checkpoint ladder 只是一行文字；Read 把原文、語句、論點拆成互不連結的區塊。

---

## 2. Design thesis：Source & Gloss（原文と解説）

> **The Japanese is the material. Everything else serves it.**

比喻：**工作桌（desk）上放著文件（sheet），學習者在文件上做標記，旁邊是解説，最後留下紀錄。**

| 層 | 是什麼（V1 全為日文） | 視覺處理 |
| --- | --- | --- |
| **Source／原文** | キーフレーズ、例文、商業原文、問題文、ケースの台詞 | 白色 sheet、明朝角色、最大字級與留白、genre label（例文／原文／問題） |
| **Gloss／解説** | 為什麼這樣說、語感、注意點、讀法——日文、寫給 N1 讀者 | desk 上、黑體、`ink-2`、以丸数字連到原文 |
| **Record／記録** | 解答、間違えた問題、保存、観察 | rows、tabular 數字、〇×、誠實的「データ不足」 |
| **Marks** | 連起三層 | marker、①②③、赤入れ、〇× |
| **Support（post-V1）** | 學習者母語的補足說明 | 可選、收合、在日文解説之下、使用該語言字體、依 locale 提供；**V1 不出貨** |

**「Gloss」不等於翻譯，也不等於中文。** V1 的 gloss 就是日文解説。Support language 是另外一層，永遠不取代或插入日文解説。

---

## 3. Principles

1. **原文是主角。** 每個 surface 先問「這頁的日文原文是哪一段？」
2. **同一種語言，三種角色。** 原文（明朝）、解説（黑體 ink-2）、介面與紀錄（黑體、tabular）必須一眼可分。
3. **把讀者當 N1 合格者。** 不振假名常用漢字、不簡化、不說教、不用遊戲化語氣。
4. **只有工作上的標記，沒有裝飾。**
5. **用平實的數字說真話。**
6. **一個下一步。**
7. **專注時 chrome 退場。**
8. **通勤用手機、工作用桌機。**
9. **在地化是一層，不是骨架。** 所有文字走 i18n keys、字體跟著 `lang`、版面能容納較長的外語字串；但 V1 不為其他語言調整構圖或文案。

---

## 4. Identity system

Token 規格：[`docs/design/reference/tokens.css`](design/reference/tokens.css)。

### 4.1 Surfaces

- **desk**：中性淺灰。日本職場文件是白紙，不是書頁，所以不用米色。
- **sheet**：只承載日文原文，以及少數該被視為「文件」的物件（價格、次の一歩）。1px hairline、6px radius、無陰影。
- **sheet-sunk**：計算過程、ゴール等次要容器。
- 列表一律 rows with rules；卡片只給 sheet。

### 4.2 Color roles

| Token | Light | Dark | 用途 | 對比（實測） |
| --- | --- | --- | --- | --- |
| `desk` | `#F4F4F1` | `#111215` | App 背景 | — |
| `sheet` | `#FFFFFF` | `#1A1C21` | 原文紙面 | — |
| `sheet-sunk` | `#EDEDE8` | `#15171B` | 次要容器 | — |
| `ink` | `#1B1D23` | `#ECECE7` | 文字、primary action、focus | 16.9:1 / 14.4:1 |
| `ink-2` | `#464A54` | `#B9BBC1` | 解説、次要文字 | 8.9:1 / 8.9:1 |
| `ink-3` | `#61666F` | `#8E919A` | caption、metadata | ≥4.9:1 / ≥5.4:1 |
| `rule` | `#DCDCD5` | `#2D3037` | 裝飾性分隔線 | 非資訊性 |
| `rule-control` | `#878A84` | `#6E727C` | input、choice、chip 邊框 | ≥3.1:1（1.4.11） |
| `marker` | `#FFE35A` | `#6A5A12` | 螢光筆底色 | ink on marker 13.1:1 / 5.75:1 |
| `marker-soft` | `#FFF4B8` | `#3A3418` | Plus chip、選取底色 | — |
| `ok` 〇 | `#1E7549` | `#58C793` | 正解 | 5.7:1 / 8.1:1 |
| `ng` × | `#BE3219` | `#FF8069` | 不正解・赤入れ | 5.7:1 / 6.9:1 |

- Primary action = ink（dark 反轉）。Marker 永遠不是按鈕色。
- 顏色只承載語意：marker（重要的日文）、ok、ng。沒有品牌橘、沒有分類彩虹、沒有漸層。（#155 的 `#f36522` 對白字只有約 3.1:1，本身也無法通過 AA。）
- Marker 對 sheet 的非文字對比只有 1.3:1，所以**永遠不是唯一訊號**。
- System／Light／Dark 三態保留；Reader theme 必須使用同一組 role tokens（修正 B1）。

### 4.3 Typography：三種角色，一種語言

V1 根元素 `lang="ja"`。**字體跟著 `lang`，不跟著頁面 locale**（`:lang()` 規則，見 tokens.css）。**不載入 CJK webfont**（mobile performance gate，#96／#77；Windows 10+ 內建 BIZ UD fonts、Apple 內建 Hiragino）。

| 角色 | 用途 | Stack |
| --- | --- | --- |
| **原文**（`.material`） | キーフレーズ、例文、商業原文、問題文、Reader 正文預設 | Hiragino Mincho ProN → BIZ UDPMincho → Yu Mincho → Noto Serif JP／CJK JP → 退回黑體 |
| **解説・介面・紀錄**（`:lang(ja)`） | 解説、標題、按鈕、紀錄、所有 UI | Hiragino Sans → Hiragino Kaku Gothic ProN → BIZ UDPGothic → Yu Gothic UI → Meiryo → Noto Sans JP |
| English（`:lang(en)`） | 品牌字、專有名詞 | system-ui → Segoe UI → Helvetica Neue |
| **Post-V1 support slots** | 只用於 support language 層 | `--font-zh-hant`、`--font-zh-hans`、`--font-ko` 已預留；**不得**用於原文或解説 |

**為什麼原文用明朝、解説用黑體：** 三層都是日文時，字體角色是最清楚、也最符合讀者既有習慣的區分方式——日本的參考書、商業書、決算短信與長年的 Word 預設都以明朝排本文，以黑體排見出し與解説。**標題與介面永遠不用明朝。**

Scale（16px root，字距 0）：

| Token | 值 | 用途 |
| --- | --- | --- |
| `size-display` | clamp(28px → 44px) / 1.3 / 700 | 首頁、Plus hero |
| `size-title-1` | clamp(26px → 36px) / 1.4 / 700 | 頁面標題 |
| `size-title-2` | 22px / 1.4 / 700 | 區段標題 |
| `size-title-3` | 18px / 1.5 / 700 | 小標 |
| `size-body` | 16px / 1.8 | 內文、解説段落 |
| `size-small` | 14px | 解説清單、次要文字 |
| `size-caption` | 13px（最小資訊字級） | metadata |
| `size-material-key` | clamp(20px → 26px) / 1.85 | キーフレーズ |
| `size-material` | 18px / 1.95 | 原文、問題文、例文 |

規則：

- Measure：內文 ≤ 36em、原文 ≤ 34em（JLREQ ≤ 40 字）。
- 數字（題數、分數、價格、日期、計時）一律 tabular。半形數字與拉丁字母不改全形。
- 日文間距：`text-autospace`、`text-spacing-trim` 作為 progressive enhancement；display 標題可評估 `palt`，正文不用。
- **禁止** uppercase mono 英文 eyebrow；label 用日文 caption。
- 斷行沿用 #157：UI label 不換行；headings `word-break: auto-phrase` + `line-break: strict` + `text-wrap: balance`；authored display headings 提供**文節單位**的 phrase atoms（例：「日本のビジネス社会で」｜「使う日本語」へ。），不手動 `<br>`。
- 丸数字使用真正的字元，讓禁則處理維持有效。
- **振假名：** 只在罕見讀法或專有名詞、且由作者標註時使用；語彙條目以獨立的「読み」欄呈現讀音。

### 4.4 Marks

| Mark | 來源 | 語意 | 規則 |
| --- | --- | --- | --- |
| **Marker 蛍光ペン** | 在紙本資料上畫重點 | 「這段日文是重點」 | 下半部色帶。只用在原文；非原文頁面最多一個關鍵片語。必須來自**作者標註的範圍**或與語彙／key term `surface` **完全一致**的字串，**不可猜測**。 |
| **丸数字 ①②③** | 日本文件的箇条書き | 原文片語 ↔ 解説 | 原文與解説清單同號；screen reader 以 `aria-label="注1"` 等呈現。 |
| **赤入れ** | 上司的紅筆修改 | 錯誤、NG 表現、不正解的確認問題 | 刪除線／波浪線＋正確表現；必附文字。 |
| **〇 ×** | 日本的〇×表、答案用紙 | 正解／不正解 | 永遠附文字；「未確認」用虛線圓。**只用於有正誤的作答**（Practice 與其確認問題）；不用於 Career Game 的判斷結果（D25）。logic-grid 等資料表中的〇×是資料，用 ink、不用 ok／ng 色。 |
| **Genre label** | 文件種類 | 告訴讀者這是哪一種日文 | sheet 左上：`例文`、`原文`、`問題`、`キーフレーズ` ＋ 場面（「上司へ・口頭またはチャット」）。 |

### 4.5 Shape、space、elevation、motion

- Radius：sheet 6px、control 8px、chip 4px；不用 pill（segmented control 外框除外）。
- Space：4-based；gutter `clamp(16px, 4vw, 40px)`；content max 1200px。
- Elevation：只有 overlay 使用 `shadow-overlay`。
- Motion：120–180ms；解説出現時 marker 可 260ms 刷上；`prefers-reduced-motion` 歸零。不做 parallax、floating、scroll reveal。

### 4.6 Iconography 與 imagery

1.6px stroke 線性 icon，只用於 tab bar、關閉、方向、外部連結。不用 emoji、彩色 icon tile。首頁 hero 的視覺就是一段日文原文 sheet，不需要照片；未來影像必須自有，不用 stock 人物當品牌。Book cover art 只出現在 Read 的長篇頁。

### 4.7 Brand mark 與命名

暫定 glyph：墨色方塊內的「 」與一道 marker（品牌承諾「『試験の日本語』から『仕事の日本語』へ」的括號）。Wordmark 建議為 **Business Japanese Hub**；V1 日文介面中可並列「ビジネス日本語ハブ」作為描述，但不再有 locale 別的不同品牌名。正式 logo 為後續資產工作（D24）。

---

## 5. Shell & navigation

### 5.1 Header（≥ 960px）

`[glyph + Business Japanese Hub] [学ぶ 読む 練習 学習記録 体験] ……… [Plus] [ログイン／アカウント]`

- 64px；目前 mode 以粗體＋marker 底線表示。
- **V1 沒有語言切換器**（D18）：V1 只開放 `ja`。#156 的 locale 架構、persistence、鍵盤行為保留在程式中；當某個 locale 完整上線時，切換器出現在 footer 與「その他」，**不放回 header**。

### 5.2 Mode labels（D8）

Canonical IDs 與 routes 不變；**V1 顯示名稱為日文**：

| Mode ID | V1（ja） | 說明 |
| --- | --- | --- |
| `learn` | 学ぶ | 職場の日本語・語彙のレッスン |
| `read` | 読む | ビジネス資料読解・長文 |
| `practice` | 練習 | 就活 Web テスト対策 |
| `my-learning` | 学習記録 | 「記録」而不是「我的頁面」：只顯示真實紀錄 |
| `experience` | 体験 | Career Game（另一個 origin） |

其他 locale 的名稱在 launch 後由在地化工作提供（i18n keys），不影響 V1。

### 5.3 Mobile（< 960px）

- Header 56px：glyph + wordmark + ログイン／アカウント。**帳號控制項永遠可見、≥44px，不得被推出畫面或隱藏**（D29）：
  - < 600px：間距收窄、wordmark 15px；在較寬的 fallback 字型下 wordmark 可省略（…），但不得造成水平捲動。
  - < 360px（含 320px reflow）：只顯示 30px glyph，連結保留 accessible name「Business Japanese Hub ホーム」，且連結本身仍是 **44×44px** 點擊區。
  - 驗收：320／360／390 × 未ログイン（ログイン）／已登入（アカウント）× 至少兩種字型環境（Apple 系統字型，以及 Windows 或 Linux 的 fallback），皆無水平捲動。參考：`narrow-320-*`、`narrow-360-*` 截圖。
- **底部 tab bar**：`学ぶ／読む／練習／学習記録／その他`。「その他」是 `<button aria-haspopup="dialog">`，開啟 `Dialog`（sheet placement，§6）：体験（Career Game，另一個 origin，標示「別サイトで開きます」）、Plus、Business Japanese Hub について、外観、規約・ポリシー（post-V1 才加入表示言語）。參考：`practice.html#more`。
- Safe-area、44px 點擊區、目前 tab 以粗體＋marker icon 底表示；專注模式中隱藏。

### 5.4 Focus mode（runner、Reader、書いてみる）

56px focus bar：`[× 終了] [context] [2／5 問]` + 3px 進度條；隱藏 header、tab bar、footer；手機主要動作固定在底部 action bar，**action bar 內永遠保留一行狀態**（例如保存狀態），只有說明性的提示可以在手機上省略。

- **計時：** 只有當題目的 `practiceProfile` 屬於 Practice contract 已定義的 timed profile 時才在 meta 位置顯示；計時規則不由本文件定義。目前 runner 沒有計時。
- **帳號：** focus mode 隱藏 header，因此需要登入的狀態（例如作答中 session 過期）必須在該狀態本身提供登入動作，於原畫面開啟登入 `Dialog`，不離開作答（§7.3 E）。

### 5.5 Footer

品牌一句話、mode 連結、Plus／について、規約・ポリシー、外観、販売事業者表示（post-V1 加入表示言語）。

---

## 6. Components

Reference CSS：[`docs/design/reference/reference.css`](design/reference/reference.css)。實作為 `src/components/` 共用 primitives。

| Component | 職責 | 關鍵規則 |
| --- | --- | --- |
| `Button` | primary（ink）／quiet | 48px（sm：視覺 36px，點擊區 44px）；label 不換行；一個畫面最多一個 primary |
| `TextLink` | 次要導向 | 永遠有底線；獨立使用時點擊區 44px；句中的行內連結除外（§10） |
| `AccessChip` | 無料／Plus／ログインが必要 | Plus 用 marker-soft；access 由 server 判定 |
| `Sheet` | 原文容器 | genre label 必填 |
| `Material` | 原文文字 | 明朝角色；`--key` 用於キーフレーズ |
| `Mark` | marker | 只接受 authored range 或 exact match |
| `Kaisetsu`／`GlossList` | 日文解説（含 ①②③ 清單） | 黑體、ink-2、與原文同號 |
| `SupportNote`（post-V1） | 母語補足 | 收合、在解説之下、該語言字體；V1 不實作 |
| `ChoiceRow` | 選項的**外觀與互動** | ≥52px；row、key、文字、狀態（default／hover／focus／selected／disabled）與一個結果欄位。兩種 mode：**select**（radio／checkbox；Practice；另有送出動作；key 為 A, B, C…，數量依資料）與 **commit**（`<button>`；Career Game；按下即是決定；key 為 1, 2, 3…）。選取＝2px ink 邊框；**focus 畫在可見的 row 上**（`:has(:focus-visible)`：outline＋offset＋halo，與選取邊框可區分）。**結果欄位的意義由產品提供**：Practice 用 `ResultMark`，Career Game 用 `OutcomeVerdict`；ChoiceRow 本身不定義正誤 |
| `ResultMark` | 〇／×／未確認 | 必附文字；只用於有正誤的作答 |
| `OutcomeVerdict` | Career Game 的判斷結果 | 作者設定的 `strong`／`mixed`／`risky`，以產品既有標籤顯示（効果的な判断／状況次第の判断／リスクのある判断）；三者同一中性樣式；不用〇×、ok／ng、赤入れ；meter 變化以文字 chip（「信頼 +1」）（D25） |
| `CheckpointLadder` | 作者設定的確認問題 | 0..n 題，依作者順序；標籤依 `dimension`（meaning＝題意、representation＝整理、execution＝処理）；每步：作者的 prompt＋`ResultMark` 或「回答中／未回答」；附「原因の判定ではありません」；沒有確認問題時不顯示（§7.3 C） |
| `AnswerInput` | 解答輸入 | single-choice、multi-select、number、short-text、ordering（§7.3 A）；沿用既有 runtime 的輸入類型，不新增也不縮減 |
| `Representation` | 題目／選項／解説中的表示 | equation、table、diagram（`altText`）、elimination、logic-grid、other（§7.3 B）；寬表在具名、可聚焦的區域內捲動 |
| `ObservationTable` | 分野 × 正解／解答 | 永遠只顯示計數；signal 欄依 learning authority 的規則顯示「要確認」或「データ不足」；不顯示比率或 bar，直到 learning authority 定義其門檻（§8.1） |
| `NextStep` | 次の一歩 | 一句理由＋一個按鈕 |
| `ListRow` | 分野、間違えた問題、保存 | 規則線分隔 |
| `StatePanel` | 空、データ不足、ログイン、Plus、エラー、版が古い | 虛線框、標題、一句、一動作 |
| `Dialog` | 唯一的 modal primitive | 由 `src/reader/ReaderDialog.tsx` 一般化（D27）：`role="dialog"`＋`aria-modal`＋accessible name；開啟時 focus 移到「閉じる」或第一個控制項、Tab 在內循環、背景不可操作；Escape、scrim、「閉じる」（44px）皆可關閉；關閉後 focus 回到觸發元素；開啟期間鎖定頁面捲動。placement：**sheet**（< 960px 底部、最高 85dvh、內容在內部捲動、safe-area）、**side**（≥ 960px 右側 drawer）、**center**。瀏覽器「上一頁」沿用 ReaderDialog：不建立 history entry，dialog 隨頁面離開而關閉。用於：その他、Read 的注、runner 內登入、Reader 既有 overlays |
| `NoteTrigger` | Read 原文中的 marked phrase | `<button>`，accessible name＝語句＋「注n」；Enter／Space／點擊開啟對應注的 `Dialog`；行內元素，不改變原文的斷行 |
| `Tabs` | 區塊切換 | ARIA tabs pattern（左右鍵、roving tabindex）；每個 tab 44px |
| `Field` | 文字、數值輸入 | label 永遠可見；48px；數值用 `inputmode="decimal"` |

所有元件的文字來自 i18n keys；版面需容納比日文長約 1.5–2 倍的字串（未來 en／ko）而不破版——這是唯一允許在地化影響 V1 的地方：**不寫死寬度**。

---

## 7. Surface grammars

### 7.1 ホーム（public）— [`home.html`](design/reference/home.html)

1. **Hero：** kicker「日本語能力試験 N1 に合格し、日本で働く・働きたい方へ」→ h1「『試験の日本語』から、『日本のビジネス社会で使う日本語』へ。」（product contract §1 的日文 brand promise；字句由內容審閱定稿）→ lead → `SPI の問題を試す`（primary；行為依 G1）＋`Plus について`。右側 **specimen sheet**：一段職場日文原文＋marker＋①②③＋**日文解説**＋連到該レッスン。
2. **Journey coverage：** 就職準備 → 選考 → 入社 → 職場に慣れる → 専門性を高める × 練習／読む／学ぶ／体験。
3. **Learning state：** 四個問題（最近どこまで進んだか…）＋標示「サンプル画面」的 checkpoint ladder。
4. **Plus offer：** 價格由設定提供、版面不依賴幣別；顯示真實狀態（「準備中・お支払いはまだできません」）。
5. **Founder：** David Kao 的真實經歷（日文字句由內容審閱確認事實與措辭）。
- 移除四張 pillar 與 editorial／書籍區塊。

### 7.2 練習 hub（就活 Web テスト対策）— [`practice.html`](design/reference/practice.html)

- 一頁呈現 **非言語／言語** 兩欄分野 rows（名稱、問題數、モード、前回結果），每列直接「練習する」。
- 已登入：右上 `NextStep`。初次：連到「SPI とは」。
- 日文分野名稱（提案，需母語審閱）：割合と損益／速さと仕事算／集合と場合の数／推論（条件と順序）／文脈と語句の意味／二語の関係／文の論理／長文の推論。
- family／domain routes 保留為 deep link（D11）。獨立性聲明以 caption 保留。

### 7.3 練習 runner — [`runner.html`](design/reference/runner.html)（`#question`／`#checkpoint`／`#feedback`）、[`runner-states.html`](design/reference/runner-states.html)

Runner 呈現 Practice **既有**的 authoring、計分與保存 contract（`src/practice-web-test/contract.ts`、`src/app/WebTestHubPage.tsx`、#117）。本文件決定外觀與互動位置，**不改變**題型、確認問題、計分、保存或前進的語意（D26）。runner.html 的折扣題只是一個 single-choice＋equation 的示例。

**流程：** 問題 → 解答 → 結果＋解説 →（作者有設定時）確認問題依序作答 → 最後一題確認問題之後（沒有確認問題時則在解答之後）保存一次 → 依保存結果決定能否前進 → 完了。

**問題畫面：** focus bar → `問題` sheet（明朝 `promptJa`＋`promptRepresentation`）→ `AnswerInput` → 底部「解答する」。

**解説畫面（桌機兩欄、手機單欄）：**
- 左：結果（`ResultMark`＋あなたの解答／正解）→ 問題 sheet 重現，以 key term `surface` 完全一致標出條件 ①②③（日文解説）→ 選項結果。
- 右：何を求める問題か（`coreExplanation.whatIsAskedJa`）→ 表示（`coreExplanation.representation`；標題依類型，例如 equation「式の立て方」、table「表の読み方」、elimination「選択肢の絞り込み」，不寫死為計算）→ よくある読み違い（赤入れ左線）→ 理解の確認 → 保存狀態 → 次の問題。
- V1 的解説來源是既有日文欄位（`coreExplanation.concise`、`whatIsAskedJa`、vocabulary `explanationJa`）；`supportOverlays.byLocale` 是 post-V1 support layer。

**A. 解答輸入（`answer.input.kind`）**

| kind | 呈現 | 規則 |
| --- | --- | --- |
| `single-choice` | `ChoiceRow` select（radio，圓形 key） | 選項數與順序依資料；A, B, C… 只是顯示用的 key；送出前可改選 |
| `multi-select` | `ChoiceRow` select（checkbox，方形 key） | 明示「当てはまるものをすべて選ぶ」；不提示正解數 |
| `number` | `Field`（`inputmode="decimal"`） | label「答え（数値）」；單位由題目文字提供 |
| `short-text` | `Field`（text） | 依 `exact-text` 計分；不自動修正輸入 |
| `ordering` | 排序 rows＋「上へ／下へ」按鈕 | 初始順序依資料；拖曳只是加強，不能是唯一方式 |

**B. Representation：** equation、table、diagram（必用 `altText`）、elimination、logic-grid、other 各自以 `Representation` 呈現在 sunk sheet 內。表格超過寬度時在具名（`role="region"`＋`aria-label`）、可聚焦（`tabindex="0"`，鍵盤以方向鍵捲動）的區域內水平捲動，頁面本身不得水平捲動。**為此，從頁面到 Representation 之間的每一層 grid／flex 都必須能縮到比表格的 min-content 更窄**（`minmax(0, 1fr)` track、`min-width: 0` item）；不得以 `overflow: hidden` 裁掉頁面溢出來掩蓋。驗收用比 viewport 更寬的表格與 logic-grid（參考：`runner-states.html` 的 8 欄表與 6×6 grid、`narrow-320-runner-states-table` 截圖）。logic-grid 的〇×是資料（ink），不是正誤。

**C. 確認問題（`PracticeCheckpoint`）：** 0..n 題，依作者順序；每題有自己的 `promptJa`、`answer`（輸入類型同 A）、`id`、`version`。標籤依 `dimension`：meaning＝**題意**、representation＝**整理**、execution＝**処理**（字句屬內容審閱，D22）。每步狀態：回答中／未回答／〇 正解／× 不正解。**沒有確認問題時不顯示 ladder，也不算作「未確認」或不正解。**「題意 → 立式 → 計算」只是 equation 題的示例，不是固定的三步結構。

**D. 保存與前進（`RunnerPersistence`）：** 「次の問題」**只有在 `saved` 或 `invalid-response-time` 時可以按**；其他狀態下按鈕停用，或換成該狀態的動作。桌機的狀態顯示在 nextbar；**手機的固定 action bar 永遠顯示一行狀態**（`role="status"`／`alert`），只省略說明性提示。

| 狀態 | 顯示（例） | 次へ | 動作 |
| --- | --- | --- | --- |
| `pending` | 保存中… | 不可 | — |
| `saved` | 保存しました（＋復習リストの説明） | 可 | 次の問題 |
| `failed` | 保存できたか確認できません | 不可 | 保存を再試行（不推測成功） |
| `signed-out` | ログインの有効期限が切れました。解答はまだ保存されていません | 不可 | ログインして保存（E） |
| `forbidden` | Plus の会員資格を確認できないため、保存できていません | 不可 | 再試行／Plus について |
| `stale`／`missing` | 問題の版が更新されたため、この解答は保存されませんでした | 不可 | 最新の問題を読み込む |
| `invalid` | 解答を保存できませんでした | 不可 | 分野に戻って読み込み直す |
| `invalid-response-time` | 解答時間が受け付けられる範囲外のため、保存されませんでした | 可（不可重試） | 次の問題 |

**E. 作答中 session 過期：** focus mode 隱藏 header，所以 `signed-out` 狀態列本身提供「ログインして保存」，在 runner 內開啟登入 `Dialog`（既有的 password sign-in，不離開頁面）。runner 的畫面狀態與待保存的那一筆解答留在記憶體；登入成功後回到同一個狀態，focus 回到狀態列，主要動作是以**同一筆解答**重試（既有 retry 路徑）。若登入的是另一個帳號，不保存該解答並說明原因（既有的 user 檢查）。參考：`runner-states.html#signin`。

**F. 完了：** 正解 `n／N`、解答時間、確認問題的不正解 `x／y`（沒有確認問題時「確認問題：なし」）、保存狀態（全部保存，或幾題未保存及原因）、一個 `NextStep`。只用計數；不顯示正答率 %、ladder 彙整或 pattern 文句（Q7）。

**G. 驗收（S5）：** A 的每種輸入、B 的每種 representation、0／1／多題確認問題、D 的每種保存狀態（含 session 過期 → 登入 → 重試）在 360／390 與 1440 都可以只用鍵盤完成；手機上保存狀態永遠可見；verbal 題（言語）與非計算題的標籤沒有出現「立式」「計算」。

### 7.4 SPI とは（SEO explainer）

日文長文、measure 36em；David の視点以署名 commentary 區塊呈現；結尾一個 CTA 到練習 hub。**現行全文為繁中（B7）；V1 需要日文版（介面 #194；本文由內容 lane 撰寫審閱）。**

### 7.5 学ぶ：レッスン — [`learn.html`](design/reference/learn.html)

`breadcrumb → レッスン名・リード → このレッスンのゴール → 場面 → まず判断する → こう言う（キーフレーズ sheet＋解説）→ 別の場面 → 言い方と相手との関係 → 書いてみる（保存・採点なしと明記）→ 持ち帰る一文`。桌機右 rail：保存（Plus）、構成、関連する語彙。手機：保存移到標題下、語彙卡移到文末。參考稿的日文解説為本參考從第一原理撰寫的草稿；現行資料只有繁中解說（B8，#195）。

### 7.6 職場語彙

語彙（明朝大字）＋読み → 意味 → 職場でのニュアンス → 使う場面／レジスター／相手との関係 → 例文 sheet → 注意 → 関連レッスン。

### 7.7 読む：一覧

分類 tabs（ビジネスニュース／企業・IR／業界レポート／官公庁資料／社内・ビジネス文書）＋記事 rows（タイトル、要旨、出典、無料／Plus）。Plus 記事が空のときは StatePanel。長文の書籍は「長文で読む」区段。

### 7.8 読む：記事 — [`read.html`](design/reference/read.html)

桌機：左 **原文 sheet**；右 読み方 → 語句 ①②③ → 論点の構造 → ビジネスの背景 → David の視点 →（理解・応用：#122）→ 次に学ぶ。原文中：語句 `term` exact match 標 marker＋丸数字；`logicAnalysis.japaneseText` 能 exact match 的句子在左側顯示論點標籤（現状／施策／効果）。

- **注的開啟：** 原文中每個 marked phrase 是 `NoteTrigger`。點擊或 Enter／Space 開啟該注的 `Dialog`：< 960px 為底部 sheet，≥ 960px 為右側 drawer（與 ReaderDialog 的 `vocab` placement 相同）。長的注在 dialog 內部捲動。右欄的語句清單仍完整列出，是不開 dialog 也能讀的路徑。參考：`read.html#note1`。
- **長文：** 原文 sheet 只有在整段能放進 viewport 高度時才 sticky；否則兩欄各自正常捲動，以丸数字對應。原文中的表格在具名、可捲動的區域內呈現。
- **理解・応用（#122）：** Read loop 在保存與回訪之前有一個 bounded comprehension／application 步驟（#122）。版面在「次に学ぶ」之前保留它的位置；活動形式與是否需要新的 persisted evidence 由 #122 決定。在那之前該位置不出現，**S9 的視覺 rollout 不代表 Read loop 已完成**；保存不是理解的證據（D30）。
- **驗收（S9）：** 除了短的示例，還需用已公開 fixture 中最長、最密的材料（長的論證、多欄表格、大量語彙）在 360 與 1440 驗收。不為此新增或公開 private content。

### 7.9 Books、Reader、Library

Reader 是 focus mode；正文預設原文明朝角色（可切黑體）；measure 依 ui-ux-research §3；**theme 用 role tokens（B1）**。Book detail 是読む下的長文頁；購買 CTA 依 G2。

### 7.10 学習記録 — [`my-learning.html`](design/reference/my-learning.html)

`学習記録 → 次の一歩 → 左：間違えた問題、保存した内容（tabs）→ 右：観察（正解／解答、データ不足）、理解の確認（段階別 不正解／確認回数）、最近の解答（〇×）`。不顯示 mastery %、streak、進度環、AI 診斷。理解の確認彙整與任何 pattern 文句依 Q7（learning authority）；規則核准前不顯示該區塊。

### 7.11 Plus — [`plus.html`](design/reference/plus.html)

「教材が増えるだけではない。あなたが何をしてきたかを覚えている。」＋價格方塊（Early Access、真實狀態、無年額）→ Plus が答える 4 つの問い → Free と Plus（由 #107 access matrix 產生）→ 対象となる方（N1 合格、日本語を母語としない方）。

### 7.12 体験と Career Game

參考：[`game.html`](design/reference/game.html)（`#decision`／`#strong`／`#mixed`／`#risky`，內容取自已公開的 `upward-disagreement` v1）。

Career Game 已是日文。保留它的 narrative grammar **與 learning semantics**（`packages/career-game`；`learning-and-progress.md` §4：authored `strong`／`mixed`／`risky` 與 Practice 的 boolean correctness 分開）。只換外觀：

- **流程：** ケース → scene（context、narrative、dialogue）→ decision（prompt＋choices）→ outcome → 下一個 scene → 完了。
- **台詞**放在 Sheet（genre label「台詞」＋話者）；narrative 用內文樣式。
- **選擇**用 `ChoiceRow` 的 **commit mode**：`<button>`，按下即是決定（不是先選再送出）；依作者順序編號 1, 2, 3；選項的出現條件依既有 runtime。
- **結果**用 `OutcomeVerdict`：產品既有標籤 strong＝効果的な判断、mixed＝状況次第の判断、risky＝リスクのある判断；三者同一中性樣式。**不得使用〇×、正解／不正解、ok／ng 色或赤入れ，也不得合併、改名或把 mixed 歸到任何一邊。** meter 變化以文字 chip 顯示（「信頼 +1」）。
- 其後依序：その場で起きたこと（`consequence`）→ なぜそうなるか（`feedback`，解説角色）→ この場面で使える表現（`recommendedExpression` 放在 Sheet、明朝；`acceptableAlternatives` 為「別の言い方」）→ 関連する内容（`libraryLinks`）→ 次の場面へ。
- **完了：** 判断の内訳（三種 category 的計數）＋ completion summary；不轉成分數或正答率。
- ケース一覧用 rows；移除 mono 與雙框 dossier（D16）。
- **驗收（S11）：** 以實際內容分別呈現 strong、mixed、risky 各至少一個 outcome，確認標籤字串與既有 `categoryLabels` 相同、三者沒有被合併或改名、沒有任何一種在視覺上呈現為正誤。

### 7.13 について、規約、Auth、404

About 需要日文主文案（#72 的已核准文案是繁中；日文版屬內容 lane）；核心問題以 display＋單一 marker 強調。規約依文件語言設 `lang`。Auth 單欄。404 一句話＋ホーム／練習。

---

## 8. States & truthfulness

| State | 呈現 | 文案原則（例） |
| --- | --- | --- |
| 未ログイン | StatePanel＋ログイン／新規登録 | 「ログインすると、解答が記録されます」——不暗示已有紀錄 |
| Plus が必要 | StatePanel＋ログイン／Plus について | 「会員状態はサーバー側で判定します」 |
| 会員状態を確認できない | StatePanel＋再試行 | ローカルの情報で代用しない |
| 読み込み中 | 與最終版面同尺寸的 skeleton | — |
| 空 | StatePanel＋一個起點 | 「まだ…はありません」＋次の一歩 |
| データ不足 | dotted marker＋「データ不足」 | 不自行計算門檻或「あと何問」；只有在 learning authority 的規則提供具體數字時才顯示 |
| 版が古い | StatePanel＋再読み込み | 「問題の版が更新されました」 |
| 保存失敗 | inline `role="alert"`＋再試行 | 「保存できたか確認できません」 |
| 作答中にログイン期限切れ | 狀態列＋「ログインして保存」→ 登入 `Dialog` | 「解答はまだ保存されていません」；不離開作答畫面（§7.3 E） |

### 8.1 Numeric learning thresholds（authority boundary）

本文件**不定義**任何學習／產品語意門檻，只規定「證據不足」要如何被誠實呈現。目前的數字來源：

| 數字 | 狀態 | 來源 |
| --- | --- | --- |
| 学習記録 只讀最近 50 筆 Practice attempts | **Canonical** | `learning-and-progress.md`（#109） |
| weak-area signal：同一 category／domain 至少 5 筆且至少 2 筆答錯 | **Canonical** | `learning-and-progress.md`（#109）；`src/lib/learning/practiceMyLearning.ts` |
| 答錯的題目在之後答對時從復習清單移除 | **Canonical（已實作）** | #117／#109 |
| 分野正答率的顯示門檻 | **未定義** | SPI research §9 提議 ≥5（「MVP reporting rule to validate」）→ Q7 |
| 理解の確認彙整與 pattern 規則 | **未定義** | Q7 |

參考稿中的數字（`3／5`、`2／3`、`2 問` 等）是版面示意資料。

---

## 9. Content & voice

- **V1 介面語言是日文。** 所有文字走 i18n keys，`ja` 是 source locale；不寫死任何語言（修正 B7）。
- 日文介面內不出現英文 label，除了品牌（Business Japanese Hub、Plus）與專有名詞（SPI、JLPT、Career Game 案名）。
- **禁用工程用語：** evidence、runtime、projection、payload、Workplace Learn 等。
- **語氣：** です・ます體、冷靜、直接，像可靠的先輩；不使用「かんたん」「すぐにペラペラ」之類的話；不使用感嘆號。
- **解説是判斷，不是翻譯。** 說明這句話在職場上「為什麼這樣說」「對誰、在什麼時候」「哪裡容易失禮」。
- 描述觀察而不是診斷：例如「整理（条件の表し方）での不正解が多め」而不是「あなたの弱点は論理です」——但只在 learning authority 定義了該 pattern 的成立規則後才可顯示（Q7）。
- 示意題與範例標示「サンプル」「架空の教材」。
- **草稿與審閱分開：** 日文解説與行銷文案可以從第一原理撰寫草稿，但其內容品質（正確性、自然度、語用）由內容審閱 lane 把關；本文件只規定文案的角色、語氣與排版，不是文案的核准來源（D22）。
- **不假設共同母語。** 例：「母語に訳さず、日本語のまま判断する」而不是「不要先翻成中文」。

---

## 10. Accessibility contract

WCAG 2.2 AA（§4.2 實測值）；marker、顏色、〇×、outcome 皆不單獨承載意義；每個文字節點正確 `lang`；只有一個 banner landmark。

- **Focus：** 2px ink outline＋offset＋marker halo，畫在**使用者看得到的元素**上。原生 input 被視覺隱藏的複合控制項（`ChoiceRow` select mode），focus 畫在可見的容器（`:has(:focus-visible)`）。驗收時分別確認 focus 與 selected、正解／不正解、disabled 同時存在時仍可辨識。參考：`focus-desktop-runner-choice` 截圖。
- **點擊區：** 所有獨立控制項的目標 ≥ 44×44px：按鈕、chip 連結、tab／segmented 項目、清單與選單 rows、footer 與 breadcrumb 連結、獨立的 `TextLink`。`ChoiceRow` ≥ 52px。視覺尺寸可以較小（`Button` sm 36px、segmented 32px），但必須以透明延伸區補足 44px，且延伸區不重疊相鄰目標。例外：句子或段落中的行內連結與 `NoteTrigger`（WCAG 2.5.8 inline exception）。
- **Dialog：** 依 §6 `Dialog`。
- **Reflow 與縮放：** 320 CSS px 寬（相當於 1280px 視窗 400% zoom）無水平捲動，帳號控制項可用；200% zoom；text spacing override 不截斷。
- `prefers-reduced-motion`、System／Light／Dark。

---

## 11. Responsive model & QA matrix

- Breakpoints：`< 600`、`600–959`（tab bar）、`≥ 960`（header＋並排）。
- **V1 QA matrix：`ja` × System／Light／Dark × 320／360／390／768／1024／1440。** 320 是 reflow 案例（§10）。非日文 locale 在 V1 不對使用者開放，因此不做畫面驗收；i18n 結構（無 raw key、fallback 決定性）由 unit tests 保護。
- Header 在**未登入與已登入**兩種文字下驗收；V1 依賴系統字型，因此 320／360／390 需在**至少兩種字型環境**（Apple 系統字型，以及 Windows 或 Linux 的 fallback）確認沒有水平捲動。
- **只用鍵盤**的檢查：`ChoiceRow`（兩種 mode）、`Dialog`（開啟、Tab 循環、Escape、focus 回到觸發元素）、ordering、runner 的保存與重試。
- 抽查 computed `font-family`：原文 → 明朝、解説與 UI → 黑體。
- Lighthouse mobile 不得低於 stage 前 baseline（#77／#96）。本機 QA 不是 private-content artifact admission。

---

## 12. Implementation sequence

每個 stage 一個 bounded issue／PR，依 #166 serial loop；每次 merge 需 deployment owner 授權（#186）。

| Stage | 範圍 | 主要檔案 | 依賴 |
| --- | --- | --- | --- |
| **S0 Defects** | B1、B3（B4 可延到 S6；B5 移到 S1） | `reader.css`、`src/reader/*`、`workplace-learn.css` | 無（#191） |
| **S1 Japanese-first copy** | B7：學習 surfaces 的介面文案移入 i18n，`ja` 為 source；日文分野名稱；Plus 對象文案；B5（含 footer 的販売者 placeholder）；B6 日文 mode labels（D8）；**V1 locale 解析固定為 `ja`、不顯示切換器**（移除桌機 header 的切換器；保留 #156 架構） | `WebTestHubPage.tsx`、`MyLearningPage.tsx`、`SpiExplainerPage.tsx`、`AboutPage.tsx`、`LearnUnitPage.tsx`、`ProductModePage.tsx`、`ReadLandingPage.tsx`、`discoveryCatalog.ts`、`Navigation.tsx`、`Header.tsx`、`Footer.tsx`、`LanguageControl.tsx`、`src/i18n/*` 等 | #194（前提已核准） |
| **S2 Tokens** | role tokens、`:lang()` type roles（含 B2）、compat aliases、移除 `--home-*`；**Reader palette 只定義一次**（現行 `editorial-v2.css` 覆寫 `reader.css` 的 `--reader-*`），B1 regression test 依 `src/main.tsx` 的實際 CSS 載入順序驗證 app × reader theme 的有效值 | `src/styles/tokens.css`、`lp-tokens.test.ts` | — |
| **S3 Shell** | Header（窄螢幕規則 §5.3；移除 mobile menu 中剩下的 `LanguageControl`，D18；日文 mode labels 與桌機切換器移除已在 S1 完成）、tab bar＋その他（`Dialog`）、focus bar、footer（§5.5，含 mode 連結） | `Header.tsx`、`Navigation.tsx`、`Layout.tsx`、`Footer.tsx`、`LanguageControl.tsx`、`AccountControl.tsx`、`productModes.ts`、i18n | S2 |
| **S4 Primitives** | §6 元件；`Dialog` 由 `src/reader/ReaderDialog.tsx` 一般化（Reader 改用同一 primitive；預設使用 app role tokens，`--reader-*` 只在 Reader context 內，B1 test 延伸到 `Dialog`）；`ChoiceRow` 兩種 mode；`OutcomeVerdict`；`AnswerInput`；`Representation` | `src/components/ui/*`、`src/styles/components.css`、`src/reader/ReaderDialog.tsx` | S2 |
| **S5 Practice** | hub 扁平化；runner 依 §7.3 的輸入、確認問題與保存矩陣（不改變既有語意）；key-term marks；完了；action bar 狀態列；runner 內登入 | `WebTestHubPage.tsx`（拆 runner） | S1、S3、S4；匿名試做依 G1 |
| **S6 Home／Plus／About** | 新首頁、Plus、About；刪 Concept C／editorial 首頁 CSS | `HomePage.tsx`、`homeEditorial.ts`、`PlusPage.tsx`、`AboutPage.tsx`、CSS | S4；primary CTA 行為依 G1 |
| **S7 学習記録** | 次の一歩、間違えた問題、観察、保存 | `MyLearningPage.tsx` | S4；signal 依 `learning-and-progress.md` 既有規則；理解の確認區塊依 Q7（未核准前不顯示，不阻擋 S7） |
| **S8 学ぶ** | レッスン重排＋rail、語彙、一覧 | `src/workplace-learn/pages.tsx`、`workplace-learn.css`、`LearnUnitPage.tsx` | S4；#195；marks 可選擇等 Q6 |
| **S9 読む** | 一覧、記事原文 sheet＋marks＋論點標籤、`NoteTrigger`＋`Dialog`、長文規則；保留 #122 的位置 | `ReadLandingPage.tsx`、`ReadDetailPage.tsx`、`reading.css` | S4；#195；理解・応用活動依 #122（不阻擋 S9，但 S9 不宣稱 loop 完成） |
| **S10 Reader／Books／Library** | focus bar、type roles、Book detail、Library | `src/reader/*`、`reader.css`、`BookPage.tsx`、`LibraryPage.tsx`、`shop.css` | S2–S4；購買 CTA 依 G2 |
| **S11 Career Game** | 共用 tokens／Sheet；`ChoiceRow` commit mode；`OutcomeVerdict`（strong／mixed／risky 不變，§7.12） | `apps/career-game/src/*` | S2、S4 |
| **S12 Cleanup & QA** | 死 CSS、raw-hex lint、§11 matrix、Lighthouse | `src/styles/*` | 全部 |

S0 立即可做；**S1（日文化）是 V1 最大的 blocker，優先於任何視覺重做**；S5 是商業價值最高的重設計。

---

## 13. Decision log

| ID | Decision | 理由 |
| --- | --- | --- |
| D1 | 先前視覺方向不再是 authority | 三次局部方向造成三套系統並存 |
| D2 | Thesis：Source & Gloss；**Gloss＝日文解説** | identity 來自內容結構；V1 的共同語言只有日文 |
| D3 | 字體跟著 `lang`；原文＝明朝角色、解説與介面＝黑體 | 同一語言內以角色區分三層；符合日本參考書／商業文件慣例 |
| D4 | V1 不載入 CJK webfont | mobile performance gate |
| D5 | Palette：desk／sheet／ink＋marker＋ok／ng；退役橘色與分類色 | 顏色只承載語意；#155 橘白對比不達 AA |
| D6 | Primary action = ink；marker 不做按鈕 | marker 的意義必須單一 |
| D7 | Marks 只來自 authored ranges 或 exact match | Learning System 不得猜測 |
| D8 | V1 mode 名稱為日文（学ぶ／読む／練習／学習記録／体験） | 日文介面不夾英文 |
| D9 | 手機底部 tab bar（4 modes＋その他） | 通勤單手；体験是另一個 origin |
| D10 | Runner／Reader／書いてみる 使用 focus mode | 作答與閱讀時 chrome 退場 |
| D11 | 練習 hub 一頁呈現所有分野 | 四層 drill-down 傷害 acquisition |
| D12 | 首頁＝specimen＋journey coverage＋learning state＋Plus＋founder | 首屏展示方法本身 |
| D13 | 学習記録只用 x／n 與「データ不足」 | product contract §4.4 |
| D14 | 介面文案禁用工程用語與英文 label | 修正 B5、B6 |
| D15 | Wordmark 統一為 Business Japanese Hub | 一個品牌一個名字 |
| D16 | Career Game 共用 tokens 與元件外觀，保留 narrative grammar 與 outcome 語意（D25） | 同一家族、不同文法 |
| D17 | 列表用 rows；卡片只給 sheet | 避免 generic card grid |
| **D18** | **V1 不顯示語言切換器；post-V1 只放在 footer 與「その他」，不放 header** | V1 只開放 `ja`（product contract §1） |
| **D19** | **Support language 是 post-V1 的可選層，位於日文解説之下，永不取代** | 保留在地化能力而不讓它決定 V1 |
| **D20** | **不振假名常用漢字；解説寫給 N1 讀者** | 受眾已通過 N1 |
| **D21** | **V1 QA 驗收只針對 `ja`** | 非日文 locale 在 V1 不開放 |
| **D22** | **內容品質審閱與視覺 authority 分開** | 文案可起草，但正確性與自然度由內容 lane 把關 |
| **D23** | **價格由設定提供，版面不依賴幣別** | 幣別是獨立商業決策，不阻擋設計 |
| **D24** | **Wordmark 統一為 Business Japanese Hub；正式 logo 為後續資產工作**（取代 Q3） | 一個品牌一個名字；logo 不阻擋實作 |
| **D25** | **Career Game 的判斷結果不是正誤**：`OutcomeVerdict` 顯示作者設定的 strong／mixed／risky，不用〇×／ok／ng | 職場判斷涉及關係、分寸與不確定性；`learning-and-progress.md` §4 將 authored quality 與 Practice 的 boolean correctness 分開 |
| **D26** | **Runner 呈現既有 Practice contract**（所有輸入類型、representation、作者確認問題、保存與前進規則）；「題意 → 立式 → 計算」只是示例 | 設計不得縮小 authored exercise contract |
| **D27** | **一個 modal `Dialog` primitive**（由 ReaderDialog 一般化），用於その他、Read 的注、runner 內登入 | 互動行為只定義一次，並沿用已驗證的 Reader 行為 |
| **D28** | **所有獨立控制項 44px 目標**（視覺可較小，以延伸區補足）；**focus 畫在可見的容器** | §10 的承諾；隱藏 input 上的 outline 看不到 |
| **D29** | **窄 header：帳號控制項永遠可見**；< 360px 只顯示 glyph；QA 含 320px reflow、登入前後、兩種字型環境 | 系統字型寬度因平台而異；390px 的截圖不能證明 360px 與 320px |
| **D30** | **Read 的理解・応用步驟位置保留給 #122**；保存不是理解 | 視覺完成不等於學習 loop 完成 |

---

## 14. Owner gates, resolved questions, and separate lanes

### 14.1 Remaining true owner gates

| ID | Gate | 只影響 | 設計上的處理 |
| --- | --- | --- | --- |
| **G0** | PR #192 及每個 stage 的 merge／production authorization（#186） | 所有 merge | 設計 authority 可在 draft 中使用；落到 `main` 需 deployment owner 授權 |
| **G1** | 匿名訪客能否先試做 SPI（free-sample 範圍，#187／#107） | S5、S6 的 primary CTA 行為 | 版面已支援兩種狀態：可試做→直接進 runner；不可→hub＋誠實的登入說明 |
| **G2** | 歷史單本 Book 購買 CTA（USD 12）是否保留 | S10 Book detail | 保留歷史 entitlement；CTA 呈現等決策 |

### 14.2 Resolved

| 原 ID | 決議 |
| --- | --- |
| Premise | 已核准：N1 合格的外國學習者、V1 Japanese-first、V1 不開放未完成 locale（product contract §1／§13.15） |
| Q1 | 退役 #155 橘色：Owner 已指示完全捨棄現行視覺系統（2026-10-02），palette 屬本 authority |
| Q3 | Wordmark 統一（D24）；logo 為後續資產工作，不阻擋實作 |
| Q8 | 接受無明朝環境退回黑體 |
| Q9 | 不需要攝影 |
| Q10 | Career Game 排在主站之後（S11） |
| Q13 | 幣別為獨立商業決策，不阻擋（D23） |
| Q14 | V1 只開放 `ja`（D18） |

### 14.3 Separate lanes（非 owner gate，也不阻擋視覺 authority）

| 原 ID | Lane | 說明 |
| --- | --- | --- |
| Q2、Q11、Q12 | **內容品質審閱** | 日文 mode 名稱、首頁／About／Plus 文案、既有內容的日文解説：可起草，由內容 lane 審閱定稿（D22） |
| Q6 | Content contract（#195 同一修訂可選） | authored annotation ranges；未加入前只用 exact match |
| #122 | **Business Reading（engagement）** | Read 的 comprehension／application 活動與其 evidence 語意；本文件只保留位置（D30） |
| Q7 | **Learning authority**（`learning-and-progress.md`／#109） | 尚未核准的學習規則：(a) 分野正答率／比率的顯示門檻（SPI research §9 提議 ≥5，標示為待驗證）、(b) 理解の確認彙整 read model 與 pattern 成立規則。核准前：只顯示計數，不顯示比率、bar 或 pattern 文句；不阻擋視覺 authority 或 S7 其他區塊 |

---

## 15. 延續與取代

**延續：** `ui-ux-research.md` 的 Japanese typography 研究（§3）、Reader chrome／settings 行為、accessibility，以及被其他文件引用的行為契約（§4.2 Preview boundary、§4.4 resume-state、§8.3 entitlement CTA states）；#157 斷行規則；#156 的 locale 架構、persistence、鍵盤行為與 legal fallback（保留在程式中；V1 不顯示切換器，post-V1 放在 footer／その他）；#155 的「不得虛構 social proof」「appearance 在 footer」「header 單列」；#72 About 的內容（需日文主版本）。

**取代：** `ui-ux-research.md` 的視覺方向（Quiet Editorial、色彩、Storefront 版面）；#74 設計文件；#77 LP 視覺規格；#155 的 color／type tokens 與 hero 構圖；`src/styles/tokens.css` 現行 `--home-*`、editorial-v2、Concept C 數值。

---

## 16. v1 → v2 變更紀錄（2026-10-02）

| 項目 | v1（已撤回） | v2 |
| --- | --- | --- |
| 受眾 | N2–N1 華語學習者、以台灣讀者為設計對象 | 已通過 N1 的外國學習者，不限母語 |
| Gloss | 繁體中文解說 | **日文解説**；母語 support 為 post-V1 可選層（D19） |
| 介面語言 | zh-TW 為主，四語系並列 | **V1 日文**；其他 locale 為後續 i18n 層（D21） |
| Type roles | 日文原文明朝 vs 繁中黑體（以語言區分） | 原文明朝 vs 解説／介面黑體（**以角色區分**，同一語言） |
| Font stacks | zh-Hant 為主 stack | `ja` 為主；zh／ko 只作 support slot |
| Mode labels | 課程／閱讀／練習／我的學習／體驗 | 学ぶ／読む／練習／学習記録／体験 |
| 語言切換 | header | footer 與「その他」（D18） |
| 振假名 | 作者標註才用 | 同；並明確不為常用漢字加註（D20） |
| Defects | B2（繁中用日文字型）為 P0 | B2 降為 foundation；新增 **B7**（學習 surfaces 寫死繁中）與 **B8**（內容契約只有繁中解說）為 P0 |
| Sequence | S0 → Tokens → Shell → … | 新增 **S1 Japanese-first copy**，排在任何視覺重做之前 |
| QA | 4 locales 全量 | `ja` 全量，其他 locale smoke |
| 色彩理由 | 含「橘色在台灣平台同質化」 | 移除地域性理由；以語意與 AA 為理由 |
| 參考稿 | 繁中文案 | 全部日文文案；解説為本參考撰寫並標示 |
| **v2.1** | 前提待 Owner 確認；切換器在 footer；14 個 open questions | 前提已核准並寫入 product contract；V1 無切換器；只剩 3 個真正的 owner gates（G0–G2），內容審閱與商業幣別分為獨立 lane |
| **v2.2** | 「n < 5 → データ不足」寫成設計規則；Q7 歸為 engineering | 移除自訂門檻（§8.1 authority boundary）；canonical 只有 50 筆窗口與 weak-area ≥5／≥2 規則；Q7 改為 learning authority |
| **v2.3**（PR #192 獨立審查） | Career Game 結果寫成〇×；runner 以單一計算題為準；ChoiceRow focus 不可見；窄 header 溢出；overlay 只有名稱 | Career Game 保留 strong／mixed／risky（D25）；runner 依既有輸入／確認問題／保存矩陣（D26）；`Dialog` 與 `NoteTrigger` 的互動 contract（D27）；focus 與 44px 點擊區（D28）；窄 header 與 320 reflow QA（D29）；Read 為 #122 保留位置（D30）；新增 `runner-states.html`、`game.html` 與 overlay／focus／窄螢幕截圖 |
| **v2.3.1**（`0389757` 的再審查 R1–R3） | 寬表格／logic-grid 撐開整頁；multi-select 的方形 key 被圓形規則覆蓋；< 360px glyph-only 連結只有 30×44 | Representation 的 min-width 鏈與可鍵盤捲動的區域（§7.3 B）；方形 key 的 cascade 修正；glyph-only 連結 44×44（§5.3）；新增寬表／6×6 grid fixture 與 `narrow-320-runner-states-table` 截圖 |
| **v2.3.2**（#192／#196／#199 integration review，#190） | §12 的 S0 含 B5、S3 含日文 mode labels 與切換器移除；B1 的結構修正與 Dialog 的 reader tokens 未列入驗收 | S0＝B1、B3；B5、B6 與桌機切換器移除歸 S1（#194 實作）；S2 加入 Reader palette 單一定義與實際 cascade 的 B1 test；S3 移除 mobile menu 的切換器；S4 的 `Dialog` 預設 app role tokens。只修正 stage 歸屬與驗收，不改設計決策 |

---

## 17. Reference artifacts

| 檔案 | 內容 |
| --- | --- |
| [`docs/design/reference/index.html`](design/reference/index.html) | 系統總覽：三種角色、marks、色彩、components、Never、post-V1 support slot |
| [`home.html`](design/reference/home.html)、[`practice.html`](design/reference/practice.html)（`#more`：その他 sheet）、[`runner.html`](design/reference/runner.html)（`#question`／`#checkpoint`／`#feedback`）、[`learn.html`](design/reference/learn.html)、[`read.html`](design/reference/read.html)（`#note1`：長い注）、[`my-learning.html`](design/reference/my-learning.html)、[`plus.html`](design/reference/plus.html) | 主要 surfaces（responsive；`#dark` 或 `?theme=dark`） |
| [`runner-states.html`](design/reference/runner-states.html)（`#signin`） | 練習 runner 的輸入類型、representation、確認問題狀態、保存狀態、完了（§7.3） |
| [`game.html`](design/reference/game.html)（`#decision`／`#strong`／`#mixed`／`#risky`） | Career Game：commit choices 與三種判斷結果（§7.12），使用已公開的實際內容 |
| [`tokens.css`](design/reference/tokens.css)、[`reference.css`](design/reference/reference.css) | Token 規格與參考 component CSS |
| [`screenshots/`](design/reference/screenshots/) | 1440 桌機、390 手機（2x）、dark 樣本；`narrow-320-*`／`narrow-360-*`（窄 header；`narrow-320-runner-states-table`：寬表在自己的區域內捲動）、`focus-*`（ChoiceRow focus）、`*-more-sheet`／`*-read-note`／`*-runner-signin`（Dialog 開啟狀態）、`*-game-*`（三種判斷結果）；以及 `audit-live-*` 現況證據 |

參考稿只使用已公開的 `non-proprietary-teaching-sample` 內容（日文原文部分）、Career Game 已公開的 `upward-disagreement` 內容（`game.html`），與為本參考原創、標示「サンプル」的範例；Learn／Read 的日文解説為本參考撰寫（現行資料為繁中）。学習記録與結果畫面的數字是版面用示意資料。
