# Plus Stage 8A provider and lifecycle preflight

> **Checked 2026-09-24.** This is dated engineering evidence for #180, not a
> provider selection, approved customer wording, legal advice, or approval to
> activate billing. Checkout and production billing remain closed until the
> account, seller, legal, and product decisions below are resolved.

## Decision status

**Conditional path for evaluation: ECPay All-In-One (AioCheckOut) recurring
TWD first; PayPal Subscriptions as the fallback/comparison. No provider is
admitted yet.** ECPay reuses the repository’s current TWD provider family and
the existing merchant history described in `docs/legal-tax-launch-brief.md`.
That history is research, not current proof of the registered seller, account
ownership, production eligibility, or recurring enablement. The current Plus
catalog is server-owned at TWD 29,900 minor units (NT$299) per month; it does
not make either provider ready for checkout (`supabase/migrations/20260922100000_plus_membership_lifecycle.sql`).

The main technical distinction is subscription horizon: Aio recurring requires
finite `ExecTimes` and documents a maximum of **999 monthly authorizations**;
PayPal documents `total_cycles: 0` for an ongoing plan. Do not represent Aio’s
999-cycle maximum as perpetual access or silently chain a second provider order.
Whether a finite term is acceptable, or whether a separate explicit renewal
agreement is needed, is unresolved. If Plus requires a true unbounded monthly
membership and ECPay cannot provide an account-approved compliant continuation,
PayPal is the closer documented plan shape, but its Taiwan-account eligibility
and recurring product must still be confirmed.

## Evidence and product boundaries

This comparison follows the current product and payment authority:

- The primary paid product is Plus recurring membership. Pricing changes need
  explicit Product Owner approval; do not infer readiness from the active plan
  row (`AGENTS.md`, `docs/product-contract.md`).
- #107 owns membership lifecycle and server-authoritative access; #112 owns
  recurring legal/compliance readiness. The lifecycle/access implementation is
  in #165. Checkout is fail-closed unless the exact seller, provider account
  and environment, offer, approved disclosure revision, charge timing, and
  access/refund policies are bound (`docs/payments/plus-recurring-admission.md`).
- Historical Book `orders`, `payments`, refund, consent, and email rows are
  Book/order-bound. Reuse their security and delivery patterns only where they
  fit; do not make those records Plus authority.
- `docs/legal-tax-launch-brief.md` recommends a Taiwan seller/ECPay TWD route
  and discusses an existing merchant. Treat this as historical research. Its
  own checklist still requires the registered seller/account, ECPay production
  card acceptance, overseas-card capability where needed, and professional
  tax/legal facts to be verified.

### ECPay product family boundary

The ECPay references below are the **All-In-One (AioCheckOut V5) recurring
credit-card contract**, not Embedded Checkout / InPay 2.0 and not the
card-binding API. They share a vendor but are distinct integration contracts;
do not mix Aio fields, callback shapes, signatures, or endpoints with InPay 2.0
or card-binding APIs. The existing repository adapter is one-time Aio checkout,
not recurring Aio.

