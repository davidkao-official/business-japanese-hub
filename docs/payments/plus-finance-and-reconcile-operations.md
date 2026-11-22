# Plus finance operations and bounded reconciliation (#276 M5/M6)

This is a pre-release engineering runbook. #107/#112 still own merchant,
customer policy, disclosures and notices; #186/#97 own deployment. The migrations
seed **no approved financial policy**. No money is moved by these RPCs.
Historical Book payments, refunds and entitlements remain separate.

## M5: request, verify, then apply an approved financial outcome

1. `finance_admin` sends the existing authenticated `finance` Edge Function
   `{ "action": "request_plus_finance_case", "sourceEventId": "<charge receipt>",
   "reason": "refund" }`. Reasons also include `reversal` and `dispute`.
   Only real, successful, amount-matched Plus authorization receipts with a
   per-installment `TradeNo` qualify. Request replay returns the same case.
   A request changes neither money nor access. A duplicate charge automatically
   queues `duplicate_charge` before callback completion; migration also queues
   eligible historical `not_mapped` duplicates.
2. Finance viewers/admins use `GET /functions/v1/finance?scope=plus` for the
   oldest 200 **unconfirmed** cases, including their order, installment amount,
   environment and bound policy revision. Confirmed cases cannot crowd out
   unresolved ones. Full history is retained in the three service-only tables
   and `admin_audit_log`.
3. The authorized operator verifies the installment against the intended
   merchant/account/environment in the private provider dashboard, transaction
   detail, reconciliation evidence, or provider/bank dispute correspondence.
   Bind the exact `MerchantTradeNo`, per-charge `TradeNo`, full TWD amount,
   provider outcome reference, effective timestamp and SHA-256 of the privately
   retained verified evidence. A refund request, API acceptance, screenshot of a
   browser return, or admin assertion alone is insufficient confirmation.
   Account identity and evidence contents remain private.
4. Actual refund/void execution remains an independently authorized provider
   operation. ECPay documents that its [refund API](https://developers.ecpay.com.tw/2885/)
   cannot be exercised in stage; it also does **not** stop recurring charges.
   Future-charge stop requires the separate [Cancel operation](https://developers.ecpay.com.tw/2900/)
   and verified stop/read-back evidence. This implementation calls neither an
   automatic refund API nor a fabricated dispute webhook.
5. After #107/#112 approves the actual policy, the deployment operator admits
   immutable `plus_ecpay_finance_policy` rows for the exact environment, plan,
   consent and policy revision, with approver/date and approval-evidence hash.
   Each of refund, void, reversal and dispute has an explicit `preserve` or
   `terminate_stream` effect. The latter terminates the **whole source stream**
   at the verified financial effective time; it is not a per-installment prorata
   calculation. No default effect or automatic restoration exists. New checkout
   fails closed until all four outcomes of one matching revision are admitted;
   its order pins that revision. Existing orders with no revision require a
   separately reviewed operator binding before confirmation.
6. A trusted service/operator ingestion context (not the browser finance API)
   calls `confirm_plus_ecpay_financial_outcome` with the case ID, environment,
   installment TradeNo, outcome (`refund|void|reversal|dispute`), full amount,
   provider reference, effective timestamp, evidence hash, pinned policy
   revision and accountable finance-admin actor. The caller is responsible for
   authenticating the provider evidence in step 3: the database cannot verify
   private dashboard/bank evidence from a hash. Service-role credentials never
   enter browser code, repository, command logs or this document.

Confirmation validates charge, amount, environment, plan/consent/policy binding,
actor and financial identity, then atomically appends its immutable outcome,
audit and (only if approved) existing normalized terminal lifecycle event.
Identical replays are no-ops; changed evidence conflicts. A provider reference
cannot confirm multiple cases, and an installment cannot receive two full
refund/void confirmations. Failure rolls back the entire transaction.
Partial refunds, ambiguous evidence, requests without confirmed outcomes,
restoration and unapproved policies stay in the unresolved queue; they do not
silently revoke or restore access. The order remains visible to provider
cancellation and reconciliation after a financial outcome.

## M6: admission and fair work bounds

- Database checkout admission serializes requests for the same user/environment:
  60-second creation cooldown, at most five created orders per rolling hour
  (including ended orders), and at most three pending orders. Existing historical
  excess orders are preserved and drained, not deleted. Limits run before the
  insert in the same transaction, so parallel Edge requests cannot bypass them.
  A rejection returns HTTP 429, `Retry-After: 60`, no signed checkout fields,
  and private/no-store caching. A pending-cap rejection can require provider
  reconciliation/stop before another checkout; time alone does not free a slot.
- Each scheduled invocation claims one order at a time using a service-only RPC
  with `FOR UPDATE SKIP LOCKED`, an exact lease token and 120-second expiry.
  Unseen orders precede previously checked ones; then least-recently-claimed
  order wins. Failed orders advance too. A crashed run becomes reclaimable after
  expiry; a stale worker cannot release a newer lease. No RAM cursor or oldest
  1,000-row ceiling remains. Claims are environment-bound and cannot spin on
  the same row within 60 seconds.
- One invocation processes at most 12 orders and cooperatively stops new work
  after 40 seconds. Provider fetches (including response-body reads) abort at
  at most five seconds and the remaining run budget. Database RPCs already in
  flight must settle; the budget is not a hard kill of a database transaction.
  Equivalent completed receipts are skipped in one batch read, while changed
  receipt hashes still take the conflict path. Partial ExecLog work resumes
  through immutable receipt results on the next run.
- `run bound reached` and query/ingest/release failures are operational alerts.
  Scheduler cadence is a separate #270 deployment setting. At an hourly cadence
  the upper bound is only 12 orders/hour; operators must monitor oldest claim
  age/backlog and explicitly choose a cadence that meets repair latency before
  billing admission. This PR does not change or deploy the scheduler.

## Integration and verification

This PR targets main independently. #281 owns M1/M2; #282 owns M3/M4/M7 and
changes the same ingest/checkout/reconcile files. During their combined review,
retain #282's canonical authorization binding and signed provider-stop checks;
apply this PR's finance queue at the canonical receipt ID in its duplicate **or
closed-order** branch, and run its stop operation through this PR's bounded
transport. Keep both test sets. Do not resolve overlapping hunks by taking one
whole file. #277's CheckMacValue correction and #270 scheduler remain separate.

Run complete `pnpm test`, typecheck, lint, both builds, artifact smokes,
public-content boundary and Edge checks. Database verification uses only
`pnpm test:db-guard` and `pnpm validate:db` under `docs/db-validation.md`.
The new pgTAP suites exercise policy/receipt binding, immutable replay/conflict,
real temporal cutoffs, role gates, request/audit atomicity, checkout limits,
fair rotation, wrong-token refusal and expired-lease recovery. Synthetic
fixture policies in disposable DB tests are not merchant/policy admission.
