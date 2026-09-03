# Foreigners-first 日本就活 Web Test / SPI-style Practice MVP

> **狀態：** #82 decision-oriented research / product-design artifact。
>
> **研究日期：** 2026-09-04
>
> 本文件只決定「值不值得做、先做多小、content / checkpoint-reporting / IP contract 長什麼樣」。不建立 production quiz UI、不生成大型題庫、不改 payment / entitlement / Career Game runtime，也不建立第三套 shared LMS schema。

## 1. Executive recommendation

### Decision

**做，但只做一個小型 validation MVP。**

Business Japanese Hub 不應做「另一個 SPI 題庫」。第一個待驗證的 differentiated job 是：

> **幫進階外國求職者看見：這題的題幹理解、解法表示或計算 checkpoint 哪裡沒有通過，再驗證這些觀察是否有助於分辨日文與推理／計算上的學習需要。**

這是待 real-user validation 的產品假設，不是已證實的 user-level causal diagnosis。

推薦的產品入口名稱先使用中性的：

> **日本就活 Web Test**

其中第一個 `test_family` 是 `spi`。不要把整個 Practice runtime 寫死成 SPI，也不要在 evidence 不足時同時做玉手箱、TG-WEB、CAB/GAB、SCOA。

### Target user

第一階段核心對象：

- 約 JLPT N2 / N1、或具同等閱讀能力；
- 在日本的外國留學生、外國籍求職者、海外 applicant；
- 已知道一般數學／邏輯概念，但在日本就活 Web Test 上因日文、題型、時間壓力而失分；
- 第一支 support language 為繁體中文，但 generic practice core 必須 localization-ready。

這個 `foreigners-first` 定位主要存在於 **explanation / diagnostic support layer**。依 `docs/post-n1-learning-map.md`，底層能力與 practice core 不把 `foreigner` 或中文寫成 schema identity，因此未來同一套練習也可服務日本大學生／年輕職場人士。

### MVP scope

推薦第一輪只驗證：

1. SPI-style **言語**：語彙／語義、句子關係與排序、長文／文章理解。
2. SPI-style **非言語中高度依賴題幹理解的類型**：割合・損益、速度／rate、集合／條件整理／推論。
3. `untimed learning` + bounded `timed practice`。
4. 每題都有原創日文題幹、一般解說與 foreigners-first explanation layer。
5. 少量題目加入 deterministic diagnostic checkpoints，先報告 language / reasoning / calculation / time-pressure 相關的 checkpoint performance 與 observed weakness；這些觀察能否支持有用的 language-vs-reasoning diagnosis，留待 real-user validation，不把它們當作已證實的原因。
6. Mistake review / category result 只做到能支持 validation，不先做 gamification、leaderboard、streak、AI mastery score。

第一批建議 **36–48 題原創高品質題目**，而不是數百題。這個數量是 validation budget，不是產品永久規格；如果 36–48 題仍無法讓真實使用者感受到 differentiated value，就不該用大量內容掩蓋定位問題。

### Do not build in MVP

- 性格檢查「攻略」或教使用者如何操縱 personality answers；
- 完整模擬官方 SPI 的 proprietary adaptive/timing mechanics；
- 玉手箱 / TG-WEB / CAB/GAB / SCOA 題庫；
- 大型 analytics warehouse；
- AI-generated score 或「你有 83% 就職力」；
- 第三 frontend app；
- subscription / coins / gems / leaderboard；
- copied / reconstructed proprietary questions。

---

## 2. Evidence that makes the hypothesis worth testing

### 2.1 Official evidence: Japanese reading can contaminate aptitude measurement

Recruit Management Solutions itself states that for foreign candidates, Japanese reading ability can make ordinary Japanese SPI results unsuitable for accurately judging underlying aptitude. It specifically notes that even candidates who appear fluent may take longer to understand the question's essence or answer differently from the intended meaning, and recommends GSPI3 in English, Simplified Chinese, Traditional Chinese or Korean when the goal is aptitude measurement rather than Japanese-language assessment.

Source:
- Recruit Management Solutions, 「活躍できる外国人を採用するためにGSPI3を活用しよう！」, https://www.spi.recruit.co.jp/spi3news/000122.html (accessed 2026-09-04)

This is unusually strong evidence that the test provider recognizes a **language-contamination problem in aptitude measurement**.

Important interpretation:

- This does **not** prove that every foreign candidate needs a bilingual prep product.
- It supports treating `Japanese reading load` and `underlying aptitude` as distinct constructs worth testing; it does not validate a user-level checkpoint diagnosis.
- In real Japanese-company recruitment, candidates may still be asked to take Japanese tests, so preparation for the Japanese wording remains practically relevant even when multilingual assessment would be psychometrically cleaner.

### 2.2 Institutional / supply-side signal: institutions offer dedicated SPI support

Current Japanese university / public employment guidance shows institutional provision or recommendation of dedicated SPI support; it does not by itself establish target-user demand:

- Tohoku University ran a 2026 SPI preparation course specifically for international students, split into verbal and non-verbal sessions. The course was conducted in Japanese with no other-language support and recommended around N3-level Japanese comprehension.
- Takushoku University offered a 2026 international-student SPI intensive course consisting of six 90-minute sessions.
- Kyushu University tells international students that written/aptitude tests are mostly in Japanese, commonly involve verbal and mathematical questions, and require fast accurate solving.
- Tokyo Foreign Employment Service Center lists SPI among representative written tests for international students and recommends advance preparation.

Sources:
- Tohoku University Career Support Office, 2026-06, https://www.career.ihe.tohoku.ac.jp/event/event-13305/ (accessed 2026-09-04)
- Takushoku University, 2026-01-22, https://tac.takushoku-u.ac.jp/news/career/news071/ (accessed 2026-09-04)
- Kyushu University, https://www.kyushu-u.ac.jp/ja/education/employment/foreign/jobhunting (accessed 2026-09-04)
- Tokyo Foreign Employment Service Center / MHLW, https://jsite.mhlw.go.jp/tokyo-foreigner/yokuaru_goshitsumon/ryugakusei/q_38_a4.html (accessed 2026-09-04)

