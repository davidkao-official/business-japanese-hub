# Accounts, Ownership, and Reading-State Persistence

> 對應實作：`supabase/migrations/0001_accounts.sql`、`0003_compliance_finance.sql`、`20260822170000_entitlement_lifecycle_hardening.sql`、`src/lib/persistence/**`、`packages/platform-auth/**`、`src/lib/entitlement.ts`。
> 上位契約：`docs/product-contract.md`（§7 平台責任分界、§10 payment architecture）、`docs/payments/decision-record.md`（provider-neutral payment contract；ECPay 是第一支 TWD adapter）、`docs/content-model.md`（id namespace）、`docs/ui-ux-research.md`（§4.2 Preview-boundary contract、§4.4 resume-state schema、§8.3 Entitlement CTA state）。

## 1. 目標與範圍

本文件記錄 GitHub issue #7「Add account, ownership, and reading-state persistence」的資料層契約：**帳號、擁有權（entitlement）、閱讀狀態（reading state）與書籤（bookmark）的持久化**，以及**提供者無關的 entitlement 邊界**。

核心決定（由 arbiter 定案）：

- **資料層選 Supabase**：managed auth + Postgres + RLS，作為 server-authoritative 資料來源。
- **DB 不存書內容**：書內容留在 `src/content/`（靜態 bundle）；DB 只存 user-scoped state，以 content model 的 stable id（`Book.id` / `Chapter.id` / `BlockBase.id`，全域唯一 namespace，見 `docs/content-model.md` §2／§4.3）為 key。
- **entitlement 邊界 provider-agnostic**：以 Repository interface（`src/lib/persistence/repository.ts`）包裹，Supabase 只是可替換 adapter。

## 2. Data model（`supabase/migrations/0001_accounts.sql`）

### 2.1 `book_entitlement` — 擁有權（server-authoritative）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `user_id` | `uuid` FK `auth.users` | 擁有者；`on delete cascade`。 |
| `book_id` | `text` | 穩定的 content-model `Book.id`。非 DB FK（書 metadata 在靜態 bundle，不在 DB）。 |
| `provider` | `text` | provider-neutral grant source；目前允許 `manual`、`ecpay`、`newebpay`、`stripe`、`paypal`。 |
| `provider_ref` | `text` | 選用；opaque generic grant provenance（operator 註記）。**不是 provider 交易參考**——provider 交易參考（ECPay `MerchantTradeNo` / `TradeNo`）只存在 payment domain（見 `docs/payments/decision-record.md` §9.2）。 |
| `granted_at` | `timestamptz default now()` | 授予時間（server-authoritative）。 |
| `source_order_id` | `uuid` nullable FK `orders` | paid grant 的 provider-neutral Order provenance。 |
| `status` | `active \| revoked` | 只有 `active` 代表 ownership；`revoked` 是保留的財務／access lifecycle evidence。 |
| `revoked_at` / `revocation_reason` | nullable | authoritative refund/reversal 撤銷證據。 |

PK `(user_id, book_id)`。

### 2.2 `reading_state` — 每 user/book 一條最後閱讀位置

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `user_id` | `uuid default auth.uid()` FK `auth.users` | RLS 確保等於 `auth.uid()`；default 讓 client 不需帶入。 |
| `book_id` | `text` | content-model `Book.id`。 |
| `chapter_id` | `text` | 穩定 `Chapter.id` — resume 錨點。 |
| `block_id` | `text` 可空 | 穩定 `BlockBase.id`；`null` = chapter 起點。 |
| `offset` | `int` 可空 | 選用 block 內 offset（renderer-level 細節，opaque 持久化）。 |
| `updated_at` | `timestamptz default now()` | 由 trigger 每次更新時自動 touch（server-authoritative）。 |

PK `(user_id, book_id)`。resume 語意依 `docs/ui-ux-research.md` §4.4：以 `Chapter.id` + block identity + 選用 offset 為 key；內容 reflow 或 block 被編輯／移除時，fallback 到「最近 stable block 或 chapter 起點」，不得因 anchor 消失而丟失閱讀狀態。

### 2.3 `bookmark` — 選用、anchor-ready 書籤

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `bigint generated always as identity` PK | DB 產生的身份。 |
| `user_id` | `uuid default auth.uid()` FK `auth.users` | 同上。 |
| `book_id` | `text` | content-model `Book.id`。 |
| `chapter_id` | `text` | 穩定 `Chapter.id`。 |
| `block_id` | `text` 可空 | 穩定 `BlockBase.id`。 |
| `offset` | `int` 可空 | 選用。 |
| `created_at` | `timestamptz default now()` | server-authoritative。 |

索引 `(user_id, book_id)`。書籤 UI 不在 #7 範圍（見 §7 non-goals）；V1 只需 anchor-ready、可保留結構。

## 3. Authorization rules（RLS）

### 3.1 政策矩陣

所有三張表都 `enable row level security`。

