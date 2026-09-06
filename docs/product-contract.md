# Business Japanese Hub — Product Contract

> **狀態：canonical / highest product authority**
>
> 本文件定義 Business Japanese Hub 的長期產品定位、商業模型、user journey、主要 product roles 與不可被下游 implementation issue 擅自改寫的 invariants。課程／內容 taxonomy 由 [`post-n1-learning-map.md`](post-n1-learning-map.md) 定義；技術 bounded-context 與 deployment 細節由相關 architecture docs 定義。若歷史 issue、PR、README 或 implementation 與本文件衝突，以本文件為準。
>
> **Reference stability:** §5–§10 刻意保留既有 repository 文件長期引用的語意位置：§5 platform abstraction、§6 book-agnostic/runtime boundary、§7 platform responsibility、§8 UI/Reader quality、§9 web-first/platform、§10 payment architecture。新增 Plus 產品契約不得再次讓這些既有 inbound references 指向無關規則。

## 1. 核心定位

Business Japanese Hub 是一個 **web-first、subscription-based 的日本求職與日本職場日文學習服務**。

核心受眾是：

> **已經具備一定日文能力，特別是 JLPT N2～N1 程度，並希望在日本求職、讀懂日本商業資料、進入日本企業工作或提升日本職場溝通能力的華語學習者。**

產品要解決的不是「如何再考過一張日文檢定」，而是：

> **從「考試日文」升級到「能用日文求職、閱讀、思考、溝通與工作」。**

因此：

- Business Japanese Hub **不是 JLPT preparation service**。
- N2／N1 是主要使用者的 entry point／assumed proficiency，不是產品終點。
- 核心能力依 workplace capability 組織，而不是依 JLPT 文法級別組織。
- 繁體中文是第一階段主要 explanation/support layer；日文仍是主要學習、題目、閱讀與職場語境語言。
- 日本母語者、大學生或年輕職場人士可以從內容中受益，但不是要求產品設計必須同時服務的 primary segment；不得因 secondary audience 而弱化華語進階學習者的核心需求。

推薦的 user-facing brand promise：

> **從「日文檢定的日文」，走進「日本社會人的日文」。**

更直接的 acquisition wording 可以表達為：

> **考過 N2，只代表你已經有日文基礎。接下來，要學的是怎麼用日文進入日本職場。**

## 2. Canonical User Journey

Business Japanese Hub 應沿著同一個長期 user journey 持續提供價值：

```text
準備日本求職
    ↓
通過日本企業選考
    ↓
進入日本企業
    ↓
適應日本職場
    ↓
持續提升專業商務日文能力
```

這個 journey 是產品 sequencing 與內容優先級的主要判斷基準。

- **求職前**：理解日本就活、SPI／Web Test、履歷／面試與求職日文。
- **選考中**：提高讀題、推理、表達、面試與企業理解能力。
- **入社後**：學會報連相、會議、email/chat、文件、敬語與 workplace pragmatics。
- **持續成長**：能直接閱讀企業／產業／政府資料，理解更高階商務語彙與 reasoning，並在自己的職種中持續提升。

產品不能把「找到工作」視為學習旅程終點。找到工作之後仍必須有足夠的 retention value。

## 3. Business Japanese Hub Plus

### 3.1 Primary commercial model

主要付費產品是：

> **Business Japanese Hub Plus**

Plus 是 **recurring membership / subscription**。平台的主要付費單位是 membership access，不是單本 Book ownership。

### 3.2 Approved pricing direction

目前核准的產品價格方向：

| Stage | Price | Product meaning |
| --- | ---: | --- |
| **Early Access** | **NT$299 / 月** | 早期會員價格；在題庫、Reading、Vocabulary、Learning System 持續完善期間驗證付費與留存 |
| **Standard** | **NT$399 / 月** | 當 SPI 題庫、Business Reading、Vocabulary 與 Learning System 已達到更完整的持續訂閱價值後再切換 |
| **Annual（later）** | 約 **NT$3,990 / 年** | 約 10 個月月費的年繳方向；不是 Early Access launch blocker |

重要規則：

- NT$299 → NT$399 **不是依日期自動漲價**；必須由 Product Owner 明確判定產品成熟度已足以支撐 Standard pricing。
- Early Access 不需要先提供年繳；先驗證月繳 willingness-to-pay 與 subscription retention。
- NT$3,990／年是已接受的 packaging direction，不代表 recurring provider、legal disclosure、tax display 或 checkout 已實作完成。
- 真實收費前仍必須符合 #107 recurring-commerce contract 與 #112 recurring legal/compliance gates。

### 3.3 Free vs Plus value proposition

不要把 Plus 簡化成「付錢看更多文章」。

產品原則：

