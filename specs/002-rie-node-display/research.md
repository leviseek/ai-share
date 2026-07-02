# Research: RIE Node Summary Inference

## Decision: Generate summaries during knowledge build and persist them in the snapshot

**Rationale**: The clarified spec requires consistent summaries across graph, context, impact, export, Studio, and MCP surfaces. Build-time persistence makes repeated output deterministic and avoids per-view drift.

**Alternatives considered**:

- Request-time generation only: rejected because graph scope could change summary text and make cross-surface validation harder.
- Hybrid persisted base plus dynamic overlays: deferred because v1 needs stable summaries first; visible-scope metrics can remain separate display data.

## Decision: Use deterministic local inference and no required model call for v1

**Rationale**: Existing RIE is local-first, offline-capable, and governed by env-only secret handling. Rule-based inference can use existing signals: object type, title, path, tags, language, metadata, and relationships.

**Alternatives considered**:

- Mandatory AI-generated summaries: rejected due to cost, credentials, network dependency, and reproducibility risk.
- Optional AI enhancement: accepted only as a future provenance source; not required for v1 completion.

## Decision: Redact and compact explicit summaries before persistence

**Rationale**: Explicit source text can be long or contain sensitive-looking values. Display summaries must be safe, compact, and consistent with the 120-character target.

**Alternatives considered**:

- Preserve explicit summaries exactly: rejected because it conflicts with secret-safety and dense graph readability.
- Store full explicit summary plus compact display summary: deferred because v1 only needs display-ready persisted summaries.

## Decision: Summary provenance includes source, signals, confidence, and fallback reason

**Rationale**: Provenance allows maintainers to trust or debug summaries without treating inferred text as authoritative source documentation.

**Alternatives considered**:

- Source-only provenance: rejected because it does not explain inference enough for diagnostics.
- Full audit trail: rejected for v1 because it risks noisy output and unnecessary storage shape complexity.

## Decision: Default summary prose is Simplified Chinese with identifiers unchanged

**Rationale**: Repository collaboration prose defaults to Simplified Chinese, while identifiers, paths, commands, API names, and symbols should remain exact for developer use.

**Alternatives considered**:

- English-only summaries: rejected because it conflicts with project communication norms.
- Match detected source language: deferred because detection ambiguity could reduce determinism.

## Decision: Preserve existing storage and surface architecture

**Rationale**: The user explicitly requested using the current tech stack. Existing `BuildResult`, `KnowledgeObject`, `GraphNode`, JSONL store, CLI, Studio, context, and MCP surfaces already carry summary-like data and can be extended without new packages.

**Alternatives considered**:

- Add a new summary database/cache: rejected because `.rie` snapshot already owns local runtime state.
- Add a new service layer: rejected because RIE v1 is a local developer tool.
