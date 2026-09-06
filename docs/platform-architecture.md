# Platform Architecture — Learning Service Runtime Boundaries

> **狀態：durable architecture contract**
>
> 本文件定義 Business Japanese Hub 的 technical bounded contexts、shared platform 與 frontend/deployment topology。**產品定位、user-facing IA、Business Japanese Hub Plus 與 delivery priority 一律以 [`product-contract.md`](product-contract.md) 為最高 authority。** Curriculum/content taxonomy 以 [`post-n1-learning-map.md`](post-n1-learning-map.md) 為準。

## 1. Architecture decision

Business Japanese Hub 是 **one repository + one shared Supabase modular monolith** 的 web-first learning service。

User-facing product architecture 是：

```text
Learn | Read | Practice | My Learning | Experience
```

這五個 learning modes **不是五個必須獨立部署的 apps，也不是五套必須共用的 runtime schema**。

目前 repository 內已成熟且需要明確保護的兩個 bounded runtime / presentation capabilities 是：

- **Library / Universal Reader**：`Read` 下的 premium long-form editorial capability。內容模型遵循 `Book → Chapter → ContentBlock`。
- **Career Game**：`Experience` 下的 story-driven workplace simulator。內容語意涵蓋 scenario／case、scene、choice/action、outcome/consequence、explanation/feedback 與 progression。

未來 Learn、Practice、My Learning、Business Reading 等 surface 應使用最小可維護的 presentation/runtime seam；不得因為新增 user-facing mode 就強迫建立新 app、第二 backend 或 universal mega-schema。

## 2. Product modes vs technical bounded contexts

不要把 product IA 與 implementation boundary 混在一起。

| Layer | Purpose | Examples |
| --- | --- | --- |
| Product / IA | 使用者如何理解與使用服務 | Learn / Read / Practice / My Learning / Experience |
| Business role | 產品在 funnel / lifecycle 中扮演什麼角色 | SPI Acquisition / Business Reading Engagement / Work in Japan Retention / Learning System Subscription Justification |
| Runtime bounded context | 哪些資料與 state 需要自己的 semantics | Book/Reader、Career Game、Web Test question runner、future reusable Learn/Practice seams |
| Shared platform | 真正跨 runtime 共用的能力 | identity、Supabase/server boundary、narrow learning evidence、membership access、operations、deployment primitives |

只有當兩個以上真實 consumers 需要同一 contract 時，才抽 shared abstraction。

## 3. Current bounded contexts

| Context | Owns | Must not own |
| --- | --- | --- |
| **Library / Reader** | Book catalog/content、Book/Chapter/ContentBlock、Reader rendering、reading state、released Book history、historical Book access | Career Game graph、Web Test scoring semantics、universal membership truth、all-platform navigation taxonomy |
| **Career Game** | workplace cases/scenarios、scenes、choices/actions、outcomes/consequences、feedback/explanations、game progression 與其專屬 UI/state | Book/Chapter/ContentBlock、Reader state、SPI question semantics、membership billing |
| **Practice / Web Test** | versioned question/attempt/scoring semantics required by the approved Practice implementation | Career Game story state、Book schema、opaque AI mastery |
| **Learning System / My Learning** | bounded read models/adapters for recent activity、mistakes、saved/review、progress、weak-area signals、next-step rules where real evidence exists | universal LMS event truth、client-minted membership、fake mastery/AI diagnosis |
| **Shared platform** | repository/tooling、Supabase/backend boundary、durable account/user identity、server security、membership access projection、shared assets/operations；learning evidence only where there is a real cross-product consumer | 取代所有 runtime domain models 的 universal content/progress schema 或 universal UI grammar |

Business Reading 與 Work in Japan 是 product/content lanes；它們可以跨上述 presentation runtimes，不需要先擁有自己的 backend service。

## 4. Allowed dependency directions

```text
Product UI / surface
       │
       ├──> its bounded domain/runtime
       │          │
       │          └──> narrow shared platform contracts
       │
       └──> narrow shared identity/access/learning projections where required

payment provider adapter
       -> provider-neutral recurring/payment core
       -> verified server lifecycle
       -> authoritative membership access projection
```

- Product UI 依賴自己的 domain model；不得為了 reuse 跨 context import 不相干 runtime state。
- Shared contracts 必須 narrow、consumer-driven。沒有第二個真實 consumer 時，不得為了「未來可能共用」建立 mega-schema。
- Shared platform 可以提供 identity、server boundary、assets、telemetry/operations、membership access 等 primitives；它不得反向依賴特定 presentation UI。
- Membership access 可以跨 Learn/Read/Practice/My Learning/Experience 生效，但 **membership eligibility 不代表這些 runtimes 必須共用同一 entitlement/content table**。
- Provider mechanics 停在 adapter boundary；browser state 不得建立 paid access。

## 5. Library / Reader boundary

`Book → Chapter → ContentBlock` 保持 durable、versioned、data-driven，因為它仍然適合：

- long-form editorial / Book；
- Business Reading 中需要長篇閱讀的 material；
- released content / preview / Reader typography；
- stable cross-links / reading state。