- **Free**：讓使用者能發現產品、理解價值、使用一部分內容／練習。
- **Plus**：讓系統持續「認識你的學習狀態」，保存並串起你做過什麼、哪裡容易錯、哪些內容值得複習，以及下一步該做什麼。

因此 Plus 的核心價值是：

> **ongoing learning state + ongoing content/practice access**

而不是單純 content paywall。

Free/member 的精確 access matrix 必須由真實產品內容與 #107 access contract 驅動；不要為了 subscription 而把所有匿名/public value 全部鎖起來。

## 4. Four product roles

以下四個角色是 Business Japanese Hub 的 business/product funnel authority。它們和 Learn／Read／Practice／My Learning／Experience 是不同維度，不得混成第二套 curriculum taxonomy。

### 4.1 SPI / Web Test Practice = Acquisition

**目的：把正在準備日本求職的人帶進 Business Japanese Hub。**

- 以 SPI 為第一個完整 test family，之後依 evidence 再擴充玉手箱等。
- SEO / editorial explainer 與真正的刷題產品要互相導流，但不要塞成同一個超長頁面。
- 使用者搜尋 SPI、Web Test、玉手箱，本身就是高度相關的日本求職 intent。
- 免費 sample 可以降低第一次使用阻力；更完整的題庫、錯題、歷史與分析可形成 Plus conversion value。

Canonical placement：`Practice → Job Hunting → 日本求職 Web Test`。

### 4.2 Business Reading = Engagement

**目的：讓使用者有持續回來的理由。**

Business Reading 不只是「文章 + 單字」。核心 loop 應接近：

```text
日本商業內容／企業資料
  → 關鍵 vocabulary / expressions
  → sentence / logic analysis
  → business context
  → comprehension / practice
  → save / review / next reading
```

內容可以涵蓋 business news、企業簡報、決算説明資料、統合報告書、中期経営計画、產業／政府資料，以及具合法使用權利的其他來源。

Reading freshness、品質與持續更新是 engagement driver；不得退化成只賣一批固定 ebook。

Canonical placement：`Read → Business Reading`，長篇 Book／Reader 也屬於 Read 的其中一種 presentation format。

### 4.3 Work in Japan = Retention

**目的：讓使用者進入日本企業之後，仍然有持續訂閱理由。**

Work in Japan 是橫跨多個 learning modes 的產品主題，不是單一 runtime。可涵蓋：

- 報連相、相談、escalation、bad-news reporting
- meeting / 打合せ / facilitation / disagreement
- Email、Slack / Teams、會議紀錄、報告、企画書
- 敬語之外的 workplace pragmatics、hierarchy、distance、tone
- KPI / OKR、1on1、人事評価、跨部門協作
- 企業／產業／IR 資料閱讀
- 工程師、PM、Sales 等職種的專業日文

Canonical placement：主要跨 `Learn`、`Read`、`Practice` 與 `Experience`。

### 4.4 Learning System = Subscription Justification

**目的：把 Content Site 變成真正的 Subscription Product。**

Learning System 至少應能逐步建立以下 user-owned learning state：

- wrong answers / mistake review
- saved items / saved expressions
- vocabulary review
- recent activity
- progress / resume
- weak-area signals（只在有 deterministic evidence 時）
- review queue
- explainable next activity / next step

產品必須能回答 returning user：

1. 我最近做到哪裡？
2. 我哪些地方一直錯？
3. 有什麼值得現在複習？
4. 我下一步應該做什麼？

Canonical placement：`My Learning` 是主要 member surface，但 Learning System 可以消費 Learn／Read／Practice／Experience 各自的 bounded evidence。

不得為了 dashboard 製造假的 mastery%、AI diagnosis、streak、XP 或 universal event mega-schema。

## 5. Platform abstraction and canonical user-facing learning architecture

Curriculum / IA 使用 [`post-n1-learning-map.md`](post-n1-learning-map.md) 定義的五個 modes：

```text
Learn | Read | Practice | My Learning | Experience
```

- **Learn**：學會一個可轉移到真實工作的能力。
- **Read**：直接讀懂日本 business information；Business Reading 與 Books 都在這裡。
- **Practice**：可重複的 retrieval / judgment / Web Test 等練習。
- **My Learning**：progress、mistakes、saved/review、weak-area signals、next step。
- **Experience**：在具體敘事與上下文中套用能力；Career Game 是第一個 Experience product。

這是 user-facing product abstraction / architecture，不等於要求五個 modes 共用一個 runtime、database table 或 frontend app。Platform-level identity、navigation 與 shared services 應讓這五個 modes 看起來屬於同一產品，但不能抹平各 bounded context 的 domain semantics。

