# Career Game validation evidence

Issue #68 expands the free Career Game validation set without changing the
generic scenario runtime, shared progress/evidence contract, or Book commerce
architecture.

## Production case set

These identifiers are stable public content references. A content edit must
increment the case's `contentVersion` and preserve the server/client registry
alignment.

| Stable ID | Workplace judgment | Direct route |
| --- | --- | --- |
| `rookie-survival` | 報連相 and reporting a developing problem | `/cases/rookie-survival` |
| `customer-communication` | 取引先への customer-facing communication | `/cases/customer-communication` |
| `upward-disagreement` | Disagreeing upward in a meeting | `/cases/upward-disagreement` |

Every case is playable anonymously and through the authenticated
`career-game-progress` boundary. Outcomes are deterministic and use only the
authoritative stable skill IDs documented in `docs/learning-and-progress.md`.
Case-specific rendering or progress branches are not part of the contract.

## Technical validation gate

Technical validation is complete only when all three heterogeneous cases have
been exercised through the same route, runtime, anonymous checkpoint, and
authenticated progress/evidence paths, and the following checks pass on the
reviewed exact HEAD:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke:built-frontends
supabase db start
supabase db reset --local
supabase test db --local supabase/tests
supabase db lint --local
git diff --check
```

Run the two `smoke:deployment` commands against the exact candidate preview
origins before release. After the Pages projects deploy that exact HEAD, repeat
them against the canonical Career Game and Library origins. The canonical Game
smoke must include the runtime catalog markers for all three cases; an older
production bundle is not evidence for this ticket.

Release QA must also cover root selection, each `/cases/:slug` route, each
stable `/case-link?scenarioId=...` route, reload/deep-link behavior, mobile and
desktop layouts, keyboard/focus/reduced-motion behavior, anonymous replay, and
authenticated resume/conflict handling. Library reading, paid Book access,
purchase-result, and payment regression checks remain separate required gates.

Automated tests, team smoke, a successful deploy, or a CI green build are
technical evidence only. They are not real-user product validation.

## Evidence required before #59

`#59` remains deferred until the canonical production Career Game has real-user
evidence across the expanded set. The evidence package must contain:

1. observed real-user usage of more than one materially different case,
   including whether people start, complete, replay, and move to linked Library
   content;
2. qualitative feedback showing that the cases teach useful workplace judgment
   (especially hierarchy, tone, pragmatics, and consequences), rather than only
   that the UI or Japanese text is understandable; and
3. a product decision record stating whether users ask for, return for, or show
   credible willingness to support a future non-Book experience, with the
   method, cohort context, limitations, and analytics interpretation recorded.

The bounded analytics vocabulary in
`docs/product-validation-analytics.md` is directional and does not identify
unique users. It can support the evidence package but cannot, by itself, prove
commercial demand. Human observation, user feedback, and the product decision
remain required. No #59 implementation should begin from technical validation
alone.
