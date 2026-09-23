# Plus lifecycle pgTAP coverage map

The reconciliation suites assert the selected state/access projection and the
immutable event or per-stream summary evidence that explains it. They do not
use `admitted_at`, `retired_at`, or an observed-event watermark as selection
authority.

| Current suite | Current observable contract |
| --- | --- |
| `plus_membership_lifecycle_reconciliation_fold.test.sql` | Same-stream chronological fold in either delivery order; pending has no grant; RLS and helper execution remain server-only. |
| `plus_membership_lifecycle_reconciliation_identity_plan.test.sql` | Exact replay, immutable-fact and source-user binding rejection; receipt-time catalog proof, exact-plan continuation after closure, and changed-plan buffered proof. |
| `plus_membership_lifecycle_reconciliation_selection.test.sql` | Start-key selection across streams, pending/terminal-only no-authority, same-stream terminal scope, predecessor and replaced-stream permutations, and re-selection after a candidate is disqualified. |
| `plus_membership_lifecycle_reconciliation_scheduled.test.sql` | Scheduled cutoff clamps summary and access, terminal-first delivery retains a qualifying later start before cutoff, and elapsed cutoff prevents admission. |
| `plus_membership_lifecycle_reconciliation_admission_conflict.test.sql` | Inactive starts remain audit-only, same-time start-key tie, empty paid interval, terminal-before-start re-selection, and durable conflict in both arrival orders. |
| `plus_membership_lifecycle_terminal_confirmation.test.sql` | Six immediate terminal kinds × all six start/pending/terminal delivery permutations; active access is never restored, terminal summary survives, replay adds no event. |
| `plus_membership_lifecycle_terminal_ties.test.sql` | Equal-time start/cutoff in both event-identity and delivery orders; summary retains cutoff and remains unqualified. |
| `plus_membership_lifecycle_bootstrap.test.sql`; `plus_membership_lifecycle_legacy_start_guard.test.sql` | Empty bootstrap acceptance; existing-row preservation on rejection; legacy-start ambiguity remains unqualified without relabeling a new v1 receipt; Early Access TWD 29,900 is active and Standard TWD 39,900 is inactive. |
| `plus_membership_temporal_access_windows.test.sql` | Active A/future B and exact selection boundary; unpaid gaps; same-stream future renewal; failure clipping/removal and recovery; newer failed B without A fallback; immediate/scheduled terminal clipping; invalidated B reselection; replay and legacy ambiguity; service RPC and table/helper privilege boundaries. |

| Retired source suites | Ported invariant |
| --- | --- |
| `lifecycle`, `admission`, `plan_gate`, `eligibility_chain`, `buffered_plan`, `buffered_start`, `admission_chain`, `observation_admission` | Fold/plan proof/identity cases are represented by fold, identity-plan, and admission-conflict suites above. Mutable admission markers and observed-watermark assertions were removed. |
| `buffered_evidence`, `ordering`, `pending_confirmation`, `pending_succession`, `provisional_stream`, `retired_admitted`, `stream_selection`, `terminal_successor`, `terminal_clock` | Delivery permutations and no-resurrection cases are represented by fold and selection suites. Barrier and physical-retirement assertions were removed. |
| `buffered_terminal` | Buffered terminal dominance and delayed confirmation are represented by the selection suite's two-order terminal-before-start case. |
| `scheduled_admission`, `scheduled_live` | Future cutoff and elapsed-cutoff admission behavior is represented by scheduled and selection suites. Test-side mutation of reducer markers was removed. |

The terminal source suites `terminal_confirmation` and `terminal_ties` are
retained with current-summary assertions. `plus_membership_lifecycle_scheduled_terminal.test.sql`
also remains unchanged as a passing cutoff-delivery boundary test. Related
passing suites remain the boundary checks: `plus_membership_access_effective_start.test.sql` covers the
snapshot effective start, continuous same-stream renewal, and stream replacement;
`supabase/functions/content-delivery/membership.test.ts` verifies strict RPC result
mapping, active/non-member/unavailable handling, and no direct snapshot-table lookup. The retained
`plus_membership_access_projection.test.sql` verifies browser-role isolation
and that Book entitlement writes stay separate. `entitlement_rls.test.sql`
asserts active/refunded Book visibility, and `payment_atomicity.test.sql`
asserts successful Book order grants plus refund revocation independently of
recurring membership.
