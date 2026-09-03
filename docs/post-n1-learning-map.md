# N1 之後的日文學習地圖

> **狀態：** Business Japanese Hub 的 canonical curriculum / content-architecture contract。
>
> 上位產品與技術 authority 仍是 `docs/product-contract.md`、`docs/platform-architecture.md`、`docs/learning-and-progress.md` 與各 bounded-context contract。本文件定義的是「學什麼、如何分類、如何把內容與練習放進同一張學習地圖」，不是新的 runtime mega-schema，也不取代 Library `Book → Chapter → ContentBlock` 或 Career Game scenario runtime。

## 1. Purpose and positioning

Business Japanese Hub 要補上的不是另一條 JLPT 考試路線，而是這個斷層：

> **從「日文檢定的日文」，走進「日本社會人的日文」。**

JLPT 提供 N5 → N1 的清楚進程，但通過 N1 之後，學習者面對的是會議、報連相、文件、企業資料、就活、職場語感、論點整理與實際判斷。這些能力沒有一張像 JLPT 等級表一樣清楚的共同地圖。

Business Japanese Hub 對使用者的公開概念名稱是：

> **N1 之後的日文學習地圖**

推薦的公開說明：

> JLPT 告訴你 N5 到 N1 該學什麼。
> 但 N1 之後，學習地圖突然消失了。
> Business Japanese Hub 把日本職場真正需要的日文能力，重新整理成一條可以繼續學習的路。

內部文件可使用 **Post-N1 Business Japanese Competency Framework** 作為技術性稱呼，但不得要求一般使用者理解 `competency framework` 這類術語。

### Audience boundary

`N1 之後` 是產品定位與主要入口，不是所有內容的硬編碼資格條件。

- 主要受眾仍是已具備 N2 / N1 附近能力、準備進入或已在日本職場的進階學習者。
- 依 `docs/product-contract.md`，同一套核心內容也必須能對日本的大學生與年輕職場人士提供實際價值。
- Taxonomy 應圍繞 **workplace capability**，而不是把 `foreigner`、JLPT 等級或繁體中文支援寫死成每個內容型別的 schema identity。
- 繁體中文是第一階段重要的 explanation/support layer，不代表核心能力只能服務中文母語者。

---

## 2. Three-layer learning architecture

不要把所有概念塞成一棵深層分類樹。Business Japanese Hub 採用三個彼此正交的層次：

```text
Learning Mode
    ↓
Capability Domain
    ↓
Skill / Situation + Cross-cutting dimensions
```

同一個能力可以在不同 learning mode 被學習、閱讀、練習、診斷或套用，而不需要複製一套 taxonomy。

### Layer A: Learning mode

Learning mode 回答：**使用者此刻在做什麼？**

1. `Learn`
2. `Read`
3. `Practice`
4. `My Learning`
5. `Experience`

### Layer B: Capability domain

Capability domain 回答：**這是在培養哪一類日本職場能力？**

1. `Meeting & Discussion`
2. `Hou-Ren-Sou`
3. `Business Writing`
4. `Business Reading`
5. `Logical Japanese`
6. `Workplace Interaction`
7. `Job Hunting`

### Layer C: Skill / situation / cross-cutting dimensions

這一層回答：**具體要做成什麼能力，以及在哪個情境下判斷是否做得好？**

Curriculum 中使用人可讀的 skill / situation 名稱，例如：

- Meeting course correction
- Disagreeing upward in a meeting
- Reporting an error
- Deadline renegotiation
- Softening an email request
- Reading a mid-term management plan
- Identifying the central issue
- Request clarification
- Interview follow-up

### Curriculum labels are not evidence IDs

這些 curriculum 名稱 **不是** `@business-japanese-hub/learning` 的 production stable skill IDs，也不得直接複製到 Career Game `skillTags`、browser payload 或 server-authoritative evidence。

若一個 curriculum skill 已經對應 #57 的 stable ID，必須沿用既有值：

- `workplace-greeting`
- `request-clarification`
- `deadline-negotiation`
- `meeting-disagreement`
- `error-reporting`