但 Book 已不是 primary commerce unit。Historical one-time Book purchase / entitlement 保留作 audit/compatibility，不得重新主導新 IA 或 Plus product model。

Library Reader 必須持續是 premium editorial surface，不要為了統一 Learn / Practice / dashboard 而改造成 generic LMS shell。

## 6. Career Game boundary

Career Game 是 `Experience` 的獨立 workplace-simulation runtime。

它可以：

- 共用同一 account identity；
- 根據 membership contract 消費 authoritative access；
- 產生 bounded learning evidence；
- cross-link 到 Learn/Read reference。

但不得：

- 把 scenario/scene/choice/outcome 塞進 Book/Chapter/ContentBlock；
- 把 Career Game progression 當成所有 My Learning progress 的 canonical shape；
- 要求其他 learning mode import game runtime。

## 7. Learning System architecture principle

`My Learning` 是 Plus 的 subscription-justification surface，但 architecture 應採 **projection/adapters over bounded evidence**，不是先造 universal schema。

可能的 sources：

- Reader / reading state or validated content evidence；
- Learn / Practice completion/attempt evidence；
- Web Test attempts pinned to question version；
- Career Game scenario/outcome evidence；
- saved expressions / vocabulary where a dedicated model exists。

可能的 outputs：

- continue learning；
- recent activity；
- mistake/review queue；
- saved/review items；
- deterministic weak-area signals；
- explainable next-step recommendation。

所有 outputs 必須能追溯到真實 evidence。不要為了畫 dashboard 先製造 fake analytics model。

## 8. Frontend topology

目前使用 incremental、非對稱的雙 frontend topology，這是既有 runtime/deployment decision，不代表產品只剩兩個 user-facing surfaces：

| Runtime | Source / entry | Build config | Artifact | Cloudflare Pages project / origin |
| --- | --- | --- | --- | --- |
| Library / current main frontend | repository root `index.html` + `src/` | `vite.config.ts` | `dist/` | `business-japanese-hub` / `https://business-japanese-hub.pages.dev/` |
| Career Game | `apps/career-game/index.html` + `apps/career-game/src/` | `vite.career-game.config.ts` | `dist-career-game/` | `business-japanese-career-game` / `https://business-japanese-career-game.pages.dev/` |

- Root `pnpm build` 驗證 released Books、typecheck 全部 projects 並 build 兩個 frontends。
- Cloudflare Pages 使用 `pnpm build:library:deploy` 與 `pnpm build:career-game:deploy`；artifacts 可獨立 deploy/rollback。
- `pnpm dev` / `pnpm preview` 目前仍代表 root Library/current-main frontend；Career Game 有 product-specific commands。
- 新的 Learn / Read / Practice / My Learning presentation 可以優先在最小適合的 existing app/runtime 中實作。只有當獨立 deployment/runtime ownership 有 concrete evidence 時，才建立新的 frontend target。
- 不為了把 URL 看起來統一而新增 gateway / proxy / path multiplexing。

## 9. Shared backend / identity

- 兩個現有 frontend artifacts 與 future learning surfaces 共用同一 Supabase project / durable `auth.users.id` identity namespace。
- Product-specific RLS/data access 保持 deny-by-default。
- `service_role`、payment/webhook secrets 只在 server boundary。
- 分離 origins 依 browser security model 管理 session；不要為了 shared membership 自動設計 cross-domain SSO。
- 詳細 auth/origin contract 見 [`shared-backend-and-identity.md`](shared-backend-and-identity.md)。

## 10. Commerce boundary after Plus pivot

Current commercial product 是 **Business Japanese Hub Plus recurring membership**。

Architecture 必須保留：

- provider-neutral payment boundary；
- verified authoritative server event；
- idempotency / replay / reconciliation；
- historical Orders / Payments / Refunds / Book entitlements；
- fail-closed behavior。

Recurring lifecycle / membership state / access projection 由 #107 定義。舊 one-time Book payment implementation 可以 reuse，但不能推導「每種 learning content 都需要自己的 purchase/entitlement product」。

## 11. Delivery boundary

Current delivery priority 是 **Plus Early Access preparation**：

- SPI/Web Test Acquisition；
- Business Reading Engagement；
- Work in Japan Retention；
- Learning System Subscription Justification；
- recurring commerce/access/legal；
- coherent Learn/Read/Practice/My Learning/Experience IA。

舊 `Paid Launch / first Book revenue` 不再是 product priority。Historical Book commerce 只能被保護，不得反過來阻塞或重定新 subscription product。

## 12. Architecture non-goals

- 把 Learn / Read / Practice / My Learning / Experience 一對一拆成 microservices 或 apps。
- 把 Career Game content 塞進 Book／Chapter／ContentBlock。
- 把 Library Reader 改成 generic LMS shell。
- 用 one universal content/progress/entitlement mega-schema 表示所有 learning modes。
- 建第二 backend、microservices 或 custom gateway without demonstrated need。
- 把 historical one-time Book commerce重新提升成 primary product model。
- Native app current critical path。
- AI-first learning engine / opaque mastery truth。

**Subscription-first 已不是 architecture non-goal；Plus recurring membership 現在是 canonical commercial model。**
