# Data Model: Stable AI Summary Cache

## Summary Cache Identity

Represents the stable, canonical payload hashed to decide whether an AI Summary can be reused.

### Fields

- `kind`: constant identity namespace for AI node summaries.
- `promptVersion`: version of the AI Summary prompt contract.
- `selectedNode`: `Stable Node Identity` for the requested node.
- `oneHopNodes`: sorted list of `Stable Node Identity` values for all nodes included in summary context.
- `incoming`: sorted list of `Relationship Topology Identity` values for incoming summary-context edges.
- `outgoing`: sorted list of `Relationship Topology Identity` values for outgoing summary-context edges.
- `fileContent`: optional `File Content Identity` when file content is part of the summary context.
- `aiConfiguration`: `AI Configuration Identity`.

### Validation Rules

- Must be serialized canonically before hashing.
- Must not include `updatedAt`, import root, temporary import directory, build time, volatile edge metadata, API key, or stream mode.
- Must not be considered reusable if selected or included one-hop node content hash is missing.

## Stable Node Identity

Stable description of a graph node relevant to summary correctness.

### Fields

- `id`: graph node id.
- `type`: graph node type.
- `path`: repository-relative path when present.
- `hash`: content hash.

### Validation Rules

- `id`, `type`, and `hash` are required for cache reuse.
- `path` must remain repository-relative and must not include absolute import roots or temp directories.
- Any selected or one-hop node missing `hash` prevents reuse of existing AI Summary for that context.

## Relationship Topology Identity

Stable representation of relationship structure in summary context.

### Fields

- `from`: source node identity reference.
- `to`: target node identity reference.
- `direction`: `incoming` or `outgoing` relative to selected node.
- `type`: relationship type.

### Validation Rules

- Must exclude volatile edge metadata and timestamps.
- Relationship lists must be sorted deterministically.
- Any change in connected node identity, direction, or relationship type changes summary cache identity.

## File Content Identity

Stable representation of relevant file content when the selected node summary includes file context.

### Fields

- `path`: repository-relative file path.
- `hash`: file content hash.

### Validation Rules

- File hash is authoritative for file content changes.
- Absolute repo root and temporary import location must not be included.
- If file content cannot be read, the identity must reflect safe non-reuse or omit file context only when summary context also omits file content.

## AI Configuration Identity

Semantic AI configuration that determines whether two summaries are comparable.

### Fields

- `provider`: selected provider id.
- `baseUrl`: selected provider endpoint.
- `model`: selected model id/name.
- `promptVersion`: summary prompt version.

### Validation Rules

- API key value or environment variable value must never be included.
- Stream/non-stream mode must not be included.
- Provider/baseUrl/model/promptVersion changes must produce a distinct cache identity.

## AI Summary Cache Entry

Persisted summary result keyed by Summary Cache Identity hash.

### Fields

- `cacheKey`: hash of Summary Cache Identity.
- `inputHash`: hash or diagnostic representation of stable identity input for observability.
- `summary`, `overview`, `details`: displayed AI Summary content.
- `model`, `provider`: display metadata for generated result.
- `cached`: runtime response state, not persisted as an identity input.
- `generatedAt`: display/audit timestamp, not an identity input.

### State Transitions

1. `miss`: no matching reusable cache entry exists or stable identity cannot be established.
2. `generating`: AI request is initiated.
3. `stored`: generated result is written under stable `cacheKey`.
4. `hit`: later request with matching stable identity reads the existing entry and returns it with cached state.