若尚未有 stable evidence ID，先維持 curriculum-only human-readable label。只有在有實際 evidence consumer、已接受內容需求，而且完成 #57 所要求的 metadata / server catalog / authoring association / tests 後，才可把它提升為新的 production stable skill ID。

**不得因為本文件列出一個 curriculum skill，就自行發明平行的 dotted ID、alias 或 migration。**

### Cross-cutting dimensions

Cross-cutting dimensions 不應被誤做成彼此隔離的課程 silo。主要包含：

- **Workplace Pragmatics**：directness、hierarchy / authority、psychological distance、cushioning、saving face、ambiguity / indirectness、grammar-correct vs workplace-natural。
- **Vocabulary / Expressions**：職場語彙、固定搭配、register、reusable phrases。
- **Relationship / Context**：internal / external、peer / junior / senior、facilitator / participant、customer / vendor 等。
- **Reasoning / Structure**：論點、原因、根拠、前提、制約、結論、打ち手等在其他 domain 中的交叉使用。
- **Performance conditions**：time pressure、audio-only、live interaction、written response 等。

### Why `Workplace Pragmatics` is cross-cutting

`Workplace Pragmatics` 原本可被理解成一個獨立 domain，但大量能力其實都必須同時用到它：

- Meeting 的 course correction 需要 hierarchy、directness、saving face。
- Hou-Ren-Sou 的 bad-news reporting 需要 timing、authority、cushioning。
- Business Writing 的 request / apology 需要 distance、register、tone。
- Job Hunting 的 interview answer 也有 authority、formality 與 naturalness 問題。

因此本 framework 把 **Pragmatics 定義成 cross-cutting ownership dimension**。仍然可以製作直接教 pragmatics 的 Learn module，但該 module 必須同時指定主要 workplace domain / situation，避免形成與所有其他 domain 重疊的第二套課綱。

---

## 3. Canonical learning modes

### 3.1 Learn

**目的：** 學會一個明確、可轉移到工作上的能力。

Learn 不是單字表，也不是「敬語句型 20 選」。核心是讓使用者理解：

```text
Situation
  → Judgment / decision
  → Natural Japanese
  → Why / communication strategy
  → Practice
  → Transfer to work
```

Learn 可以由 Library Book / Chapter 承載，也可以未來由其他 presentation surface 呈現。這個 learning mode 不改變 Library 的 `Book → Chapter → ContentBlock` runtime contract。

### 3.2 Read

**目的：** 直接讀懂日本的 business information，而不是永遠依賴中文二手摘要。

Read 的核心不是「文章 + 單字」，而是：

```text
Business text / context
  → vocabulary & expressions
  → sentence / logic analysis
  → business background
  → comprehension / discussion
  → reusable expressions
```

### 3.3 Practice

**目的：** 用可重複的題型進行 retrieval、judgment 與 deliberate practice。

Practice 應盡量跨 domain 重用，不為每一個 lesson 重新發明一套互動方式。

### 3.4 My Learning

**目的：** 幫使用者知道「最近學了什麼、哪裡容易出錯、下一步該回去複習什麼」。

它不是 LMS dashboard，也不是 AI mastery score。第一階段只接受 deterministic、可解釋、由真實 consumer 需要驅動的 read model。

### 3.5 Experience

**目的：** 在具體敘事與上下文中套用能力。

目前第一個產品是 **Career Game**。Career Game 保持自己的 scenario / scene / choice / outcome / feedback / progression runtime，不因本 taxonomy 被改造成 Learn 或 Practice schema。

---

## 4. Canonical capability domains

### 4.1 Meeting & Discussion

主要 ownership：多人同步討論、介入、整理、形成決策。

典型 subskills：

- participate / take the floor
- clarify the issue
- interrupt professionally
- facilitate
- course-correct
- summarize
- disagree / challenge constructively
- converge / decide
- parking off-scope topics
- close / confirm next action

### 4.2 Hou-Ren-Sou

主要 ownership：對工作狀態、風險、問題與需求做適時、適量、適當對象的報告・連絡・相談。

典型 subskills：

- progress reporting
- bad-news / mistake reporting
- escalation
- consultation
- asking for help
- uncertainty / risk reporting
- deadline renegotiation
- confirming ownership / next action