This supports an **institutional / supply-side signal** that dedicated preparation is being offered or recommended. It does not establish target-user demand, unmet pain, enrollment or utilization, outcomes, willingness-to-pay, or product-market fit. Traditional Chinese explanation and language-vs-reasoning diagnosis remain validation hypotheses as well.

### 2.3 Research evidence: foreign learners can show different error/time patterns

A 2017 study of Chinese undergraduate international students reported that Japanese students outperformed Chinese students on several SPI verbal task types, and that the international students generally took longer to answer. It highlighted polysemy, idioms, non-kanji vocabulary, broader reading exposure, Japanese social/cultural knowledge, test-specific response format and speed practice as relevant preparation areas.

Source:
- 「中国人学部留学生のSPIの解答の傾向」, 専門日本語教育研究 19, CiNii Research, https://cir.nii.ac.jp/crid/1390848647544696960 (accessed 2026-09-04)

Use this as prior evidence, not as a 2026 prevalence estimate. The study is old and population-specific; current validation with Business Japanese Hub target users is still required.

---

## 3. Current test landscape

### 3.1 SPI is a valid first family

Recruit reports SPI3 usage of 16,500 companies and 2.766 million examinees in the fiscal year ending March 2026. Official documentation describes an ability test and a personality test. The ability test covers verbal and non-verbal domains and is intended to measure language comprehension, numerical processing and logical thinking. Delivery methods include test center, in-house CBT, WEB testing and paper depending on product / use case.

Sources:
- https://www.spi.recruit.co.jp/ (accessed 2026-09-04)
- https://www.spi.recruit.co.jp/spi3news/000573.html (accessed 2026-09-04)
- https://www.spi.recruit.co.jp/lp/landing_v3_b.html (accessed 2026-09-04)

For Business Japanese Hub, only **ability-test preparation** is in MVP scope. Personality testing is not a skill-training target.

### 3.2 Exact question families vary by format and source convention

Official Recruit materials reliably establish the broad `verbal / non-verbal` split, but do not publish a canonical complete list of operational question types. Recruit's own test-center page explicitly says it does not publish information about actual questions or prep books.

Rikunabi's 2026-updated preparation guide describes verbal examples such as vocabulary and reading comprehension, and non-verbal examples as numerical processing / logical thinking. Current prep sources commonly further divide verbal practice into relationships between words, word meaning/usage, sentence ordering/completion, idiom formation and long reading; non-verbal practice commonly includes inference, probability, tables, rates, ratios, profit/loss and similar patterns.

Sources:
- Recruit test center: https://www.spi.recruit.co.jp/testcenter/ (accessed 2026-09-04)
- Rikunabi, updated 2026-07-07: https://job.rikunabi.com/contents/test/22996/ (accessed 2026-09-04)
- Rikunabi practice examples: https://job.rikunabi.com/contents/test/19580/ (accessed 2026-09-04)

Product rule:

> Treat detailed task-family names as **our practice taxonomy informed by current prep conventions**, not as an assertion that Recruit officially defines or guarantees those exact categories.

The content schema should therefore keep both `test_family` and `delivery_profile / practice_profile` extensible rather than pretending every SPI delivery method is identical.

### 3.3 Adjacent families matter, but only as architecture foresight

The Japanese recruitment-test landscape is broader than SPI:

| Family | Current primary-source signal | MVP decision |
| --- | --- | --- |
| SPI | Recruit; ability + personality, multiple delivery methods | **Build first** |
| 玉手箱Ⅲ | SHL Web aptitude; verbal, numerical, English understanding + personality | Architecture-ready only |
| GAB | SHL general aptitude family; intellectual ability + personality, online/test-center variants | Later validation |
| CAB | SHL; focused on IT engineers / digital talent potential | Later, likely role-specific |
| TG-WEB | Humanage; new-grad/career assessment family, Web/test-center/AI-proctored modes | Later validation |
| SCOA | NOMA; multi-dimensional family; SCOA-A includes verbal/numerical/logical/general knowledge/English, SCOA-i2 launched June 2026 with verbal / numerical-logical / spatial scales | Later validation |

Primary sources:
- 玉手箱Ⅲ: https://www.shl.co.jp/materials/tamatebako3/ (accessed 2026-09-04)
- SHL assessment lineup: https://www.shl.co.jp/service/assessment/ (accessed 2026-09-04)
- TG-WEB: https://tg-web.humanage.co.jp/ (accessed 2026-09-04)
- TG-WEB delivery methods: https://tg-web.humanage.co.jp/test_method/ (accessed 2026-09-04)
- SCOA: https://www.noma.co.jp/service/assessment/scoa/ (accessed 2026-09-04)
- SCOA-A: https://www.noma.co.jp/service/assessment/scoa-a/ (accessed 2026-09-04)
- SCOA-i2: https://www.noma.co.jp/service/assessment/scoa-i2/ (accessed 2026-09-04)

The value of supporting these names in architecture now is only to avoid `spi_*` fields everywhere. It is **not permission to author content for them now**.

---

## 4. Competitive scan

### Sampled 2026 product patterns

Current SPI apps / services commonly offer:

- hundreds to thousands of practice questions;
- category-specific practice;
- detailed answer explanations;
- wrong-answer / weak-question review;
- accuracy and progress charts;
- diagnostic or short mock tests;
- timed practice;
- sometimes streaks, rankings or AI Q&A.

Examples reviewed:

- INTERNOUS 「SPI対策 2026-2027」: verbal / non-verbal / English / structural / CAB, weak-area practice, accuracy graphs, streaks, offline mode.
- yuth 「SPI言語・非言語 就活問題集」: 361 questions, detailed explanations, weak/unanswered review.
- Passmaru: topic study, flashcards, quiz mode, AI questions, performance/weakness analysis, ranking.
- CareerMine: web mock / explanations / multi-domain practice.
- SPIノートの会 / Kodansha: format-specific prep books across 玉手箱, SPI WEB testing, TG-WEB, CAB/GAB.

