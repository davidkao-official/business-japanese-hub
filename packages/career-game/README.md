# Career Game domain package

This private package owns the Career Game V1 scenario contract, validator, and pure runtime. It has no dependency on the Library `Book`, `Chapter`, or `ContentBlock` model and no UI, persistence, commerce, or backend concerns.

## V1 boundaries

- Content is plain JSON-safe data tagged with `CAREER_GAME_SCHEMA_VERSION` and a scenario-specific `contentVersion`.
- V1 rejects every unknown field, even when the value is JSON-safe. This fail-closed rule catches authoring mistakes and requires contract changes to be explicit.
- Conditions are limited to `flagEquals` and `meterAtLeast`. Effects are limited to `adjustMeter` and `setFlag`; meter results clamp to the definition's `min`/`max`.
- Graph validation treats every declared choice route as an edge regardless of its condition. Every scene must be reachable from `startSceneId`, at least one reachable terminal must exist, and each reachable scene must have a route to a terminal.
- Runtime checkpoints are keyed by scenario id and `contentVersion`. A mismatch returns a stale result; the consumer must reset or deliberately migrate outside this package.

Scenario content belongs in data files. Adding another case does not require a runtime or React branch.