| Aio document | Contract fact relevant to this preflight |
| --- | --- |
| [2868 — Credit-card recurring payment](https://developers.ecpay.com.tw/2868/) | AioCheckOut V5 hosted redirect; `PeriodType=M`, `Frequency=1`; integer TWD `PeriodAmount`; `ExecTimes` required and at most 999 for monthly cadence. The first authorization must succeed to enter the schedule. Aio documents month-end anchoring: if the original day is absent, charge on that month’s last day. Its integration page says deductions stop when failures reach six. |
| [5631 — Recurring result notification](https://developers.ecpay.com.tw/5631/) | Initial success uses `ReturnURL`; later authorizations POST to `PeriodReturnURL`. Notifications include `MerchantTradeNo`, authorization result/amount, `gwsr`, `ProcessDate`, `TotalSuccessTimes`, schedule fields, and `CheckMacValue`. A period notification is sent once; a missed result must be reconciled by query. Simulated notifications are not real charges. |
| [2892 — Recurring order query](https://developers.ecpay.com.tw/2892/) | Read-back exposes recurring order identity, schedule and amount, execution status, total successful count/amount, and per-execution log entries with result, amount, transaction reference, and process time. This is the documented missed-notification reconciliation source. |
| [2900 — Recurring order operations](https://developers.ecpay.com.tw/2900/) | Successful `Cancel` terminates that recurring order irreversibly: it cannot be re-enabled, and re-entry requires a new recurring order. `ReAuth` applies only to the latest failed authorization, cannot operate on a paused or terminated order, and **cannot be tested in stage**. These provider operations do not decide the customer’s paid-access cutoff. |
| [16214 — Merchant recurring-order management](https://support.ecpay.com.tw/16214/) | The merchant guide says ECPay automatically terminates after all executions, card expiry at authorization, or **six consecutive** authorization failures. The integration page's less precise six-failure wording leaves the exact counter semantics for account/sandbox confirmation. Qualified merchants may edit future amount, frequency, and execution count in the dashboard. A paused order can be re-enabled by setting a next execution date; termination cannot be reversed. |

The merchant dashboard is a privileged provider-side writer outside the
repository's server-owned Plus catalog. A qualified operator could change a
live order's future charge amount or cadence, or pause/re-enable collection,
without a local lifecycle event. Before admitting Aio, confirm whether this
account exposes those actions, restrict them to an approved operator process,
and reconcile order settings and per-charge receipts against the original
server-bound offer. An unapproved change must quarantine the order and stop
local access admission; receipt mismatch alone cannot undo an already charged
customer amount. Neither dashboard re-enable nor an ECPay status change can
mint a Plus paid window without a verified charge and approved period mapping.

The separate [ECPay Embedded Checkout 2.0 Web API documentation](https://developers.ecpay.com.tw/category/ecp_web/)
and the [new gateway payment reference](https://developers.ecpay.com.tw/9040/)
describe another request flow. The above Aio endpoint mapping does not establish
that InPay 2.0 is available on this account or preferable for this product.

### PayPal comparison

PayPal’s [Subscriptions billing-cycle guide](https://developer.paypal.com/platforms/subscriptions/customize/billing-cycles/)
documents monthly regular plans with `total_cycles: 0` continuing until
cancellation. Its [subscription webhook catalog](https://developer.paypal.com/subscriptions/webhooks/)
includes subscription lifecycle events and `PAYMENT.SALE.COMPLETED`,
`PAYMENT.SALE.REFUNDED`, and `PAYMENT.SALE.REVERSED`. These are documented API
capabilities, not proof that this Taiwan account can create a TWD subscription,
receive/settle the charge as intended, or use the required merchant product in
production. Repository PayPal functions and adapters implement one-time Orders
and capture/refund processing, not Subscriptions.

The server catalog's `amount_minor = 29900` means **NT$299**, whereas PayPal
documents [TWD as zero-decimal](https://developer.paypal.com/api/codes/currency/)
and its subscription money value is a currency-specific string. A future
PayPal adapter must therefore send `currency_code: "TWD"` and `value: "299"`
for this offer, never `"29900"` or `"299.00"`; the verified charge must still
match the server catalog's normalized minor-unit amount. This is a mapping
requirement, not evidence that this Taiwan account can use TWD Subscriptions.

PayPal [documents suspension and reactivation](https://developer.paypal.com/subscriptions/customize)
as distinct from cancellation/expiry; its webhook catalog includes
`BILLING.SUBSCRIPTION.SUSPENDED`. A later `ACTIVE` state or resume operation
does not itself prove a paid charge or restore Plus access. #107 must map a
verified recovered payment and its approved coverage period before any access
restoration; durable #165 terminal cutoffs still require a separate lifecycle
decision.

There is a material failure-policy fit question: PayPal’s current [payment
failure/recovery guide](https://developer.paypal.com/subscriptions/payment-failure-retry/)
says failed charges are retried every five days up to twice per billing cycle;
after the second retry fails, the payment is counted as failed and its amount is
added to the next cycle’s outstanding balance. The plan setting
`auto_bill_outstanding` controls whether that balance is billed with the next
cycle and its documented default is `true` ([Subscriptions API plan
definition](https://developer.paypal.com/api/subscriptions/v1/definitions/plan_list/)).
That can create a later charge above the single-period Plus catalog amount and
does not directly match #165’s no-grace failure cutoff and per-period receipt
expectation. Setting `auto_bill_outstanding: false` is a candidate to evaluate,
not an approved configuration: the selected account/sandbox behavior and #107
policy must confirm it, and retries still need a rule for when a failure becomes
authoritative. Do not record an early retry notification as
`membership_payment_failed` or grant a later period based on a combined balance
without an explicit allocation rule.

## Facts required before invoking the #165 lifecycle writer

`record_plus_membership_event` accepts normalized lifecycle facts: stable
`source_system`, `source_customer_id`, `source_subscription_id`, and
`source_event_id`; server-bound `user_id`; server-selected `plan_code` and
normalized event type; authoritative occurrence time; period start/end; and the
period-end cancellation flag (`supabase/migrations/20260922370000_plus_membership_lifecycle_observation_admission.sql`).
It observes catalog activation itself. On duplicate identity, it compares the
normalized event type, plan, occurrence time, period bounds, and cancellation
flag; it does not compare metadata or provider financial references.

Before accepting `applied`, `replayed`, or another lifecycle result, a future
adapter must have verified and durably bound these immutable facts to the exact
provider event/charge:

1. **Provider stream namespace:** provider, environment, and the merchant
   account namespace used for this stream. This must distinguish stage from
   production without storing credentials or exposing an actual merchant ID.
2. **Identity:** an opaque immutable server-owned customer correlation,
   namespaced by provider/account/environment and bound to the authenticated
   user, admission, and consent before checkout; recurring order or
   subscription identity; one stable event identity per authorization,
   cancellation, refund, reversal, or dispute; authenticated local user binding
   created from server-side checkout identity. A browser redirect is not
   identity or payment evidence.
3. **Offer and financial receipt:** server-catalog plan code, expected amount,
   currency, and interval; verified charged amount/currency; provider’s
   per-charge transaction/authorization reference; successful/failed status;
   and any authoritative refund/reversal reference and amount.
4. **Time and coverage:** provider-authoritative event/processing time plus
   truthful paid half-open period boundaries. The adapter must not invent
   period coverage from the callback arrival time, a success counter, or a
   scheduled due date without an approved, evidenced mapping.
5. **Terminal meaning:** verified request versus effective time, immediate
   versus period-end cancellation, and the provider status that makes a
   failure/refund/reversal/dispute authoritative.
6. **Replay and reconciliation:** compare the immutable references, amount,
   currency, status, time, and coverage against the first accepted receipt for
   that source event. A changed receipt under a reused event ID is a conflict
   requiring investigation, never a metadata-only replay. A provider read-back
   must preserve the same identity and facts before repairing a missed notice.

For Aio, `MerchantTradeNo` is the recurring order reference; `gwsr` is the
authorization transaction number in the recurring callback/query detail, and
the query also returns `TradeNo`. Their exact canonical roles in a recurring
source-event identity must be confirmed before adapter admission. The Aio
notification lists amount and processing time but does not itself provide
explicit membership period start/end. Aio does not supply a general customer
object for this purpose: use an opaque server-owned correlation and bind it
before checkout to the authenticated user, admission, consent, and provider
account/environment. Do not assume an optional `MerchantMemberID`/card-binding
feature is enabled for this merchant.

The #165 RPC does not accept verified charge amount/currency, transaction
reference, or consent-revision evidence. The recurring admission contract
therefore requires an adapter-owned immutable receipt binding and replay check
before calling it; caller metadata is not proof. Existing `payment_events` is
one-time payment-oriented (`payment_id`, merchant reference, callback
fingerprint, allowlisted payload) and is not already a demonstrated membership
receipt ledger (`supabase/migrations/0002_commerce.sql` and
`supabase/functions/_shared/events.ts`). This preflight proposes no endpoint,
schema, or production adapter.

## Coverage and policy choices remain open

The provider charge schedule is not itself the approved access policy. The
#165 temporal writer creates access windows from explicit event period bounds;
the resolver grants only on the selected stream. For a current-plan
`membership_payment_failed`, the temporal fold clips the current window at that
event’s occurrence time and removes affected future coverage. There is no
grace-period extension (`supabase/migrations/20260923050000_plus_membership_temporal_access_windows.sql`,
`docs/payments/plus-recurring-admission.md`). A transient retry warning must
not be translated into that effective failure.

Before choosing a paid-period mapping, #107/#112/Product Owner must resolve:

- If a scheduled renewal is missed or fails and a later scheduled charge
  succeeds, does the successful payment cover only from its actual success
  time, restore a previously scheduled period, or follow another explicit
  interval rule? No retroactive window may be inferred.
- If a latest failed authorization is manually reauthorized after its due date,
  what timestamp and exact half-open period does the charge buy? Does that
  replace/overlap a cycle or begin a new one?
- For a monthly plan started on January 29–31, February may charge on its last
  day and later months may return to the original anchor. What is the paid
  access period at each boundary? Do not assume a fixed 30 days or simply use
  `ProcessDate` to the next month-end.
- When the finite 999th Aio authorization completes, does membership end, is a
  new consent and new subscription required, or is this provider path unsuitable?
  Do not auto-create a successor contract or imply seamless perpetual renewal.

Cancellation must distinguish a user request from the provider-confirmed
effective stop. Aio `Cancel` irreversibly ends that provider order; its later
reactivation is unavailable. ECPay also documents automatic termination after
card expiry at authorization, all planned executions, or a six-failure
threshold. The merchant guide says **consecutive** failures, while the Aio API
page does not specify that qualifier; confirm the account's actual counter and
status through sandbox/support evidence. Reconcile each provider-side stop
against the order query and verified receipts; do not wait for a nonexistent
next scheduled charge or treat the provider stop alone as an approved access
cutoff. A later customer re-entry needs a new provider order with a new
server-owned identity binding and whatever consent/disclosure #107/#112 approve;
do not restore the old order or silently mint access. #165’s period-end terminal
can retain access until `period_end`, while an immediate terminal cuts off at
its authoritative event time. Which behavior customers receive remains an
explicit product/legal choice. A terminal cutoff is durable under the current
lifecycle: do not infer restoration from a new provider order, reversal, or a later
success without a separate lifecycle decision.

For Early Access, the current #165 rule is **no grace**: only an authoritative
effective failure maps to `membership_payment_failed`; then coverage is clipped
at its trusted occurrence time. Treat this as the current engineering
contract, but have #107/#112 confirm that it is the intended customer policy
before checkout. Full/partial refund, reversal, dispute, and restoration
outcomes also remain unresolved customer/legal policy. The existing normalized
terminal events (`membership_refunded`, `membership_reversed`,
`membership_disputed`) must not be mapped automatically until their approved
cutoff meaning is explicit.

No customer-facing disclosure or notice wording is approved here. #112 must
approve the actual seller, jurisdiction, offer, first-charge and renewal timing,
cancellation/access behavior, failure policy, refunds, receipts/notices, and
consent evidence requirements before those facts appear in checkout or email.

## Read-only test vectors for a future admitted adapter

These vectors are a plan, not a test claim or implementation authorization:

1. **Initial start:** correct authenticated user and active server plan; verified
   first charge matches NT$299/TWD; stable subscription identity and exact paid
   interval; reject browser-return-only, incorrect amount/currency, wrong
   merchant/account/environment, and simulated charge.
2. **Idempotency/conflict:** exact duplicate provider notification returns a
   replay after immutable receipt comparison; same event ID with changed
   transaction reference, amount, currency, status, user, plan, occurrence, or
   period is rejected/quarantined before #165.
3. **Out-of-order delivery:** renewal arrives before an older event; reverse
   arrival order yields the same access result. Late pre-terminal success cannot
   cross a durable effective terminal cutoff.
4. **Missed ECPay callback:** query the recurring order, compare `ExecStatus`,
   `TotalSuccessTimes`, `TotalSuccessAmount`, and every relevant `ExecLog` item
   to stored verified receipts; recover exactly one missed success or record a
   mismatch. A query total alone must not fabricate per-period receipts.
5. **ECPay failure and retry:** initial failure does not create an active
   schedule; a transient retry/collection warning does not cut access; an
   authoritative failed attempt follows the approved no-grace rule; later
   success uses the approved coverage mapping. ReAuth is tested with fixtures
   and explicitly marked **not stage-testable**; it cannot operate on a paused
   or terminated order. No real reauthorization is part of this preflight.
   Exercise the six-failure threshold with consecutive and separated failures
   to resolve the official-source ambiguity; also exercise card expiry at
   authorization and final planned execution. Query and reconcile any automatic
   termination; do not expect a further charge or infer an access cutoff
   without the approved policy and verified effective evidence.
6. **Schedule boundaries:** January 29/30/31 and February (including leap
   year), next month’s return to the original anchor, timezone conversion from
   ECPay `ProcessDate`, overlapping/recovered cycles, and the final allowed
   Aio cycle all produce the explicitly approved half-open intervals.
7. **Stop and terminal finance evidence:** cancellation request alone changes
   no access; verified provider stop maps only to the chosen immediate or
   period-end cutoff. A successful Aio `Cancel` cannot reactivate that order;
   a return requires a separately bound new order and approved consent/access
   treatment. Verified full refund, reversal, or dispute follows the
   separately approved terminal matrix; a support request or webhook redirect
   alone cannot revoke or restore access.
   For qualified ECPay dashboard access, detect changes to future amount,
   cadence, execution count, pause, next date, and re-enable against the
   server-bound offer and approved operator record. Quarantine unapproved
   drift before admitting another lifecycle receipt; do not assume dashboard
   changes create a local event or reverse a prior real charge.
8. **PayPal fallback:** verified subscription activation binds the right user,
   plan, and account/environment but grants no paid window by itself. A
   verified first completed sale must establish charge and coverage; failed
   payment, canceled/expired subscription, refund, reversal, duplicate and
   out-of-order webhooks reconcile against the subscription/payment read API and
   the same immutable receipt requirements. Confirm Taiwan-account TWD
   eligibility before treating this as a viable fallback. Exercise two retries,
   the failure threshold, suspension, next-cycle outstanding balance, and both
   `auto_bill_outstanding` settings; establish the exact authoritative failure
   point and make sure any posted amount still maps to the server catalog.
   Assert the exact zero-decimal TWD request mapping `29900` minor units to
   `"299"` PayPal value. Exercise suspend and later reactivate separately from
   cancel/expire; no `ACTIVE` status alone restores access without a verified
   recovered charge and approved paid interval.

## Account evidence still required

The following are not discoverable from public provider docs or repository
history. Ask for a dashboard/support confirmation only after this work is
reviewed; never request secrets, full card data, or actual merchant IDs in
GitHub.

### ECPay dashboard or written support confirmation

- The registered legal seller name and merchant-of-record role for the actual
  production account match the owner-confirmed seller and planned public
  disclosure.
- Production account is enabled for AioCheckOut credit card recurring at
  `PeriodType=M`, `Frequency=1`, the exact TWD monthly amount, and the required
  first authorization/3-D Secure behavior. Confirm the supported `ExecTimes`
  range and the actual cap for this account, including whether 999 is accepted.
- Whether the account is a qualified/special merchant for any required
  subscription/card-binding feature; whether recurring can continue after the
  999-cycle cap; and applicable account limits, overseas-card enablement, card
  brands, and settlement/fee terms.
- Whether qualified dashboard users can edit a live order's future amount,
  frequency, execution count, card expiry or next charge date, and pause or
  re-enable it. Identify the authorized operator/control and read-back route;
  confirm how an out-of-band change is detected before another charge.
- Whether the merchant has working stage access and documented sample records
  for initial success/failure, subsequent success/failure, duplicate/missed
  notification, query, cancellation, and test notification. Separately confirm
  that ReAuth cannot be stage-tested and how production ReAuth is controlled.
- Authoritative meanings and stable identifiers for recurring order,
  per-authorization event/transaction, failure result, effective cancellation,
  automatic termination (including card expiry and the six-failure counter),
  paused/re-enabled state, and query history retention for the actual account.

### PayPal fallback account confirmation

- Actual Taiwan business account is enabled and eligible for PayPal
  Subscriptions in production, including the intended TWD plan/customer market
  and settlement/withdrawal route.
- Business/KYC status, seller match, supported customer jurisdictions/payment
  methods, production webhook event catalog, and sandbox-to-production account
  separation are confirmed by the account owner.
- Confirm whether `auto_bill_outstanding: false` is supported and behaves as
  expected in sandbox and production, and which retry/failure-threshold
  configuration can report effective failure without silently rolling an
  unpaid prior cycle into a later charge. This is a provider/policy fit check,
  not an instruction to configure it.

### Names-only production inventory observed 2026-09-24

Mission-lead read-only CLI inventory reported the Supabase project as
`ACTIVE_HEALTHY`. A names-only `supabase secrets list` showed
`CAREER_GAME_SITE_URL`, `PUBLIC_SITE_URL`, and built-in `SUPABASE_*` entries;
it showed no `ECPAY_*`, `PAYPAL_*`, `LEGAL_SELLER_NAME`, or `RESEND_*` names.
No project reference or secret value is recorded here. This is a configuration
inventory observation only: it does not prove merchant account eligibility,
legal seller identity, or whether credentials exist elsewhere. It does mean
current production provider/seller/email configuration is not evidenced by
those listed secret names; provider handlers should remain fail-closed unless
the deployment owner establishes the required configuration through the
approved process. The repository deployment runbook already describes a
PayPal/USD plus Resend profile and allows ECPay credentials to be absent for
that historical one-time launch path (`docs/deployment.md`); it is not proof
that this configuration is currently present or appropriate for Plus.

## Handoff to #107 and #112

**#107 / Product Owner:** decide finite versus indefinite membership horizon;
define paid-period windows after missed, failed, and recovered charges including
month-end anchors; choose cancellation request/effective/access behavior; affirm
no-grace or specify a separately modeled policy; and define refund, reversal,
dispute, and restoration outcomes. Preserve immutable provider receipts before
the normalized lifecycle writer.

**#112 / qualified legal/accounting review:** confirm the actual seller and
launch jurisdictions; review recurring disclosure/consent and receipt/notice
obligations and revisions against the admitted provider semantics; determine
tax/invoice and record-retention facts; approve customer wording and evidence
requirements. The Taiwan sole-proprietor route in the research brief is not this
confirmation.

Only after those answers and account-specific provider evidence are recorded
should the mission lead admit a bounded provider adapter/checkout child. Keep
production credentials, live charges/refunds, KYC submission, and production
activation behind their separate owner-authorized gates.

## Official provider references checked 2026-09-24

- ECPay Aio recurring setup and request semantics: <https://developers.ecpay.com.tw/2868/>
- ECPay recurring callback: <https://developers.ecpay.com.tw/5631/>
- ECPay recurring query: <https://developers.ecpay.com.tw/2892/>
- ECPay recurring cancel/ReAuth operations: <https://developers.ecpay.com.tw/2900/>
- ECPay merchant recurring-order management and dashboard edits: <https://support.ecpay.com.tw/16214/>
- ECPay Embedded Checkout 2.0 Web docs (separate product contract): <https://developers.ecpay.com.tw/category/ecp_web/>
- ECPay new-gateway payment reference (separate from Aio): <https://developers.ecpay.com.tw/9040/>
- PayPal infinite/finite billing cycles: <https://developer.paypal.com/platforms/subscriptions/customize/billing-cycles/>
- PayPal subscription failure retries and outstanding balance: <https://developer.paypal.com/subscriptions/payment-failure-retry/>
- PayPal Subscriptions API plan definition (`auto_bill_outstanding` default): <https://developer.paypal.com/api/subscriptions/v1/definitions/plan_list/>
- PayPal subscription webhook event catalog: <https://developer.paypal.com/subscriptions/webhooks/>
- PayPal zero-decimal TWD currency rule: <https://developer.paypal.com/api/codes/currency/>
- PayPal suspension/reactivation capability: <https://developer.paypal.com/subscriptions/customize>

Repository authority: `AGENTS.md`, `docs/product-contract.md`,
`docs/payments/decision-record.md`, `docs/payments/plus-recurring-admission.md`,
`docs/legal-tax-launch-brief.md`, `docs/deployment.md`,
`supabase/migrations/20260922370000_plus_membership_lifecycle_observation_admission.sql`,
and `supabase/migrations/20260923050000_plus_membership_temporal_access_windows.sql`.
