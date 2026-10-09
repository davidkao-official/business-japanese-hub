# Workplace Learn Japanese content contract

Workplace Learn runtime content uses `schemaVersion: 2`. V2 requires Japanese explanations for every lesson and vocabulary item. V1 remains Japanese-first and exposes no incomplete non-Japanese locale. Existing dormant interface resources remain available for future localization; lesson and vocabulary teaching prose is Japanese and rendered with `lang="ja"`.

## Japanese core

Lesson items require `meaningInContextJa`, `whyItWorksJa`, `cautionJa`, and `explanationJa` on every example. Vocabulary items require `meaningJa`, `workplaceNuanceJa`, `cautionJa`, and `example.explanationJa`.

All other teaching prose fields already present in the lesson and vocabulary shapes are Japanese in v2. This includes situation, learning objective, skill, judgment, guidance, example context and Japanese sentence, takeaway, usage context, register, and relationship context. The original fictional Free samples also use Japanese for `title`, `lead`, and their language metadata. IDs, slugs, kinds, access, category, tags, links, and stable relationships retain their existing meaning.

Japanese core is mandatory even when a support overlay supplies the same information. V2 does not accept the old top-level `*ZhTW` fields or any schema version other than 2. The named `WorkplaceLearnLegacyV1*` types exist only to inspect historical content; validators and runtime consumers do not admit or migrate those items.

## Optional support overlays

`supportOverlays.byLocale` is an optional dormant extension. It never replaces Japanese core and is not rendered in V1. Locale keys use the Practice BCP-47-like format `^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$`; this is a format check, not a locale launch allowlist.

Lesson overlays allow only `meaningInContext`, `whyItWorks`, `caution`, and `examples?: [{ explanation }]`. If `examples` is present, it aligns one-to-one with the Japanese example array. Vocabulary overlays allow only `meaning`, `workplaceNuance`, `caution`, and `example?: { explanation }`. Each locale overlay must contain at least one supported field. Unknown nested fields, malformed locale keys, HTML/Markdown, empty strings, and out-of-bound values are rejected.

Limits follow the corresponding Japanese core fields: at most 12 locales; lesson meaning/why 2,000 characters, caution 1,600, and each example explanation 1,600; vocabulary meaning 600, nuance 1,400, caution 1,200, and example explanation 1,600. Projection deep-clones overlay objects and arrays. Body-free catalog entries omit overlays and all teaching prose.

## Admission and release boundaries

The runtime and authoring validators accept only well-formed v2 Japanese-core items. The public catalog carries body-free schema-v2 metadata. The member client validates the v2 body against its catalog identity and the existing delivery envelope. Free rendering and injected member loaders validate again before rendering, so a malformed body cannot be displayed through an injected prop.

Private Workplace Learn release envelope version 1 remains unchanged. Existing content ID, revision, membership, rights, review, source-path, JSONB compatibility, and payload-size safeguards remain in force. V1 historical revisions are not rewritten or translated. The public Git artifact guard continues to recognize legacy v1 private bodies and also detects v2 authoring bodies, Plus runtime bodies, and their delivery wrappers.

The public sample lesson and vocabulary remain explicitly fictional, non-proprietary teaching fixtures with no release or reviewer metadata. Their Japanese content is draft material pending independent content review; the sample marker does not imply approval for production release.
