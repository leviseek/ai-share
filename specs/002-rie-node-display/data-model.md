# Data Model: RIE Node Summary Inference

## Entity: Node Summary

**Purpose**: Display-ready explanation of what a graph node represents.

**Fields**:

- `text`: non-empty display text, redacted and compacted; target length 120 characters or fewer.
- `language`: `zh-CN` for v1 inferred summaries; identifiers remain unchanged inside text.
- `provenance`: reference to Summary Provenance.

**Validation rules**:

- Must not contain real API keys, tokens, cookies, passwords, or private credentials.
- Must be deterministic for the same snapshot input.
- Must preserve stable node/object identity independently from text.
- If a safe text cannot be produced, use explicit fallback text and no-summary provenance.

## Entity: Summary Provenance

**Purpose**: Explain where summary text came from and how much trust to place in it.

**Fields**:

- `source`: one of `explicit`, `inferred`, `no-summary`, `ai-enhanced`.
- `signals`: ordered list of safe signals used, such as `type`, `title`, `path`, `tags`, `language`, `metadata`, `relationships`.
- `confidence`: one of `high`, `medium`, `low`.
- `fallbackReason`: short reason when `source` is `no-summary` or confidence is low.

**Validation rules**:

- Every displayed summary must have provenance.
- `explicit` summaries still pass through redaction and compaction.
- `ai-enhanced` is reserved for future optional enhancement and is not required for v1.

## Entity: Node Display Profile

**Purpose**: User-facing node payload reused by graph, context, impact, export, Studio, and MCP surfaces.

**Fields**:

- Existing identity/display fields: `id`, `objectId`, `type`, `label`, `path`, `language`, `tags`, `metadata`, `updatedAt`, `hash`.
- Summary fields: `summary`, `summaryProvenance`.
- Existing or future relationship display metrics remain separate from persisted summary text.

**Relationships**:

- Belongs to a Knowledge Object by `objectId`.
- Is included in Graph Views and other RIE surfaces.
- Uses Relationship Context as an inference signal when available in the build snapshot.

## Entity: Relationship Context

**Purpose**: Snapshot relationships that help infer node purpose.

**Fields**:

- Incoming relationship type counts.
- Outgoing relationship type counts.
- Neighbor object types and labels when safe and available.

**Validation rules**:

- Use repository snapshot relationships for persisted summary inference.
- Visible graph filters may change display metrics but must not change persisted summary text.

## State Transitions

```text
Knowledge object parsed
  -> explicit summary normalized OR missing summary detected
  -> summary inference evaluates safe signals
  -> summary text redacted and compacted
  -> summary provenance assigned
  -> snapshot persisted
  -> graph/context/impact/export surfaces reuse persisted summary
```

## Compatibility Notes

- Existing object/node identifiers remain unchanged.
- Existing consumers that ignore summary provenance continue to read core node identity.
- Runtime `.rie` output remains generated local state and is not committed.