### 4.3 Business Writing

主要 ownership：以書面形式完成日本職場任務。

典型 subskills：

- email
- business chat
- requests / reminders / follow-up
- apology / correction
- meeting minutes
- reports
- proposals
- executive summaries

### 4.4 Business Reading

主要 ownership：讀懂真實日本企業、產業、政府與商業資訊。

典型 subskills / materials：

- business news
- corporate presentations
- 決算説明資料
- 統合報告書
- 中期経営計画
- industry reports
- government reports
- business books / magazines where rights allow

### 4.5 Logical Japanese

主要 ownership：用日文辨識、整理與表達商業推理結構。

典型 concepts：

- 論点
- 仮説
- 原因
- 根拠
- 前提
- 制約
- 示唆
- 打ち手
- 結論 / recommendation

Logical Japanese 可作為獨立 Learn domain，也應被 cross-tag 到 Meeting、Writing、Reading 等需要結構化思考的內容。

### 4.6 Workplace Interaction

主要 ownership：不屬於正式會議、報連相或書面文件，但在日常職場頻繁出現的互動能力。

典型 subskills：

- workplace greeting / introduction
- request clarification
- asking someone to repeat / rephrase
- making a small request
- responding to an ambiguous request
- checking understanding
- internal courtesy / handoff language

這個 domain 是由現有 #57 stable skills 反向驗證出的必要分類。若缺少它，`workplace-greeting`、`request-clarification` 會被勉強塞進 Meeting 或 Hou-Ren-Sou，造成 taxonomy distortion。

### 4.7 Job Hunting

主要 ownership：日本求職與選考過程的語言 / 判斷能力。

典型 subskills：

- interview
- 自己PR
- 志望動機
- ES / 職務経歴書 language
- recruiter communication
- SPI / Web Test language and test-specific reading

SPI / Web Test 的 reasoning / calculation 本身不是「日文能力」，但其 practice product 可以放在 Job Hunting domain，並用 deterministic diagnostic tags 區分 language bottleneck 與 reasoning / calculation bottleneck。

---

## 5. Learn unit contract

這是內容作者與 issue authoring 的 semantic contract，不是新的 database schema，也不要求所有欄位直接出現在同一個 React component。

### Mandatory

每個 Learn unit 至少必須定義：

1. **Target situation**：真實 workplace situation。
2. **Learning objective**：完成後能做什麼，而非只列要背的句型。
3. **Primary capability domain + skill**。
4. **Core judgment / strategy**：使用者需要做的判斷或 communication strategy。
5. **Natural Japanese**：至少一組能代表目標能力的原創 wording / pattern。
6. **Why**：為什麼在該 context 更自然 / 更有效。
7. **Practice hook**：至少能對應一種 canonical practice type。
8. **Transfer takeaway**：如何帶回工作現場使用。

### Optional when relevant

- target learner / assumed proficiency
- relationship / authority context
- directness / formality / naturalness dimensions
- vocabulary / expression list
- `Bad vs Better` comparison
- multiple relationship variants
- audio transcript / scenario
- common learner misread
- related Read item
- related Career Game case
- review / saved-expression hook
- Traditional Chinese support explanation

### Presentation principle

推薦內容流是：

```text
Situation → Decision → Natural Japanese → Why / Strategy → Practice → Apply at Work
```

Vocabulary、Bad vs Better、relationship shift、deeper theory 等是可插入的支援層，不應把所有 Learn module 強迫成完全相同的長頁面順序。

---

## 6. Read content contract

### What counts as a Read item

Read item 必須訓練「直接讀取日本 business information」的能力，而不是只有生詞註解。

至少包含：

1. **Business context**：為什麼這份資料在真實工作 / 商業世界重要。
2. **Japanese text or internally authored representation**。
3. **Highlighted vocabulary / expressions**。
4. **Sentence or logic analysis**：必要時解構長句、因果、對比、論點或數字關係。
5. **Background**：公司、產業、制度或資料類型的必要背景。
6. **Comprehension / discussion**。
7. **Reusable expressions / concepts**。

