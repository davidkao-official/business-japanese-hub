# Plus recurring checkout admission contract

> Status: engineering admission contract; not legal advice, a provider selection,
> or approval to charge. #107 owns recurring lifecycle and membership access;
> #112 owns recurring legal/compliance readiness. This document does not replace
> either issue or approve final customer wording.

## Offer and admission boundary

The server catalog currently identifies `plus_early_access_monthly` as an active
offer at **TWD 29,900 minor units per month (NT$299/month)**. That makes the plan
available to a future server checkout; it does not mean any provider, seller,
disclosure, or billing flow is ready. The server must derive plan, amount,
currency, and interval from its own catalog. Browser-supplied values or success
claims never create membership or access. Standard TWD 39,900 remains inactive
until an explicit Product Owner readiness decision; annual billing stays out of
the Early Access path.

Checkout admission is closed unless one reviewed, versioned admission binding
exists for the exact seller, jurisdiction/legal locale, disclosure revision,
provider account and environment, currency, interval, charge timing, plan, and
effective-access/refund policies. Missing, stale, contradictory, unreviewed, or
unknown evidence denies checkout before provider handoff. A passing test, active
catalog row, existing one-time merchant account, or draft legal page is not that
evidence. Keep evidence references and approval identity/date; never place
credentials or sensitive account identifiers in repository files or issues.