| 表 | 政策 | 目的 |
| --- | --- | --- |
| `book_entitlement` | **只有** `for select to authenticated using (auth.uid() = user_id and status = 'active')` | Client 只能讀自己的有效擁有權。revoked row 不得被 Library/Reader 當 ownership。**無任何 INSERT／UPDATE／DELETE 政策**：client 無法 self-grant。授權只能走 server path（見 §4）。 |
| `reading_state` | `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)` | User 可讀寫自己的閱讀位置。 |
| `bookmark` | `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)` | User 可讀寫自己的書籤。 |

### 3.2 為什麼 entitlement 只有 select

若 client 可 INSERT／UPDATE `book_entitlement`，任何登入者都能把自己標記為已購買任何書——「未擁有的 paid content 不能靠編輯 client state 解鎖」的整個前提就會被破壞。因此授予是 **server-only**：只有 `grant_entitlement`（service_role / operator，未來 ECPay callback verification）能寫入。此政策矩陣由 `src/lib/persistence/migration.test.ts` 以 SQL 文本斷言防護。

## 4. 授予路徑（Grant path）

```sql
grant_entitlement(user_id uuid, book_id text, provider text, provider_ref text default null,
                  source_order_id uuid default null, status text default 'active',
                  revoked_at timestamptz default null, revocation_reason text default null)
```

- 實作於 migration 的 `security definer` SQL function；`on conflict (user_id, book_id) do update`（冪等）。
- EXECUTE 從 `public` 與 `authenticated` **revoke**，僅 `service_role` 可執行 → 瀏覽器 anon-key client 永遠無法呼叫。
- 型別化 helper：`src/lib/persistence/grant.ts` 的 `grantEntitlement(client, input)`。**必須只以 service-role client 執行，絕不可 bundle 於瀏覽器。**
- Payment provider mechanics remain outside this boundary. Verified PayPal/ECPay success reaches the same provider-neutral grant path with `source_order_id`; provider transaction IDs remain on Payment/Refund rows.
- **只有第一筆 qualifying successful payment 呼叫 `grant_entitlement`**。`duplicate_success`（第二筆重複成功付款）不得再次呼叫 grant upsert，避免覆寫既有 entitlement 的 `provider_ref` / `granted_at` provenance；其處理路徑是 finance anomaly/review queue + refund（見 `docs/payments/decision-record.md` §7／§13）。
- Refund 將 row 標為 `revoked`；同一 user/book 合法重新購買時會重新啟用並綁定新的 `source_order_id`，使下一次 refund 撤銷的是最新 Order。

## 5. Provider-agnostic entitlement boundary

### 5.1 Repository interface（`src/lib/persistence/repository.ts`）

`UserStateRepository` 是 app 與任何 server-authoritative store 之間的單一接縫：

```ts
interface UserStateRepository {
  getEntitlement(bookId: string): Promise<Entitlement | null>
  getReadingState(bookId: string): Promise<ReadingState | null>
  saveReadingState(state: SaveReadingStateInput): Promise<void>
  listBookmarks(bookId: string): Promise<Bookmark[]>
  saveBookmark(input: SaveBookmarkInput): Promise<Bookmark>
}
```

消費者只依賴 interface，不依賴具體 adapter；payment provider 可替換而不影響 reading/ownership code path。所有方法都以「目前登入 user」為範圍，讀寫所有權由 store 的 RLS 保證，而非 client 自行保證。

### 5.2 Supabase adapter（`src/lib/persistence/supabase.ts`）

`SupabaseUserStateRepository implements UserStateRepository`。SupabaseClient 以 constructor 注入（測試用 mocked client，不觸網）。寫入 `reading_state`／`bookmark` 時**刻意不帶 `user_id`**：表 default 為 `auth.uid()`，RLS `with check` 會拒絕任何其他值。

### 5.3 Entitlement gate primitive（`src/lib/entitlement.ts`）

```ts
canRead({ tier, owned, position, chapters, previewBoundary }): boolean
```

純函式，組合 `Price.tier`（content model §2.4）+ server entitlement（`owned`）+ preview boundary metadata，判斷「這個位置能否讀」：

- `tier: 'free'` → 所有人可讀（public preview 無 friction）。
- `tier: 'preview'` → 整本書都是 preview，所有人可讀。
- `tier: 'paid'` → `owned` 時可讀；否則只在 preview 前綴內可讀。
- **保守 by design**：任何 malformed reference（未知 chapter／block、缺 boundary）一律 deny，避免意外解鎖 paid 內容。

Preview boundary 依 `docs/ui-ux-research.md` §4.2：有序章節前綴（可細到 block 前綴），以 book-level generic metadata 表達；確切 `Book` 欄位形狀由 content-model lane（#3 follow-up）定稿——因此本 gate 以顯式參數接受 boundary 形狀，不依賴該欄位。與 Universal Reader 的實際整合留給 #5 的 bounded follow-up；本檔只定義並測試 primitive。

## 6. Shared Auth（Library 從屬於 reading 與 purchase）