Sources:
- https://play.google.com/store/apps/details?id=com.internous.spi (accessed 2026-09-04)
- https://play.google.com/store/apps/details?id=inc.ann.spi_taisaku (accessed 2026-09-04)
- https://play.google.com/store/apps/details?id=com.minatoapps.spi (accessed 2026-09-04)
- https://spi.careermine.jp/ (accessed 2026-09-04)
- https://spi.kodansha.co.jp/ (accessed 2026-09-04)

### Foreigner-facing / institutional offerings

A focused scan of offerings explicitly aimed at international students found institutional or adjacent support, not a clearly differentiated direct-to-consumer language-vs-reasoning product:

| Offering | What the cited page shows | Access / pricing observed | What this does and does not establish |
| --- | --- | --- | --- |
| KIT / Asia Jinzai Network | An international-student job-placement support network with employment-exam preparation of approximately 200 practice questions and smartphone access. | The KIT page describes access as free of charge for eligible students; registration uses a KIT student email. | This is a foreigner-facing practice/support channel, but not evidence of consumer willingness-to-pay or causal diagnosis value. |
| Tohoku University SPI seminar | A 2026 online seminar for international students split into verbal and non-verbal sessions, conducted in Japanese. | Institutional program; no fee is listed on the cited event page. | This is a supply-side teaching offering, not a public standalone product or proof of target-user demand. |
| Recruit GSPI3 | A multilingual assessment option for foreign candidates, including Traditional Chinese; it is an assessment product rather than a preparation product. | B2B assessment pricing is not listed in the cited source. | This is an adjacent alternative for assessment language, not a direct consumer practice competitor. |

Sources:
- KIT, 留學生向け情報: https://www.kit.ac.jp/career_index/internationalstudents/ (accessed 2026-09-04)
- Tohoku University Career Support Office, international-student SPI seminar: https://www.career.ihe.tohoku.ac.jp/en/event/call-for-participantsspi-test-preparation-seminar-for-international-students/ (accessed 2026-09-04)
- Recruit Management Solutions, GSPI3 guidance: https://www.spi.recruit.co.jp/spi3news/000122.html (accessed 2026-09-04)

### Observed access and pricing models

The broader Japanese market spans free entry diagnostics, university-gated programs and paid courses. These are public observations as of the access dates, not a like-for-like price benchmark:

| Example | Access / pricing model observed |
| --- | --- |
| CareerMine SPI mock | Free short diagnostic entry point is shown on the public page. |
| Studying.jp 一般知能＋SPI pack | Paid two-month course: 12,500 yen for the current pack, 8,000 yen for the update version; a free first lecture is available. |
| 日本福祉大学 SPI on-demand course | 12,600 yen; limited to the university's students; ten non-verbal sessions. |
| KIT / Asia Jinzai Network | Institutional access described as free for eligible KIT international students; no consumer price is listed. |
| Tohoku University seminar | Institutional offering; no fee is listed on the cited event page. |

Sources:
- CareerMine SPI mock: https://spi.careermine.jp/exam (accessed 2026-09-04)
- Studying.jp, 一般知能＋SPI pack: https://studying.jp/komuin/itempage/lapidcourse2026.html (accessed 2026-09-04)
- 日本福祉大学, SPI on-demand course: https://www.n-fukushi.ac.jp/career/shikaku/cdp/spi-taisaku/ (accessed 2026-09-04)

### What is not a differentiator by itself

Business Japanese Hub should **not** claim differentiation merely because it has:

- a question bank;
- answer explanations;
- weak-category review;
- response-time tracking;
- a mock-test timer;
- a progress graph;
- AI Q&A.

Those patterns already exist in the sampled market.

### Candidate whitespace

In the sampled current products, research did **not find a clearly marketed deterministic decomposition of**:

```text
Japanese wording / vocabulary
vs
reasoning / model selection
vs
calculation execution
vs
time pressure
```

Nor did the sampled mainstream products present Traditional Chinese as a structured support layer for Japanese question wording.

This is a **sampled-market finding, not a proof of total market absence**. Validation should test whether users value this decomposition enough to choose the product, rather than turning the absence into a marketing claim before broader competitive diligence.

---

## 5. Foreigner pain-point model

Separate evidence from hypotheses.

### Evidence-backed

1. **Japanese reading load can distort aptitude measurement for foreign candidates.** Recruit explicitly says so in its GSPI3 guidance.
2. **Institutions provide or recommend dedicated preparation for international students.** This is an institutional / supply-side signal, not proof of target-user demand or willingness-to-pay.
3. **Speed matters.** University guidance and current prep materials emphasize solving accurately under short time constraints.
4. **Verbal and non-verbal both contain language load.** Even a mathematically simple ratio/profit problem requires correct parsing of Japanese conditions and commercial vocabulary.
5. **Different error/time patterns have been observed in Chinese international students.** Existing research supports at least some foreign-learner-specific verbal burden.

### Hypotheses to validate

1. Traditional Chinese explanation materially improves learning efficiency for the first target segment.
2. Users care about knowing **why** they missed a question, not only which category is weak.
3. Some non-verbal failures may be associated with Japanese wording rather than mathematics; this possible causal interpretation requires real-user validation.
4. A small diagnostic product can be more valuable than a huge question bank if explanations are substantially better.
5. Users will repeatedly use a `meaning → representation → calculation` diagnostic flow rather than finding it too slow.
6. The audience will trust independently authored SPI-style questions if provenance / disclaimer is clear.

---

## 6. MVP information architecture

Canonical placement from `docs/post-n1-learning-map.md`:

```text
mode: Practice
primary domain: Job Hunting
first test_family: SPI
```

Recommended IA:

```text
日本就活 Web Test
└── SPI
    ├── まず診断
    ├── 言語
    ├── 非言語
    ├── 日本語でつまずきやすい問題
    ├── 時間を測って練習
    └── 間違えた問題
```

Avoid a dashboard-heavy first screen. A commuter should be able to start a short set in one or two taps.

### Core flow