## 6. Book-agnostic content and runtime boundaries

### 6.1 Book / Reader

`Book → Chapter → ContentBlock` 繼續是 Library / long-form editorial 的 durable content abstraction。

但：

> **Book 是內容格式，不是平台 primary commerce unit。**

必須保留：

- released Books 與 versioned authoring workflow
- Universal Reader
- chapter navigation / reading state
- public/free editorial content
- historical Book purchase / entitlement evidence

未來 UX 不得再把 Storefront / My Library 當成整個 Business Japanese Hub 的 primary mental model。

### 6.2 Career Game

Career Game 是 `Experience` 的獨立 bounded runtime，持有自己的 scenario／scene／choice／outcome／feedback／progression semantics。

不要：

- 把 Career Game 塞進 Book / Chapter / ContentBlock；
- 把 Learn / Practice 變成 Career Game state；
- 因為 membership 共用 access 就強迫所有內容進入同一 schema。

### 6.3 Learn / Practice

Learn 與 Practice 可以有 reusable presentation/runtime seams，但應只抽出真實共用部分。不得為每一課建立一套 runtime，也不得先做 generalized LMS framework。

## 7. Platform responsibility boundary and Learning System data principles

各 product runtime 擁有自己的 domain state / progress semantics；shared platform 只擁有真正跨 bounded contexts 的 narrow responsibilities，例如 durable identity、server security、authoritative membership access、必要的 shared learning evidence/projection 與 operations primitives。不得因為 My Learning 或 Plus 需要跨 surface view，就把所有 runtime data 收斂成 universal mega-schema。

不同 product runtime 可以保留自己的 progress semantics，再用 narrow adapters / read models 提供 member learning state。

可使用的 evidence 必須：

- deterministic；
- explainable；
- version-aware where relevant；
- user-owned / private；
- server-authoritative when cross-device persistence or paid/member state is involved。

例如：

- SPI Practice：attempt、question version、correctness、response time、authored diagnostic checkpoint。
- Reader：stable reading / content reference。
- Learn / Practice：完成、答題、review evidence。
- Career Game：scenario/version/outcome evidence。

不要因為 My Learning 需要一個畫面，就建立一張「所有學習行為都一樣」的 universal table。

## 8. UI / UX quality and Reader quality are P0

Business Japanese Hub 必須感覺像成熟、premium、可信賴的日本職場／商業學習產品，而不是：

- generic SaaS dashboard；
- generic LMS template；
- ebook marketplace clone；
- childish gamified language app；
- AI wrapper。

保留既有 editorial typography / Reader quality、System / Light / Dark、mobile accessibility、keyboard/focus、responsive 與 reduced-motion contracts。

各 mode 可以有不同 presentation grammar，但必須在同一 brand family 內。

`docs/ui-ux-research.md` 的 typography、Reader、design-token、editorial-quality 與 accessibility research 持續有效；其中 2026-08 Storefront-first、Book-as-commerce-unit、禁止 Practice/Progress IA 或 `subscription-first` non-goal 等舊產品假設已由本文件 supersede，不得反向覆蓋 current Plus product IA。

## 9. Platform, web-first, and deployment invariants

- **Web-first**。mobile web 必須適合通勤使用，desktop 必須適合 focused reading / practice / reference。
- **One repository**。
- **One shared Supabase modular monolith backend boundary**；不得為新 learning mode 自動建立第二 backend 或 microservices。
- Product-specific runtime/data 保持 bounded contexts，shared contracts 必須 narrow、consumer-driven。
- Library 與 Career Game 目前可以維持獨立 Cloudflare Pages artifact/origin 與 release cadence；user-facing IA 不要求 deployment topology 變成單一 frontend。
- Supabase service role、payment provider secrets、webhook secrets 永不進 frontend。
- RLS / server authorization / exact production deployment safety 不得因 product pivot 弱化。

## 10. Membership access and payment architecture invariants

Recurring commerce 的 implementation contract 由 #107 定義，但以下產品／安全規則已鎖定：

- Primary paid unit = **Business Japanese Hub Plus membership**。
- Browser/client state 永遠不能 mint paid membership access。
- Provider event 必須經 server-side verification / normalization / idempotent lifecycle transition 後，才可影響 authoritative subscription/access state。
- Payment architecture 保持 provider-neutral；現有 ECPay／PayPal one-time work只能視為 reusable engineering，不等於 subscription readiness。
- Historical Orders／Payments／Refunds／Book entitlements 保持可稽核，不 destructive-convert 成 subscriptions。
- Cancellation、renewal、failed renewal、refund/reversal、reconciliation 必須有 deterministic contract。
- Real billing activation 仍受 merchant/KYC、seller/legal/tax、email、provider capability 等真實 external gates 約束。