| Required binding | Evidence / decision owner | Admission when missing or uncertain |
| --- | --- | --- |
| Seller legal identity, seller/merchant-of-record role, establishment and tax/invoice treatment | Owner-confirmed entity/account facts; relevant tax/accounting review (#112 and launch owner) | Deny checkout |
| Customer jurisdiction and supported legal locale | Product/launch decision, supported by qualified legal review for each launch jurisdiction (#112) | Deny unsupported or ambiguous jurisdiction |
| Terms, privacy, recurring disclosure and refund-policy revision | Exact immutable document/revision plus qualified review and approver/date; existing #25 legal surfaces are drafts until reviewed for this offer | Deny if absent, draft, superseded, or not bound to this offer |
| Provider product/account, merchant eligibility, environment and enabled payment method | Provider-issued account/product facts confirmed by owner; stage and production evidence kept distinct | Deny if eligibility, recurring support, or environment is unknown |
| Billable offer and provider mapping | Exact authoritative catalog plan row (`plan_code`, `currency`, `amount_minor`, `interval`, `active`) bound to first-charge and renewal semantics, or a future explicitly versioned offer binding; Product Owner approves any product change | Deny any amount/currency/interval mismatch; client values are ignored |
| Cancellation and paid-access policy | #107 lifecycle plus explicit product decision for request method, effective time, and access consequence; provider semantics must match | Deny if provider cannot enact or report the approved policy |
| Failed renewal, retry/grace, terminal cutoff, refund/reversal/dispute | Explicit #107/product decisions and provider evidence; no inferred grace or automatic restoration | Deny unsupported or ambiguous outcomes |
| Customer communication and operational handling | Approved #112 disclosure/receipt/notice revisions, tested delivery ownership and support/escalation path | Deny if required notice/receipt cannot be delivered or audited |

## Reuse from one-time commerce

Issue #25 provides reusable patterns: versioned Terms/Privacy/disclosure
surfaces (`src/legal-content/`), server-owned seller configuration, immutable
consent/compliance evidence, verified payment-event handling, and transactional
email/outbox/operator workflows. The one-time checkout implementation and its
`orders`, `order_compliance`, `order_email_outbox`, Book `payments` and Book
entitlements are Book/order-bound. Reuse security techniques and suitable
delivery primitives after review; do not copy those records, receipt meanings,
checkout assumptions, or Book entitlements into membership authority. A
consent snapshot, when required by reviewed policy or law, must bind the
authenticated member, exact offer and disclosure revisions, locale/jurisdiction,
timestamp, and admission binding; the server captures it at confirmation and it
remains auditable and linked to the membership lifecycle evidence. No browser
assertion is sufficient evidence.

## Provider evidence must fit the lifecycle

Before selecting a provider or implementing its adapter, establish that its
authoritative API/webhooks/reconciliation can map to #107's immutable,
provider-neutral lifecycle without inventing facts. At minimum verify:

- **Initial confirmation:** one stable `(source_system, source_customer_id,
  source_subscription_id)` identity maps to one stream; exactly one trusted
  initial paid-start fact identifies the user, active plan snapshot, verified
  amount/currency, and paid half-open interval. Pending authorization, browser
  return, or an unverified callback is not a start. A second distinct trusted
  start conflicts that stream; it must not silently replace its first identity
  or grant a second membership.
- **Renewal and ordering:** each paid period has durable source-event identity,
  provider references, verified charge amount/currency, occurrence time and
  period bounds. Demonstrate duplicate replay, delayed/out-of-order delivery,
  missed webhook recovery, and reconciliation. `record_plus_membership_event`
  compares the normalized lifecycle fields (identity/user, event type, plan,
  occurrence time, period bounds, and cancellation flag) for a repeated source
  event ID; matching fields return `replayed`, while a mismatch is rejected.
  That comparison does not cover provider charge/refund references, verified
  amount/currency, or `metadata`. Before every event admission, the provider
  adapter must independently verify and durably bind those provider-specific
  financial/reference facts, then explicitly compare them with the immutable
  accepted provider receipt on replay. A mismatch must be rejected or held for
  investigation before invoking/accepting the lifecycle writer result.
  `metadata` is supplemental and cannot establish these facts. Provider
  delivery order cannot decide access.
- **Failure and recovery:** distinguish an early retry/collection warning from
  authoritative effective failure. A retry warning must not map to
  `membership_payment_failed`. For an accepted failure matching the admitted
  plan, #165's temporal fold clips that stream's access windows at its
  `occurred_at`, including an otherwise open current window; paid-period bounds
  do not guarantee access after that instant. An off-plan failure only invalidates
  that plan's windows. The fold also removes affected unpaid future coverage.
  The lifecycle currently invents no grace. Determine whether a separately
  approved grace policy is compatible before admitting a provider; no adapter
  may extend access from a retry notice.
- **Cancellation and terminal evidence:** establish provider semantics for
  request time versus effective time, immediate versus period-end cancellation,
  expiry, full refund, reversal, and dispute. Map only a verified effective
  cutoff and its authoritative occurrence time to terminal lifecycle evidence,
  scoped to its own stream. The cutoff is durable: provider-side undo-cancel or
  dispute-reversal signals cannot erase it under the current lifecycle
  contract. Keep such semantics unresolved and checkout closed unless a future
  explicit lifecycle decision defines and verifies an allowed restoration path.
  Product policy must decide whether cancellation is immediate or period-end;
  this contract does not choose either.
- **Result and access:** lifecycle writes can return `applied`, `replayed`,
  `stale`, or `conflict`. `stale` means the selected legacy
  membership snapshot did not change; it does not mean the event was ignored or
  temporal access stayed the same. After accepted evidence, the server rereads
  `resolve_plus_membership_access`. That resolver selects the greatest
  qualified initial-start key effective at sampled database time, then checks
  paid coverage only on that stream. A gap or failure denies access without
  falling back to an older stream. The resolver may return `unavailable` when
  access lookup fails; consumers fail closed and grant no access. Client UI,
  email, and provider redirects are never access authorities.

Provider selection requires current account-specific proof for seller-country
eligibility, TWD recurring support and exact cadence/charge semantics, customer
payment methods and supported launch jurisdictions, hosted checkout and
disclosure/consent capture, webhook authentication/retry/event identity,
period facts, cancellation timing, refunds/reversals/disputes, reconciliation,
receipts, and test-vs-production separation. General provider marketing or an
existing one-time integration does not establish these facts.

## Disclosure and communication requirements

The customer must be shown, before an explicit confirmation action, the
approved seller identity, Plus offer and exact recurring amount/currency and
interval, automatic-renewal fact, first-charge timing, subsequent charge timing,
how to cancel and when cancellation takes effect, access effect, failed-payment
handling/grace if any, and applicable refund and plan-change rules. Present the
same approved facts in product confirmation, hosted provider checkout, account
status, receipt, and notices. Do not draft jurisdiction-specific legal copy in
this engineering contract.

| Lifecycle point | Customer communication/evidence required | Engineering readiness vs. approval |
| --- | --- | --- |
| Initial confirmation | Before charge: approved recurring disclosure and affirmative consent bound to exact revisions. After authoritative start: confirmation/receipt with seller, plan, amount/currency, interval, first paid period, next-charge expectation, cancellation route, and support path. | Server must persist exact consent/evidence and deliver/retry an idempotent confirmation. #112/legal owner approves wording and required evidence. |
| Renewal success | Receipt or legally required renewal notice with charge amount/currency, transaction reference, covered period, and support/refund route. | Provider must expose authoritative charge/period facts; #112 confirms notice timing/content and owner confirms delivery operation. |
| Failed renewal | Prompt notice of failed collection, next retry or action required, current paid-through/access date, any approved grace, and cancellation/support route. | Retry schedule and grace are explicit policy inputs; provider must provide trustworthy outcomes. Do not call a transient warning an effective failure. |
| Cancellation | Durable request acknowledgement stating whether it is scheduled or effective now, effective date/time, next charge status, and paid access end. Confirm the effective cancellation when provider verifies it. | UI and provider behavior must match #107 policy; preserve request and verified-effective evidence separately as required. |
| Refund, reversal, or dispute | Acknowledge request/outcome and explain resulting charge/access state and support route; issue a financial receipt/notice where required. | Do not revoke or restore access on request alone. Apply only the approved policy to verified provider evidence; #112/legal owner approves applicable obligations. |
| Plan/price change (future) | Communicate new amount/interval, effective date, renewal impact, and any required new consent before applying it. | No date-driven NT$399 switch. Product Owner must explicitly approve transition and #112/legal review the required notice/consent first. |

## Next decision and implementation boundary

The next bounded child may implement a server-side admission/consent consumer
only after the owner has supplied and #112 has recorded the actual seller/entity
and launch jurisdictions, qualified legal review and approved disclosure
revision, explicit cancellation/access and failed-payment/refund policy,
selected provider with account-specific recurring/TWD eligibility and verified
event/period/cancellation semantics, and communication/support ownership. The
Product Owner must explicitly approve the offer mapping and consent revision;
legal/compliance owner records required notice and evidence obligations; the
merchant/account owner supplies provider facts; engineering verifies the
provider-to-#107 mapping and fail-closed behavior. If a fact is unknown, retain
the blocker and keep checkout disabled. Do not choose ECPay, PayPal, Stripe, or
another provider from historical one-time decisions.

Real provider activation, production credentials, live charges/refunds, and
production migration/action remain separate owner-authorized gates under
`docs/deployment.md` and #111. Historical Book Orders/Payments/Refunds and
entitlements remain auditable and unchanged.

References: [Product Contract](../product-contract.md),
[Platform Architecture](../platform-architecture.md),
[one-time Payment Decision Record](decision-record.md), [#107](https://github.com/davidkao-official/business-japanese-hub/issues/107),
[#112](https://github.com/davidkao-official/business-japanese-hub/issues/112),
[#176](https://github.com/davidkao-official/business-japanese-hub/issues/176).