```text
Choose category / short diagnostic
        ↓
Japanese question
        ↓
Answer + response time
        ↓
Correct / incorrect
        ↓
What is this question asking?
        ↓
Japanese wording / key terms
        ↓
Reasoning representation
        ↓
Solution
        ↓
Observed checkpoint performance / possible review focus
        ↓
Next / review later
```

The detailed diagnostic checkpoints should appear only where they add information. Do not make every correct easy answer go through a long explanation ritual. Present their results descriptively; do not state that a checkpoint proves why the learner failed.

### Desktop / mobile

- Mobile is a first-class commute surface.
- Timed questions must not rely on horizontal scrolling or tiny controls.
- Desktop may use more side-by-side explanation / diagram space.
- Timer must never obscure the prompt or create accidental taps.
- Reduced motion, keyboard navigation, visible focus and non-color-only result states remain mandatory.

---

## 7. Generic question / content contract

This is a research contract, not a locked TypeScript implementation.

```ts
type PracticeChoice = {
  id: string
  textJa: string
}

type PracticeRepresentation =
  | {
      kind: 'equation'
      expression: string
    }
  | {
      kind: 'table'
      columns: string[]
      rows: string[][]
    }
  | {
      kind: 'diagram'
      altText: string
      nodes: Array<{ id: string; label: string }>
      edges: Array<{ from: string; to: string; label?: string }>
    }
  | {
      kind: 'elimination'
      candidates: string[]
      steps: string[]
    }
  | {
      kind: 'logic-grid'
      columns: string[]
      rows: string[]
      cells: Array<{
        row: string
        column: string
        value: 'yes' | 'no' | 'unknown'
      }>
    }
  | {
      kind: 'other'
      label: string
      content: string
    }

type PracticeAnswer =
  | {
      input: {
        kind: 'single-choice'
        choices: PracticeChoice[]
      }
      expectedAnswer: { kind: 'single-choice'; choiceId: string }
      scoring: { kind: 'exact-choice' }
    }
  | {
      input: {
        kind: 'multi-select'
        choices: PracticeChoice[]
      }
      expectedAnswer: { kind: 'multi-select'; choiceIds: string[] }
      scoring: { kind: 'exact-set' }
    }
  | {
      input: { kind: 'short-text' }
      expectedAnswer: { kind: 'short-text'; value: string }
      scoring: { kind: 'exact-text' }
    }
  | {
      input: { kind: 'number' }
      expectedAnswer: { kind: 'number'; value: number }
      scoring: { kind: 'numeric'; tolerance?: number }
    }
  | {
      input: {
        kind: 'ordering'
        choices: PracticeChoice[]
      }
      expectedAnswer: { kind: 'ordering'; choiceIds: string[] }
      scoring: { kind: 'exact-order' }
    }

type PracticeQuestion = {
  id: string
  version: number
  testFamily: 'spi' | string
  domain: 'verbal' | 'nonverbal'
  category: string
  subcategory?: string
  deliveryProfile: string // e.g. 'web', 'test-center'
  practiceProfile: string // e.g. 'untimed-learning', 'timed-practice'
  difficulty: 'foundation' | 'standard' | 'stretch'
  targetSeconds?: number

  promptJa: string
  promptRepresentation?: PracticeRepresentation
  answer: PracticeAnswer

  coreExplanation: {
    concise: string
    whatIsAskedJa: string
    representation?: PracticeRepresentation
  }

  itemAnalysis: {
    languageLoads: Array<
      | 'vocabulary'
      | 'semantic-relation'
      | 'condition-parsing'
      | 'reading-comprehension'
    >
    vocabularyTermIds?: string[]
    reasoningLoads: Array<
      | 'model-selection'
      | 'constraint-reasoning'
      | 'quantitative-reasoning'
    >
    executionLoads: Array<'calculation' | 'choice-elimination'>
    diagnosticCheckpoints?: {
      registryVersion: number
      ids: string[]
    }
  }

  provenance: {
    authoredBy: string
    reviewedBy?: string[]
    createdAt: string
    updatedAt: string
    basis: string[]
    originalContentAttestation: true
  }
}

type PracticeQuestionSupportOverlay = {
  questionId: string
  questionVersion: number
  version: number
  byLocale: Record<string, {
    concise?: string
    whatIsAsked?: string
    keyTerms?: Array<{
      termId: string
      surface: string
      meaning: string
      note?: string
    }>
    representationExplanation?: string
    commonMisread?: string
  }>
}

type PracticeCheckpoint = {
  id: string
  version: number
  questionId: string
  questionVersion: number
  dimension: 'meaning' | 'representation' | 'execution'
  promptJa: string
  answer: PracticeAnswer
  provenance: {
    authoredBy: string
    reviewedBy?: string[]
    createdAt: string
    updatedAt: string
    originalContentAttestation: true
  }
}

type PracticeCheckpointRegistry = {
  version: number
  checkpoints: PracticeCheckpoint[]
}

type PracticeVocabularyCatalog = {
  version: number
  terms: Record<string, {
    surfaceJa: string
    explanationJa?: string
  }>
}

type PracticeQuestionBank = {
  version: number
  vocabularyCatalog: PracticeVocabularyCatalog
  questions: PracticeQuestion[]
}

type PracticeStudyManifest = {
  version: number
  questionBankVersion: number
  checkpointRegistryVersion: number
  itemSet: Array<{
    questionId: string
    questionVersion: number
    checkpointRegistryVersion: number
  }>
  selectedSupportOverlays: Array<{
    questionId: string
    questionVersion: number
    locale: string
    overlayVersion: number
  }>
  matchedBlocks: Array<{
    blockId: string
    trials: Array<{
      trialId: string
      questionId: string
      questionVersion: number
      explanation: 'ordinary' | 'foreigners-first'
      checkpointFeedback: 'hidden' | 'visible'
      supportOverlay?: {
        locale: string
        overlayVersion: number
      }
      transferItemId: string
      transferItemVersion: number
    }>
  }>
  counterbalanceScheduleVersion: number
  counterbalanceSchedule: Array<{
    participantSlot: number
    blockOrder: string[]
    trialOrderByBlock: Record<string, string[]>
  }>
}
```