### Rights / provenance rule

Read 不代表可以直接把第三方文章或商業書全文放進產品。

可使用：

- Business Japanese Hub 原創內容
- public-domain material
- 合法授權內容
- 官方 / primary-source material 在其使用條款允許的範圍
- 必要且合理的短引用，搭配自身分析，並遵守適用法規與 repository copyright policy

對受著作權保護且無授權的來源，優先使用：

- internally authored summary
- 自行整理的 data / concepts
- 自行撰寫的 examples

不得把來源書籍的章節結構、練習題、例句集合或高度個別化表達直接變成 Business Japanese Hub 的 product taxonomy / production content。

### Chinese explanation layer

繁體中文的作用是降低理解摩擦，不是取代日文閱讀。預設順序應是「先看日文，再提供必要的中文支援與 business context」，而不是把 Read 退化成中文摘要網站。

---

## 7. Practice taxonomy

Canonical reusable practice types：

- `situational-choice`
- `rewrite`
- `tone-ranking`
- `naturalness-judgment`
- `intent-classification`
- `relationship-shift`
- `vocabulary-recall`
- `reading-comprehension`
- `timed-web-test`
- `audio-scenario`

同一個 Learn / Read item 可以掛多個 practice types，但 practice runtime 不應因某一堂課而增加 lesson-specific branching。

### Deterministic diagnosis tags

Practice item / outcome 可以標示一個或多個可解釋的 weakness dimensions：

- `language.vocabulary`
- `language.reading-comprehension`
- `communication.pragmatics`
- `communication.authority-context`
- `logic.structuring`
- `reasoning.model-selection`
- `calculation.execution`
- `performance.time-pressure`

這些是 diagnosis dimensions，不是 #57 evidence skill IDs，也不得當作 Career Game `skillTags` 寫入 `learning_evidence`。

第一階段允許的 read model 例如：

```text
損益算 正答率 60%
計算 execution 85%
Japanese problem wording 42%
→ 最近主要 bottleneck 可能在比例 / 利益相關的日文理解
```

但判斷規則必須 deterministic、可追溯，而且資料不足時不得偽裝成高可信度的個人能力診斷。

---

## 8. Relationship to existing #57 learning/progress seam

`docs/learning-and-progress.md` 已經定義五個 production stable skill IDs：

```text
workplace-greeting
request-clarification
deadline-negotiation
meeting-disagreement
error-reporting
```

本 framework **不重新命名、不批次 migrate、不建立 alias，也不把它們替換成 taxonomy node IDs**。

它們是 content-driven 的 stable evidence skills，可映射到新的上層分類：

| Existing stable skill | Primary domain | Cross-cutting dimensions |
| --- | --- | --- |
| `workplace-greeting` | Workplace Interaction | pragmatics, relationship-context |
| `request-clarification` | Workplace Interaction | pragmatics, authority-context |
| `deadline-negotiation` | Hou-Ren-Sou | pragmatics, authority-context, time |
| `meeting-disagreement` | Meeting & Discussion | pragmatics, authority-context, logical-structuring |
| `error-reporting` | Hou-Ren-Sou | pragmatics, authority-context, risk-reporting |

### Stable skill rule

`@business-japanese-hub/learning` 的 skill IDs 仍遵守 #57 contract：

- 由已接受、實際要產生 evidence 的內容需求驅動。
- 不因本文件列出每一個 curriculum subskill 就自動建立 DB / package ID。
- 新增 production stable skill 時，必須同步更新 authoritative metadata、server catalog、authoring association 與測試。
- Browser 仍不可提交任意 taxonomy tag 當作 server-authoritative evidence。
- Career Game authors 只能使用當前 authoritative stable skill catalog 中已存在的 `skillTags`。
- Curriculum-only labels、practice types 與 diagnosis dimensions 都不是 evidence IDs。

因此：

> **Curriculum taxonomy 比 production evidence taxonomy 更寬。**

兩者有 mapping，但不是一對一，也不應被強迫合併。

---

## 9. Career Game and Experience

Career Game 是 `Experience` 的第一個 implementation，但 Career Game 不等於整張 learning map。

