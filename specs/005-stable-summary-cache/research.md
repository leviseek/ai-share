# Research: Stable AI Summary Cache

## Decision: Keep current Bun + strict TypeScript + RIE Studio architecture

**Rationale**: The feature changes cache identity semantics, not the runtime platform. Existing `generateAiNodeSummary`, `buildPromptInput`, `AiNodeSummaryCache`, and `JsonFileAiNodeSummaryCache` already provide the correct integration boundary for computing an identity, checking cache, and writing results.

**Alternatives considered**:

- Introduce a new cache service layer: rejected because current `AiNodeSummaryCache` interface already isolates storage.
- Move identity computation into UI: rejected because cache correctness belongs to the server/runtime summary path.

## Decision: Build cache identity from a dedicated stable identity payload

**Rationale**: The current prompt input can contain fields useful for AI context but unsuitable for cache identity, such as `updatedAt`. A dedicated identity payload makes inclusion/exclusion rules testable and avoids accidental cache fragmentation.

**Alternatives considered**:

- Hash the full prompt input: rejected because prompt input may include volatile or presentation-only fields.
- Hash only selected node id/path: rejected because it would miss one-hop, edge, file content, and AI configuration changes.

## Decision: Relationship topology identity includes connected node identities, direction, and relationship type only

**Rationale**: This matches clarification outcomes and captures meaningful topology changes while excluding volatile edge metadata. Sorting canonicalized edge identity before hashing keeps output deterministic.

**Alternatives considered**:

- Include all edge fields: rejected because metadata may contain volatile values.
- Include only from/to direction: rejected because relationship type changes can alter summary meaning.

## Decision: Missing content hash disables cache reuse for the affected summary context

**Rationale**: If the selected node or any included one-hop node lacks content hash, unchanged context cannot be proven. Conservative non-reuse prevents stale summaries from being silently served.

**Alternatives considered**:

- Fall back to id/type/path: rejected because content changes with stable paths would be missed.
- Allow fallback only for non-file nodes: rejected because spec requires any included selected/one-hop node without content hash to avoid reuse.

## Decision: AI streaming mode remains excluded from cache identity

**Rationale**: Stream/non-stream is a transport/display preference and does not define the semantic model identity. Including it would duplicate cache entries for the same provider/base_url/model/promptVersion.

**Alternatives considered**:

- Include stream mode unconditionally: rejected because it causes unnecessary regeneration.
- Include stream mode conditionally per provider: rejected because it complicates behavior without a current requirement.

## Decision: Preserve current file-backed cache storage

**Rationale**: The spec targets stable keys and reuse behavior, not storage migration. Existing configurable cache directory and JSON-file cache satisfy cross-refresh and repeated import reuse when available.

**Alternatives considered**:

- Add SQLite or graph storage: rejected by constitution's storage-last principle and unnecessary for this feature.