### Design rules

- `PracticeQuestion` contains the generic practice core: Japanese question content, answer, core solution, item requirements and provenance. `PracticeQuestionSupportOverlay` is a separate, optional, locale-keyed support layer.
- The first support locale may be stored under `byLocale['zh-Hant']`; another locale adds a map entry rather than a new language-specific field or core renderer branch.
- A support overlay is versioned independently. Increment `PracticeQuestionSupportOverlay.version` whenever any support treatment changes, even if `questionVersion` does not; resolve the selected locale from the exact question ID/version plus overlay version rather than from the latest available translation.
- `PracticeStudyManifest` is frozen before study outcomes: it records the exact question-bank version, top-level checkpoint-registry version, and each item's registry version (which must equal the top-level version). It also records each selected support-overlay artifact as `(questionId, questionVersion, locale, overlayVersion)`, every matched block's four trials, each trial's explanation / feedback assignment and transfer-item version, and a versioned participant-slot counterbalancing schedule with block and trial order. Ordinary-explanation trials select no support overlay; foreigners-first trials may use only the exact matching overlay reference in that manifest. A later translation or allocation edit creates a new manifest and cannot silently change a completed session.
- The manifest validator must reject duplicate item / trial / block IDs, a trial whose support-overlay ref does not match its question and one listed `selectedSupportOverlays` entry, a block that does not contain exactly one trial for each explanation × checkpoint-feedback combination, and a schedule that references unknown or repeated trials. Every `itemSet` row must resolve to a question whose `itemAnalysis.diagnosticCheckpoints.registryVersion` equals both that row's and the manifest's `checkpointRegistryVersion`; a mismatch is invalid rather than silently replayed.
- Each `keyTerms[].termId` is a stable, locale-independent content reference and must match an entry in the core item's `vocabularyTermIds`; the overlay may translate or annotate that term without changing its identity.
- `coreExplanation` is the source-language solution and `whatIsAskedJa` is the canonical Japanese restatement; locale-specific prose belongs in the overlay and must be shown alongside, not instead of, the Japanese restatement.
- `diagnosticCheckpoints.ids` reference entries in the `PracticeCheckpointRegistry` version named by `diagnosticCheckpoints.registryVersion`. Each checkpoint carries its Japanese prompt, input format / choices, expected answer, dimension and provenance so Stage 0 can author and Stage 2 can score the same deterministic checkpoint. A registry version is immutable; revisions create a new version.
- The Stage 1 validator must resolve every `diagnosticCheckpoints.ids` entry in that registry version, require unique IDs, and reject any checkpoint whose `questionId` or `questionVersion` does not match the containing `PracticeQuestion`.
- When `itemAnalysis.vocabularyTermIds` is present, the containing `PracticeQuestionBank.vocabularyCatalog` is required and every ID must resolve to one stable, locale-independent catalog entry. The read model and cross-question aggregation use that bank-level catalog's `surfaceJa` / `explanationJa` as the fallback; a locale overlay only overrides that label or annotation.
- `category` and `subcategory` remain separate dimensions for navigation and aggregation; authors must not flatten the hierarchy into an undocumented category string.
- `deliveryProfile` and `practiceProfile` are extensible content labels. Read models keep them separate so Web / test-center delivery and untimed / timed / diagnostic practice semantics are not mixed accidentally.
- `promptJa` is the canonical question text. Optional `promptRepresentation` is a source-language, structured stimulus rendered with that text when a table, diagram, equation or other non-text prompt is part of the question; it is not the solution representation. `coreExplanation.representation` is the separate source-language solution payload. Neither payload contains locale-specific fields.
- Stage 1 representation validation applies to both `promptRepresentation` and `coreExplanation.representation`: reject empty required strings/arrays; require every table row to have exactly `columns.length` cells; require unique diagram node IDs and every edge endpoint to reference a declared node; require unique logic-grid row and column IDs, every cell reference to resolve to a declared row/column, and no duplicate row/column pair; and reject an `other` payload without both a label and content. This is referential / dimensional content validation, not a learner diagnosis.
- `testFamily` lives at content / presentation taxonomy boundary, not in a platform-wide payment/identity contract.
- Question content is data, not embedded in React components.
- Exact rendering details can vary by question type without arbitrary executable scripts.
- `promptJa` remains primary. Localized support explains; it does not replace Japanese practice.
- `itemAnalysis` describes what an item requires, not what caused an individual user's miss. `vocabularyTermIds` are content references, not #57 evidence IDs. Attempt records should report checkpoint pass/miss and response time separately.
- Each `PracticeAnswer` variant couples a discriminated input shape, expected answer and scoring rule for single-choice, multi-select, short-text, numeric and ordering questions; validators should reject incompatible combinations rather than infer them from `category`.
- Stage 1 answer validation must require unique choice IDs; require a single-choice `choiceId` to be offered, multi-select `choiceIds` to be a unique subset of offered IDs, and ordering `choiceIds` to be an exact permutation of offered IDs. These rules apply to both questions and checkpoints.
- Checkpoint scoring is deterministic from the authored `answer` contract; it must not produce an opaque AI score or causal diagnosis. Checkpoint `dimension` is a descriptive reporting label only.
- Version is required because explanation / distractors / diagnostics may improve after release.
- Provenance is mandatory for internally authored content.

---

## 8. Explanation contract

Every production question must answer the ordinary learner question first:

> **為什麼答案是這個？**

The optional, locale-keyed support overlay adds a second layer for a foreigners-first experience:

> **這題的日文到底在問什麼？**

Recommended structure:

1. **問題**: original authored Japanese prompt.
2. **正解 / concise solution**.
3. **這題在問什麼？**: canonical plain-language Japanese restatement from `coreExplanation.whatIsAskedJa`, with the selected support locale alongside it where useful; the first planned locale is Traditional Chinese.
4. **就活日本語 / キーワード**: only the terms that affect solving.
5. **怎麼把文字變成可解的模型？**: equation / table / logic structure / elimination.
6. **最快合理解法**: concise path, without claiming official tricks.
7. **可能需要注意哪個語言特徵？**: an authored, testable hypothesis tied to an actual language feature.
8. **回去複習什麼？**: category / term / diagnostic dimension.