## 11. AI boundary

AI 可以未來輔助：

- explanation / authoring workflow；
- bounded recommendation support；
- practice feedback where correctness can be safely constrained。

AI 不是 first-slice engine，也不是 primary product abstraction。

不得要求使用者相信 opaque AI mastery score，亦不得以 AI chat 取代 Business Japanese Hub 的內容、practice 與 learning-state core value。

## 12. Current non-goals

- Native iOS / Android app as current critical path。
- AI tutor / agent 作為主要產品體驗。
- Full LMS（certificate、cohort、live classes、enterprise training suite）。
- Leaderboard、gems、streak economy、social graph。
- Universal content / progress / entitlement mega-schema。
- Microservices / second backend without demonstrated need。
- Destructive rewrite of Reader、Career Game、historical commerce or production data。
- 把 subscription 的主要價值做成「只多解鎖幾篇文章」。
- 一次上線所有 Web Test families。

**Subscription-first 不再是 non-goal；subscription 現在就是 primary commercial model。**

## 13. Durable product invariants

未經新的 explicit Product Owner decision，不得違反：

1. Primary audience = **N2～N1 附近、有日本求職／日本職場需求的華語學習者**。
2. Product goal = **exam Japanese → Japan job-hunting / business reading / workplace Japanese**。
3. User journey 必須延伸到入社後與長期 professional growth。
4. Primary paid product = **Business Japanese Hub Plus recurring membership**。
5. Early Access price = **NT$299 / 月**；Standard direction = **NT$399 / 月** after product-readiness decision；annual direction later ≈ **NT$3,990 / 年**。
6. SPI/Web Test = **Acquisition**；Business Reading = **Engagement**；Work in Japan = **Retention**；Learning System = **Subscription Justification**。
7. User-facing learning architecture = **Learn / Read / Practice / My Learning / Experience**。
8. Book 是 `Read` content format；不是 primary commerce unit。Reader 與 historical Book ownership 必須保留。
9. Career Game 保持獨立 Experience/runtime semantics。
10. Plus 的價值必須包含 persistent / personalized learning state，而不是只有 content access。
11. Paid/member access 必須 server-authoritative；browser 不得 mint access。
12. UI quality、accessibility、mobile usability 是 P0。
13. One repo + shared Supabase modular monolith 是預設 architecture；不為了產品 taxonomy 做 infrastructure rewrite。
14. AI 不是 primary learning engine 或 trust boundary。

## 14. Current delivery phase

目前是 **subscription-product convergence / Plus Early Access preparation**，不是舊的「first paid Book sale」Paid Launch。

舊 #45 的 first-Book-revenue milestone 已被 supersede；舊 single-Book issues 僅保留歷史與 reusable engineering value。

目前 P0 sequencing 應以以下產品能力收斂：

```text
Canonical product contract (#105)
        │
        ├── Acquisition: SPI / Web Test (#113–#117, #119–#120)
        ├── Engagement: Business Reading (#122 → #125)
        ├── Retention: Work in Japan (#124 → #126)
        ├── Subscription Justification: Learning System / My Learning (#109 + practice evidence)
        ├── Product IA / reusable surfaces (#108 / #110 / #127)
        ├── Recurring commerce + access (#107 / #123)
        └── Recurring legal/compliance (#112)
                         │
                         └── Plus Early Access Membership Paid Launch (#111)
```

Membership Paid Launch 不應只證明「可以扣款」。它必須同時證明：

- 使用者知道 Plus 買的是什麼；
- 有足以支撐 Early Access 的 real learning value；
- 至少一條 acquisition → learning → saved/progress/review → return path 可成立；
- recurring billing lifecycle 與 server-authoritative access 正確；
- legal / payment / deployment external gates 已處理或明確阻塞。

Deployment safety（#101/#102）與 learning production-readiness（#97）可獨立進行，不能重新把舊 Book revenue priority 帶回來。

## 15. Authority order

當文件或 issue 發生衝突時：

1. `docs/product-contract.md` — product / commercial / user-journey authority
2. `docs/post-n1-learning-map.md` — curriculum / content architecture authority
3. `docs/platform-architecture.md` — technical bounded-context / dependency authority
4. `docs/learning-and-progress.md` — existing shared learning-evidence implementation contract
5. payment / deployment / security docs — respective technical safety authority
6. live issue / PR — scoped execution instruction；不得覆蓋以上 canonical contracts

歷史文件／issue 可以保留當時決策以維持 audit trail，但如果其中仍寫著 `single-Book commerce`、`first paid Book revenue`、`subscription-first non-goal` 或「Library + Career Game 是唯一產品 IA」，只能視為 historical context，不能作為新的 implementation authority。