Career Game case 應：

- 使用自己的 generic runtime contract。
- 只用 #57 authoritative stable skill IDs 作為 `skillTags` / evidence references。
- 以 curriculum 文件中的 domain / human-readable skill / dimensions 做 authoring planning，不把它們當 runtime IDs。
- 允許一個 case 同時練多個 domain / cross-cutting dimensions。
- outcome evidence 仍遵守 #57 的 `strong | mixed | risky` bounded quality contract。

例：`會議中向上提出異議` 可以被 curriculum 分類成：

```text
mode: Experience
product: Career Game
domain: Meeting & Discussion
curriculum skill: Disagreeing upward in a meeting
dimensions: pragmatics, authority-context, logical-structuring
```

若該 case 要產生現有 meeting-disagreement evidence，runtime `skillTags` 應使用已存在的：

```text
meeting-disagreement
```

不得自行建立 `meeting.disagree-upward` 或其他平行 ID 取代它。

---

## 10. SPI / Web Test placement

#82 的 SPI / Web Test 研究位於：

```text
mode: Practice
primary domain: Job Hunting
first test family: SPI
```

核心 practice/question contract 應保持 generic：

- test family
- verbal / nonverbal domain
- category / subcategory
- difficulty
- timing
- prompt / answer / explanation
- version / provenance
- deterministic diagnostic tags

Foreigner-first 差異主要放在 support / explanation layer：

- 繁體中文關鍵詞解說
- plain-language Japanese restatement
- foreign-learner common misread
- language-vs-reasoning diagnosis

不要把 `SPI` 或 `Traditional Chinese` 變成所有 Practice runtime 的硬編碼前提。

---

## 11. My Learning / diagnosis / review

My Learning 只聚合已存在的可靠 evidence，不創造新的權威事實。

候選功能：

- Weakness Diagnosis
- Mistake Review
- Saved Expressions
- Recent Practice
- Progress by domain / skill

任何 derived summary 必須先回答：

1. consumer 是誰？
2. 使用者下一步會因這個 summary 做什麼？
3. 規則是否 deterministic？
4. 資料量不足時如何表示 uncertainty？
5. 是否能沿用 #57 evidence，而不是再建一套平行 tracking？

明確 non-goals：

- opaque AI mastery score
- certificates / cohorts
- streak economy / gems
- leaderboard / social comparison
- 大型 LMS dashboard

---

## 12. GitHub content-ticket taxonomy

### Epic

只有在需要多個 child issues / multiple deliverables 時才叫 Epic。

例：

```text
[Epic][Meeting] Build Meeting & Discussion curriculum wave
```

單一 lesson / module 不應標成 Epic。

### Learn content module

```text
[Content][Meeting][P0] Course Correction
[Content][Hou-Ren-Sou][P0] Reporting Bad News
[Content][Writing][P1] Softening Requests by Email
[Content][Logical Japanese][P0] Structuring a Business Argument
```

### Reading

```text
[Reading][Corporate Reports] How to read 中期経営計画
[Reading][Business Vocabulary] 論点・打ち手・解像度
```

### Reusable Practice / product capability

```text
[Practice][P0] Build situational-choice mode
[Practice][P1] Build Rewrite exercise mode
[Practice][SPI][P0] Build verbal practice MVP
```

### Learning analytics / review

```text
[Learning Analytics] Diagnose pragmatic vs vocabulary weakness
[Review] Add mistake review queue
[Expressions] Add My Expressions
```

### Research

Research ticket 必須產生 decision-oriented artifact，而不是只蒐集連結。

```text
[Research][SPI] Validate foreigners-first Web Test practice thesis
[Research][Reading] Evaluate licensed / primary-source business-reading sources
```

---

## 13. Existing issue reconciliation