- `packages/platform-auth/src/types.ts` — 兩個 frontends 共用的最小 `AuthClient` interface（session restore、email/password sign-in、sign-up、sign-out、state-change 訂閱）。
- `packages/platform-auth/src/supabaseAuthClient.ts` — `SupabaseAuthClient`，薄薄映射 `supabase.auth`。sign-up 明確區分「已建立 session」與「等待 email confirmation」；後者維持 signed-out，絕不提前宣稱已驗證。
- `packages/platform-auth/src/AuthContext.tsx` — `AuthProvider` / `useAuth`：mount 時 session restore、sign-in、sign-up、sign-out、reactive user state。`loading` 不隱藏 children（public surfaces 不需登入）。登入失敗／restore 失敗降級為 signed-out，不崩潰。
- `src/components/AuthPanel.tsx` 是 Header 與 paid checkout 共用的 inline email/password UI；`AccountControl` 提供最小 login/logout 入口，**不新增帳號中心 page**。Provider 的 raw error 不直接顯示，避免暴露帳號枚舉細節。
- Career Game 擁有自己的 account presentation，只提供 existing-account login/logout；authenticated progress 使用獨立的 #57 product-owned seam（見 `docs/learning-and-progress.md`），不得接入 Library persistence、entitlement 或 payment。匿名 progress 仍為 device-local，且不自動 import。
- paid CTA 在蒐集 consumer jurisdiction / compliance evidence **之前**要求登入。若 checkout 以 missing/expired bearer token 或 HTTP 401 回傳 `signed_out`，UI 會要求重新驗證，成功後以同一個既有 `ConsentSubmission` object 重試；不得以新的 locale／文案重建 evidence，也不得把 signed-out 當一般付款失敗。
- Supabase client 建構：`packages/platform-auth/src/browser.ts` 的 `createSupabaseClientFromEnv(applicationId)`（兩個 builds 讀同一組 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`；未設定回傳 `null`，app 以 signed-out / no-sync 運作）。Session/origin 與完整 data-access contract 見 [`shared-backend-and-identity.md`](shared-backend-and-identity.md)。

## 7. Non-goals 與已接受限制

- **#7 範圍不實作 ECPay / payment**：只定義 `grant_entitlement` 寫入點與 `provider: 'ecpay'` 接縫。Payment 實作屬 #9，contract 見 `docs/payments/decision-record.md`。
- **不做 bookmark UI、不做 profiles/dashboard UI**。
- **不做內容加密**：web 靜態 bundle 的 DRM 是接受限制（non-goal）。書內容在 client bundle 可被檢視；RLS 保護的是「已登入使用者的擁有權／狀態」，不是內容本身。若未來需要內容保護，需在 Delivery 層另做（bounded follow-up）。

## 8. 與 #5 / #6 的整合 interface

- **Repository**：`UserStateRepository`（§5.1）供 Library（#6）與 Reader（#5）讀寫 entitlement／reading state／bookmark。
- **Gate**：`canRead`（§5.3）供 Reader（#5）在 Universal Reader 的 entitlement gate 使用，依 boundary 隱藏其後內容；Book Detail 的四種 CTA state（`docs/ui-ux-research.md` §8.3）與 Library「続きを読む」以 `getEntitlement` / `getReadingState` 驅動。
- **Auth**：`AuthProvider` / `useAuth`（§6）供登入/登出前置 gate。
- **Client 建構**：`createBrowserPlatformServices('library')`（§6）在 app root 單一 mount，讓 auth、Library repository 與 bearer token 使用同一個 Supabase client。

## 9. Environment dependency（真實驗證所需）

程式碼層完成（mock 測試全綠）。本機 migration/RLS/grant 驗證一律走 owned disposable boundary：

```text
pnpm test:db-guard
pnpm validate:db
```

防護與操作限制見 `docs/db-validation.md`。若 guard 拒絕執行，停止並回報 DB gate unavailable；不得改用既有 local stack、raw `supabase db start/reset/stop`、linked/remote reset，或改 project/port 繞過防護。

真實端到端驗證仍需要一個已佈署且獲授權的 Supabase instance：

1. Provision／指定該驗證用 Supabase project；不要把本機 validation stack 當 production/auth E2E 證據。
2. 依 canonical deployment/activation runbook 套用並核對 migrations；production／remote write 需要其獨立授權，不使用本機 guard 作為授權替代。
3. 設定 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（build 時 bake）。
4. 在 Supabase Auth 明確設定允許的 Site URL / redirect URLs、email confirmation policy 與 production mail delivery；這些 external settings 未有 live evidence 前不得宣稱 sign-up E2E 已驗證。
5. 建立測試 user；以 service-role 呼叫 `grant_entitlement(...)` 授予測試 Book，並另留一條 revoked lifecycle fixture。
6. 驗證：sign-in 與 sign-up confirmation round trip、另一 session/device 登入後的 `getEntitlement`／`getReadingState` 一致性、revoked row 不會出現在 ownership 查詢、未授予的 paid book 無法靠修改 client state 解鎖，以及 anon key 呼叫 `grant_entitlement` 被拒（`permission denied`）。

未 provision／授權 instance 前，這些是文件化的 environment dependency，不是 code 缺陷。