The localized support fields belong in the locale-keyed overlay, not in the generic `PracticeQuestion` core. Keep `coreExplanation.whatIsAskedJa` visible as the Japanese-reading scaffold; the selected locale explains but does not replace it. Do not translate every Japanese sentence word-for-word by default. The product should train Japanese reading, not remove it.

---

## 9. Deterministic checkpoint reporting model

### Principle

An incorrect answer alone **cannot prove why the user failed**. Item tags only tell us what a question requires, not which internal process failed.

Therefore MVP reporting should combine normal attempt data with **small authored checkpoints** on a subset of high-value questions. The MVP reports deterministic observations—correctness, response time and checkpoint pass/miss—not causal reasons for an error.

For the validation study, freeze a versioned checkpoint registry and a predefined diagnostic item set before sessions begin. This is an experimental protocol, not a requirement to send every production learner through every checkpoint.

Treat explanation and checkpoint feedback as separate study factors:

- explanation condition: ordinary solution explanation vs the foreigners-first support overlay;
- checkpoint-feedback condition: the same predeclared checkpoint prompts with feedback visible vs feedback hidden / neutral.

Use matched item blocks and counterbalance the four combinations before sessions begin. In both feedback cells, administer every referenced checkpoint in the same sequence and allow the same response time; only the visible cell shows the pass/miss feedback and mapped review cue, while the hidden / neutral cell withholds that information. This isolates the incremental value of checkpoint feedback without assigning causal meaning to any pass/miss pattern.

### Checkpoint ladder

For suitable non-verbal word problems:

```text
Original Japanese question
       ↓
A. Meaning checkpoint
   「這題要你求什麼？」/ key condition
       ↓
B. Representation checkpoint
   choose equation / table / relation
       ↓
C. Execution checkpoint
   perform the arithmetic / final operation
```

Deterministic descriptive reporting:

| Observation | Descriptive report / review cue |
| --- | --- |
| Original wrong + A wrong | Report misses on the original and meaning checkpoints; suggest reviewing Japanese comprehension / test vocabulary, without attributing the original error to that cause. |
| A correct + B wrong | Report that the meaning checkpoint passed and the representation checkpoint was missed; suggest reviewing model selection, without proving a reasoning cause. |
| A + B correct + C wrong | Report an execution checkpoint miss after the earlier checkpoints passed; suggest reviewing calculation execution, without proving why the original answer was wrong. |
| Original correct but far above target time; checkpoints easy/correct | Report response time above the internal target with checkpoints passed; flag a time-related pattern for review, not a time-pressure cause. |
| Multiple checkpoints wrong | Report multiple observed checkpoint misses; do not force one causal label. |
| Too few observations | Report insufficient observations. |

For verbal questions, checkpoints can test word meaning / semantic relation / sentence logic rather than pretending a separate math model exists.

### Aggregation and read models

Do not create a single ability score. For completed attempts, report transparent counts / rates by the following deterministic rules:

| Read model | Deterministic report |
| --- | --- |
| Accuracy by test family / domain / category | `correct / completed attempts`; show `資料不足` until there are at least 5 relevant attempts. |
| Response time by category | Median elapsed time plus attempt count; keep timed and untimed attempts separate. |
| Language / reasoning / execution tag accuracy | `correct / attempts` on items carrying each `itemAnalysis` tag; this is descriptive item-grouped performance, not a latent-skill or cause estimate. |
| Timed vs untimed performance | Report accuracy and median elapsed time separately for each mode; do not infer a causal effect from unpaired sessions. |
| Recurring vocabulary-tagged misses / review candidates | Group observed misses by authored `vocabularyTermIds`; list a term as a recurring tag-miss review candidate only after at least 2 misses across at least 2 items, resolving its label from the bank-level vocabulary catalog and then applying the selected support overlay by `termId` when available. This is not a claim about a learner weakness or its cause. |
| Recent mistakes / review queue | Keep the latest incorrect attempt per question, newest first; remove it after a later review attempt is correct. Do not rank the queue by an inferred cause. |

The threshold values are an MVP reporting rule to validate, not a claim of psychometric validity. With fewer relevant observations, say `資料不足` rather than inventing precision.

Example checkpoint report:

```text
最近 12 個可診斷 attempts
Japanese comprehension checkpoint misses: 5 / 8 relevant checks
Reasoning/model-selection checkpoint misses: 1 / 6 relevant checks
Calculation/execution checkpoint misses: 0 / 5 relevant checks
Timed attempts above target: 4 / 7

→ Observed pattern to review: more comprehension-checkpoint misses and slower timed attempts; this is an observed pattern, not a confirmed cause.
```

The exact threshold / UI wording must be validated. Any language-vs-reasoning causal interpretation remains a hypothesis requiring real-user validation and, where possible, independent language / reasoning measures.

### Taxonomy boundary

These dimensions are **diagnosis dimensions**, not #57 production stable evidence skills. They must not be copied into Career Game `skillTags` or existing `learning_evidence` as if they were accepted workplace skill IDs.

---

## 10. Relationship to current repository architecture

### Consume #84, do not create a new product ontology

`docs/post-n1-learning-map.md` already places this feature at:

```text
Practice → Job Hunting → first test family SPI
```

Use that classification as content/navigation authority.

### Do not reuse Career Game runtime

Career Game's scenario / scene / choice / outcome engine models narrative workplace judgment. A timed aptitude-practice runner has different semantics. Reusing the engine would create fake abstraction.

### Do not force questions into Book / Chapter / ContentBlock

Library books may link to or editorially explain Web Test concepts, but a versioned question bank / attempt runner should remain a bounded practice module.

### Do not create a third frontend for validation

The smallest implementation should use an existing frontend shell / deployment unless a later bounded implementation issue proves a separate app is necessary. No new Cloudflare project / auth topology is justified by this research.