| Issue / family | Placement | Notes |
| --- | --- | --- |
| #72 About narrative | Positioning | `N1 後學習地圖消失` 是 brand narrative，不是 curriculum runtime。 |
| #83 Meeting Facilitation / Course Correction | Learn → Meeting & Discussion | 第一個 reference Learn module，用來驗證 unit contract。 |
| #82 SPI / Web Test | Practice → Job Hunting | Research first；SPI 是 first test family，不是 platform-wide assumption。 |
| #52 / #56 / #58 / #68 Career Game family | Experience | 保持 own bounded runtime，case 只用 authoritative stable evidence IDs。 |
| #57 shared learning/progress seam | Evidence infrastructure | 不被本 taxonomy 取代；existing stable skill IDs 保留。 |
| Library / Reader | Delivery bounded context | 可以承載 Learn / Read 與有限的 authored Practice blocks，但 Book schema 不變。 |

---

## 14. Rules for adding a new skill / module without taxonomy drift

建立新 content issue 前，先回答以下問題：

1. **Mode**：Learn / Read / Practice / My Learning / Experience 哪一個是主要 mode？
2. **Primary domain**：現有 domain 哪一個負主要 ownership？
3. **Concrete skill / situation**：使用者實際要會做什麼？
4. **Cross-cutting dimensions**：是否涉及 pragmatics、authority、vocabulary、logic、time pressure 等？
5. **Existing overlap**：是否已經有一張票 / module 教同一個能力？
6. **Practice reuse**：能否使用 existing practice type，而不是新造一種互動？
7. **Diagnosis**：若會產生結果，需要哪些 deterministic dimensions？
8. **Source / rights**：內容是否原創、public domain、licensed、official-source-safe？
9. **Evidence need**：真的需要新增 production stable skill ID 嗎？還是 curriculum-only label 就足夠？
10. **Stable overlap**：若概念已對應 #57 stable ID，是否直接沿用既有 ID，而非建立 alias / dotted replacement？

### Adding a new top-level domain

只有在下列情況才應新增 top-level domain：

- 有多個彼此獨立的真實 workplace capabilities 無法自然放入現有 domain。
- 強行分類會讓使用者難以理解或造成大量 cross-ownership。
- 名稱是 user-meaningful workplace capability，而不是某一本書、某個作者、某個 source chapter 的分類。
- 已檢查是否其實只是 cross-cutting dimension。

新增 domain 前先更新本文件，再生成大量 child content tickets。

### Never do this

- 因為一本 EPUB 有 12 章，就建立 12 個 canonical domains。
- 把第三方教材章節名直接變成 product taxonomy。
- 為每一堂課新增新的 database schema / renderer / progress model。
- 把所有 Learn / Read / SPI / Career Game content 強塞進一個 universal mega-schema。
- 看到一個新詞就新增 production evidence skill ID。
- 把 curriculum-only label、practice type 或 diagnosis dimension 直接貼進 Career Game `skillTags`。
- 為已存在的 #57 skill 建立另一個「看起來更整齊」的平行 ID。

---

## 15. Canonical learning loop

Business Japanese Hub 的產品 loop 應被理解為：

```text
Discover a capability
        ↓
Learn / Read
        ↓
Practice / Experience
        ↓
Deterministic evidence
        ↓
My Learning / Review
        ↓
Return to the next useful capability
```

較短的內容設計檢查可使用：

> **Skill → Situation → Practice → Diagnosis → Review**

這是 learning loop，不是要求所有 frontend 共享相同頁面、route、DB table 或 runtime state。

---

## 16. Open questions / future extensions

以下保留為未來 evidence-driven decisions，不在本 issue 預先實作：

- 是否需要更完整的 speaking / live-response mode。
- 是否需要 industry-specific overlays，例如 consulting、IT、finance、sales。
- 是否要把 Japanese-native young-professional 入口做成與 `N1 之後` 不同的 public framing，但共用同一 capability map。
- SPI 之外哪些 Web Test family 值得正式支援。
- My Learning 是否需要 spaced review / expression notebook，以及其 deterministic contract。
- 哪些 authentic business-reading sources 可長期合法、穩定地用於產品。
- 哪些 curriculum skills 有足夠 consumer 需要，值得升級成 #57 production stable evidence IDs。

這些 future extensions 都不得推翻兩個既有產品 boundary：Library 仍是 `Book → Chapter → ContentBlock`；Career Game 仍使用自己的 scenario runtime；shared platform 只增加 narrow、consumer-driven contracts。
