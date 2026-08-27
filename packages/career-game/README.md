# Career Game domain package

This private package owns the Career Game V1 scenario contract, validator, and pure runtime. It has no dependency on the Library `Book`, `Chapter`, or `ContentBlock` model and no UI, persistence, commerce, or backend concerns.

## V1 boundaries

- Content is plain JSON-safe data tagged with `CAREER_GAME_SCHEMA_VERSION` and a scenario-specific `contentVersion`.
- Scenarios may declare JSON-safe `cover` and `thumbnail` media assets. Stable `skillTags` and explicit `libraryLinks` may be attached at scenario or outcome/feedback granularity; links are identifiers only and do not import or query the Library domain.
- V1 rejects every unknown field, even when the value is JSON-safe. This fail-closed rule catches authoring mistakes and requires contract changes to be explicit. `validateScenario(unknown)` is non-throwing even when reflective access to hostile input fails.
- JSON-safe preflight rejects sparse arrays and reads array length metadata before index traversal. Globally, arrays are limited to 256 items, objects to 32 properties, nesting to 32 levels, and preflight to 50,000 visited values; validation returns at most 100 issues. Oversized or exhausted-budget input fails closed without per-hole diagnostics.
- Every scenario declaration and identifier reference is limited to 64 characters before format matching or lookup, including character, meter, flag, scene, choice, outcome, and explicit Library link ids.
- Conditions are limited to `flagEquals` and `meterAtLeast`. Effects are limited to `adjustMeter` and `setFlag`; meter results clamp to the definition's `min`/`max`.
- Every decision scene must provide at least one unconditional choice (missing `conditions` or an empty condition list), so validated content always has a fallback even when every conditional choice is unavailable. Structural graph validation still checks every declared route, then validation reuses the pure runtime to prove that at least one terminal is executable from the initial bounded meter/flag state.
- `CAREER_GAME_V1_LIMITS` is the executable-analysis complexity contract: at most 24 scenes, 4 meters, 8 flags, 2–4 choices per decision, 4 conditions per choice, 4 effects per outcome, and 96 outcomes. Validation reports `too_many_items` (or `invalid_choice_count` for choices) and stops semantic traversal at the applicable width limit. Each analyzed transition therefore scans at most 4 choices × 4 conditions, looks up among at most 96 outcomes and 24 scenes, applies at most 4 effects, and clones at most 4 meter plus 8 flag values.
- Executable-completion proof explores at most 50,000 distinct semantic states. Reaching that limit reports `executable_analysis_limit` and fails closed; history is excluded from its state key because V1 conditions and effects cannot inspect history, and the current scene is encoded as its bounded numeric scenario index rather than copied into every state key.
- Runtime checkpoints are keyed by scenario id and `contentVersion`. A mismatch returns a stale result; the consumer must reset or deliberately migrate outside this package. `isGameStateValid` is the non-throwing local-restore seam: it accepts only exact JSON-safe state and deterministically replays history from the initial state before trusting it.

Scenario content belongs in data files. Adding another case does not require a runtime or React branch.