### #57 learning evidence

Current `docs/learning-and-progress.md` deliberately supports only:

- Library `chapter_opened` evidence;
- Career Game `outcome_reached` evidence;
- five accepted stable workplace skill IDs.

Do **not** expand that table merely because this research defines diagnostic dimensions.

For the first validation MVP, practice attempts may remain product-owned / local or use a narrow practice-specific store only when an implementation consumer requires cross-device persistence. If later My Learning needs cross-product derived evidence, open a separate bounded issue with deterministic semantics and RLS tests.

---

## 11. Original-question authoring guidelines

### Required workflow

1. Pick an accepted practice category / learning objective.
2. Author a new scenario / numbers / wording from scratch.
3. Record which **general skill pattern** informed the question, not a copied source question.
4. Add answer + solution independently.
5. Add Japanese wording review.
6. Add foreigners-first language annotation.
7. Add distractor review: wrong choices should reflect plausible mistakes, not random nonsense.
8. Run similarity / editorial review against the team's prohibited source corpus when available.
9. Record version + reviewer + provenance.

### Quality rubric

A production question should be rejected if:

- Japanese is machine-like or unnatural;
- the only challenge is obscure trivia unrelated to intended skill;
- the distractors are obviously absurd;
- multiple answers are defensible without an explanation of ambiguity;
- explanation merely restates the answer;
- foreigners-first note invents a learner problem not actually present in the wording;
- timing target is presented as official when it is only internal practice guidance;
- provenance is unclear.

---

## 12. IP / trademark / content-safety boundary

### Hard content rule

Never scrape, transcribe, copy, reconstruct or crowdsource proprietary current-test questions from:

- leaked / recalled exam questions;
- screenshots;
- commercial prep books or apps;
- user reports that reproduce specific questions;
- private test sessions;
- copyrighted question banks.

Recruit's official test-center site explicitly states that it does not publish test questions or prep-book information. Recruit also states that SPI has no official prep book and that it monitors commercial prep books, removing or replacing test items judged too similar in order to preserve fairness.

Sources:
- https://www.spi.recruit.co.jp/testcenter/ (accessed 2026-09-04)
- https://www.spi.recruit.co.jp/spi3news/000040.html (accessed 2026-09-04)

That makes `we independently authored similar skill-domain questions` the correct operating model, not `we recreated what appears on the exam`.

### Trademark / naming

The Japan Patent Office explains that registered trademark rights have defined scope and statutory limitations, and provides J-PlatPat for official trademark searches. This research did not establish a blanket rule that any specific `SPI` naming is automatically safe for a commercial prep product.

Source:
- JPO, https://www.jpo.go.jp/system/trademark/gaiyo/seidogaiyo/shotoha.html (accessed 2026-09-04)
- J-PlatPat guidance, https://www.jpo.go.jp/e/support/j_platpat/trademark_search.html (accessed 2026-09-04)

Therefore:

- Use `日本就活 Web Test` as the umbrella product name.
- Treat `SPI` / other provider test names as descriptive compatibility/preparation references at the content boundary, not as our brand identity.
- Do not use provider logos, official UI screenshots or styling that implies affiliation.
- Do not call the product `official`, `公認`, `公式`, or imply partnership.
- Before launch / paid marketing, have Japanese IP/trademark counsel review exact product name, ad copy and disclaimer.

### Questions for legal review before launch

These are review questions, not legal conclusions or approved legal advice:

1. Is each use of `SPI`, `SPI3` and any adjacent provider name a permissible nominative / compatibility reference for the intended product, page, and advertising contexts under Japanese trademark law?
2. Do the proposed umbrella name, metadata, search snippets, screenshots, or visual treatment create a likelihood of affiliation, endorsement, sponsorship, or official-test confusion?
3. Are the original prompts, answer choices, explanations, diagrams, timing guidance, and category labels sufficiently independent from protected expression, trade secrets, or unfairly obtained test information?
4. Do the originality attestation, prohibited-source workflow, and provenance records provide an adequate audit trail if a question's similarity is challenged?
5. Does the disclaimer accurately describe the relationship to each provider without implying that the disclaimer itself cures an otherwise misleading use?
6. Are the Traditional Chinese and other localized overlays faithful translations that preserve the same non-affiliation and non-reproduction claims in every market-facing language?

Candidate disclaimer for professional review, **not approved legal copy**:

> 本サービスは各適性検査提供会社の公式・公認サービスではありません。掲載する練習問題は、一般的な能力分野・問題解決スキルをもとに Business Japanese Hub が独自に作成したものです。実際の試験問題を収録・再現するものではありません。

---

## 13. Validation plan before scaling

### Participants

Recruit a small qualitative + task-based sample first, recommended **8–12 target users** across:

- N2-ish and N1-ish Japanese;
- Chinese-speaking international students / foreign job seekers as the first core segment;
- ideally some users who have already taken Japanese-company Web Tests and some who are preparing for the first time.

This is a validation target, not evidence already collected.

### Session design

1. Ask which Web Tests they have actually encountered.
2. Give a short set of original Japanese questions.
3. Capture correctness + response time.
4. Before observing any outcomes, freeze a `PracticeStudyManifest` containing the exact question-bank version, top-level and per-item registry versions, selected support-overlay artifact/version for the foreigners-first cells, matched-block membership, every trial's explanation / feedback assignment and transfer-item/version pairing, plus the `counterbalanceScheduleVersion` and participant-slot block / trial order. Assign each matched item block four comparable original questions: ordinary + feedback hidden, ordinary + feedback visible, foreigners-first + feedback hidden, and foreigners-first + feedback visible. Counterbalance item-to-cell assignment and condition order across participants; do not resolve an overlay from the latest catalog entry or reconstruct allocation after a session.
5. In both feedback cells, administer every referenced meaning → representation → execution checkpoint to the participant in the same sequence regardless of the original answer or response time; show the recorded pass/miss and mapped review cue only in the visible cells, and withhold it in the hidden / neutral cells. Do not select checkpoints after researcher judgment.
6. After each explanation, ask the participant to choose one next review action from a fixed list (for example, re-read wording, review the model, review calculation, or continue). In feedback-visible cells, predeclare an alignment rule: choose the action for the first non-passing checkpoint in the meaning → representation → execution ladder, or choose continue when all checkpoints pass. Alignment means consistency with the recorded observation, not a correct causal diagnosis.
7. Compare time-to-understanding and a short post-explanation transfer task for the ordinary vs foreigners-first conditions, using the feedback-hidden cells for the primary explanation comparison. For checkpoint value, compare both alignment with the predeclared rule and transfer accuracy / time between feedback-visible and matched feedback-hidden cells under the same explanation.
8. Ask whether the user would return specifically for `language vs reasoning` diagnosis.

