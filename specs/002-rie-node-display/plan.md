# Implementation Plan: RIE Node Summary Inference

**Branch**: `002-rie-node-display` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-rie-node-display/spec.md`

**Note**: This plan follows the existing ai-share/RIE technology stack and does not introduce new runtime dependencies.

## Summary

Add deterministic build-time node summary inference to RIE. Each persisted knowledge snapshot will expose a concise, redacted, Simplified Chinese display summary plus provenance for every graph node, while preserving stable object identity and compatibility with existing graph, context, impact, export, Studio, and MCP surfaces.

## Technical Context

**Language/Version**: TypeScript with current project strict settings; Bun runtime and package scripts.

**Primary Dependencies**: Existing project dependencies only: TypeScript compiler API for code parsing, Bun test runner, current RIE modules under `src/knowledge/`, existing Studio UI stack.

**Storage**: Existing local `.rie` JSONL snapshot store via `src/knowledge/storage/jsonl-store.ts`; summaries are persisted inside snapshot node/object display data rather than a new database.

**Testing**: `bun test`, focused RIE tests under `src/knowledge/**`, plus `bun run typecheck` and RIE build/doctor commands.

**Target Platform**: Local developer CLI and Studio on the existing Windows/PowerShell + Bun environment; no network service required.

**Project Type**: TypeScript CLI/library plus local Studio UI for repository intelligence.

**Performance Goals**: Summary inference must run during normal knowledge build without changing the expected local developer workflow; repeated builds on the same snapshot inputs must produce identical summary text and provenance.

**Constraints**: No new dependencies; no model/API call required for v1; no real secrets in summaries/provenance; summary display text targets 120 characters or fewer; prose defaults to Simplified Chinese while identifiers remain unchanged.

**Scale/Scope**: Current ai-share repository RIE snapshot, covering all existing supported knowledge object types and graph surfaces.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Source-First Configuration**: PASS. Changes target source files and feature artifacts only; generated Codex runtime files are not durable sources.
- **II. Env-Only Secret Handling**: PASS. The feature explicitly redacts secret-like values and introduces no stored credentials.
- **III. Strict TypeScript And Test-First Delivery**: PASS. Implementation will preserve strict TypeScript and add focused tests before implementation changes.
- **IV. Runtime Outputs Are Generated Artifacts**: PASS. `.rie/` remains runtime state; snapshot schema changes are implemented in source, not by committing runtime output.
- **V. API First, Domain First, Storage Last**: PASS. The plan defines summary domain objects and contracts before storage mechanics; persistence remains replaceable behind existing snapshot abstractions.

## Project Structure

### Documentation (this feature)

```text
specs/002-rie-node-display/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── node-summary-contract.md
└── tasks.md              # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
src/knowledge/
├── core/                 # KnowledgeObject, GraphNode, summary provenance types
├── graph/                # Graph node construction and persisted display summary propagation
├── parsers/              # Existing explicit summary producers remain source signals
├── storage/              # Existing JSONL snapshot read/write contract
├── studio/               # Graph/context/impact display surfaces
├── context/              # Prompt bundle and context reuse of persisted summaries
├── mcp/                  # Tool output contract reuse
└── tests/                # End-to-end RIE fixture coverage
```

**Structure Decision**: Use the existing single TypeScript project and RIE module layout. Introduce summary inference as RIE domain logic inside `src/knowledge/` and route it through existing build/graph/storage surfaces; do not create a new package, service, database, or model integration.

## Phase 0: Research Summary

See [research.md](./research.md). Key decisions:

- Build-time deterministic summary inference is persisted in the snapshot.
- Summary provenance records source, signals, confidence, and fallback reason.
- Explicit summaries are redacted and compacted before becoming display summaries.
- Summary prose defaults to Simplified Chinese; identifiers remain unchanged.
- No new dependencies or AI calls are required for v1.

## Phase 1: Design Summary

See [data-model.md](./data-model.md) and [contracts/node-summary-contract.md](./contracts/node-summary-contract.md).

Design output:

- Add/extend summary fields on knowledge/graph display data without changing object identity.
- Add summary provenance metadata with deterministic values.
- Define validation rules for coverage, length, redaction, determinism, and cross-surface consistency.
- Keep runtime snapshots local and ignored.

## Post-Design Constitution Check

- **I. Source-First Configuration**: PASS. Design artifacts and future source changes are under repo source paths.
- **II. Env-Only Secret Handling**: PASS. Contract requires redaction before persistence and display.
- **III. Strict TypeScript And Test-First Delivery**: PASS. Quickstart defines focused tests and typecheck.
- **IV. Runtime Outputs Are Generated Artifacts**: PASS. `.rie/` remains validation output only.
- **V. API First, Domain First, Storage Last**: PASS. Data model and contracts precede implementation/storage changes.

## Complexity Tracking

No constitution violations.