### Questions to validate

- Which part felt most difficult: Japanese, vocabulary, math/reasoning, calculation, or time?
- Did the user know which one before seeing the diagnostic breakdown?
- Does Traditional Chinese materially help or simply duplicate Japanese explanation?
- Which vocabulary categories recur?
- Does the diagnostic flow feel useful or annoying?
- Which real test families did the user encounter?
- Would they prefer 40 excellent diagnostic questions or hundreds of ordinary drill questions?

### Predeclared decision rule

Before recruiting, write down the item set, registry version, timing procedure and these thresholds:

- Define an eligible start as a consented participant who begins the first question. Recruit 8–12 eligible starts and require at least 8 before making a go/no-go decision; do not recruit replacements to erase observed attrition. Keep every eligible start in the denominator, report the reason for every withdrawal, and count a checkpoint-flow confusion, slowness, technical failure or other product-caused incompletion as a failure for both gates.
- Each participant must complete at least two matched item blocks, with all four explanation/feedback combinations represented in each block. For the primary explanation comparison, define the participant-level criterion using the feedback-hidden cells: the foreigners-first condition must have at least 20% lower median time-to-understanding than the ordinary-explanation condition and its post-explanation transfer accuracy must be no more than 10 percentage points lower. Time-to-understanding means elapsed time to a correct restatement of what the question asks; transfer accuracy is the binary result on the same-format, newly authored follow-up item. An eligible start without enough data to compute this comparison fails the criterion.
- Define the checkpoint criterion as a participant meeting both conditions: at least 70% of feedback-visible review choices align with the predeclared observed-checkpoint rule, and transfer accuracy in feedback-visible cells is at least 10 percentage points higher than in matched feedback-hidden cells under the same explanation condition, without a worse median transfer-task time. Alignment is not a claim that the selected action is a true diagnosis. An eligible start without enough data to compute both comparisons fails the criterion. Call the checkpoint gate met only when at least 60% of eligible starts, rounded up, meet this criterion; report raw paired choices, alignment and transfer results.
- Call the overall value gate met only when at least 75% of eligible starts, rounded up to a whole participant, meet the primary explanation criterion and at least 60% meet the checkpoint criterion. For example, with 8 eligible starts this means at least 6 meet the explanation criterion and at least 5 meet the checkpoint criterion.
- Self-reported preference, willingness to return, and requests for a language-vs-reasoning explanation are secondary demand signals; they cannot satisfy the value gate by themselves and do not establish willingness-to-pay.

These are predeclared product-decision thresholds for a small exploratory study, not psychometric validity claims. Passing them does not turn checkpoint patterns into causal evidence.

### Success signal

Proceed to a real MVP only when the predeclared decision rule is met and target users independently show both:

1. observable user uncertainty about whether a difficulty was language-related or reasoning-related, checked against task performance where possible; and
2. clear value from the structured explanation / diagnostic checkpoints relative to the ordinary-explanation baseline under the counterbalanced comparison.

### Kill / pivot signals

Do not scale if:

- most target users report only forgotten math and existing Japanese apps are sufficient;
- Traditional Chinese support adds little value;
- users do not care why they missed questions;
- authored diagnostic checkpoints take too long and do not change learning decisions;
- real target users mostly encounter a different test family than SPI.

---

## 14. Staged implementation proposal

Only after the validation artifact is accepted, split implementation into small issues:

### Stage 0: user validation + content prototype

- Author the first 12–16 original diagnostic questions outside production UI.
- Run 8–12 target-user sessions.
- Record evidence / decision in repo.
- Gate the next stage on actual findings.

### Stage 1: generic practice content contract

- Define versioned data schema / validator.
- Add first 36–48 reviewed original questions.
- Keep `testFamily = spi` as data, not hard-coded component branches.
- Add provenance and originality checks.

### Stage 2: question runner + explanation

- Existing frontend shell.
- Category selection, question, answer, explanation, diagnostic checkpoint rendering.
- Mobile / keyboard / accessibility tests.
- No account requirement for first useful session unless evidence demands it.

### Stage 3: deterministic results + review

- Timed vs untimed attempts.
- Mistake review.
- Checkpoint performance and timing reports with minimum thresholds.
- Keep persistence product-specific unless a real cross-device consumer justifies a new server seam.

### Stage 4: production QA / small launch

- Originality + Japanese naturalness review.
- IP/trademark copy review.
- Responsive / accessibility / performance.
- Real-user smoke.
- Only then evaluate whether to expand categories or add another `test_family`.

---

## 15. Decision summary

The strongest defensible validation proposition is not:

> 「我們也有 SPI 題庫。」

It is:

> **「你答錯時，我們先讓你看到哪些題幹理解、解法表示或執行 checkpoint 沒通過，再驗證這些觀察是否幫你選擇複習方向。」**

This is a product hypothesis, not an established causal diagnosis. It is worth testing because official evidence indicates that Japanese reading can affect aptitude measurement for foreign candidates, while current university / public-employment sources provide an institutional / supply-side signal. The market still needs real-user validation of target-user demand and whether **locale-keyed support (including Traditional Chinese) + deterministic checkpoint reporting** creates enough value to drive product choice.

Therefore the next correct step is **small original-content validation**, not mass question generation and not production UI first.
