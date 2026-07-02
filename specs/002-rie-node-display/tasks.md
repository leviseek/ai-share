# Tasks: RIE Node Summary Inference

**Input**: Design documents from `/specs/002-rie-node-display/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/node-summary-contract.md, quickstart.md

**Tests**: Included because this repository requires test-first delivery for feature work.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared files for summary inference work without changing behavior yet.

- [x] T001 Create summary module scaffold in `src/knowledge/summary/index.ts`
- [x] T002 [P] Create summary inference test file scaffold in `src/knowledge/summary/inference.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the shared domain contract needed before any user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Add `SummarySource`, `SummaryConfidence`, and `SummaryProvenance` types to `src/knowledge/core/types.ts`
- [x] T004 Add `summaryProvenance` optional fields to `KnowledgeObject` and `GraphNode` in `src/knowledge/core/types.ts`
- [x] T005 Define summary inference input/output helpers and safe signal categories in `src/knowledge/summary/index.ts`
- [x] T006 Export summary module types through `src/knowledge/summary/index.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Understand node purpose from summary (Priority: P1) 🎯 MVP

**Goal**: Every visible graph node has a persisted display summary or explicit no-summary explanation.

**Independent Test**: Build a fixture repository and verify all persisted objects/nodes have summary text plus provenance, including nodes without explicit source summaries.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation.**

- [x] T007 [P] [US1] Add coverage test for summaries on Directory, CodeFile, CodeSymbol, Config, Script, Package, Project, and File nodes in `src/knowledge/tests/rie.test.ts`
- [x] T008 [P] [US1] Add unit tests for deterministic inferred summaries and no-summary fallback in `src/knowledge/summary/inference.test.ts`

### Implementation for User Story 1

- [x] T009 [US1] Implement redaction, compaction, and 120-character display text normalization in `src/knowledge/summary/index.ts`
- [x] T010 [US1] Implement deterministic summary inference from type, title, path, tags, language, metadata, and relationships in `src/knowledge/summary/index.ts`
- [x] T011 [US1] Apply summary inference to all `KnowledgeObject` values before graph construction in `src/knowledge/index.ts`
- [x] T012 [US1] Propagate summary text from `KnowledgeObject` to `GraphNode` in `src/knowledge/graph/builder.ts`
- [x] T013 [US1] Ensure project root object summary is redacted/compacted through the same path in `src/knowledge/index.ts`

**Checkpoint**: User Story 1 is independently testable with `bun test src/knowledge`.

---

## Phase 4: User Story 2 - Trust how summaries were inferred (Priority: P2)

**Goal**: Every summary includes explainable provenance with source, signals, confidence, and fallback reason when applicable.

**Independent Test**: Inspect summary provenance for explicit, inferred, no-summary, and reserved ai-enhanced cases without relying on display-only behavior.

### Tests for User Story 2 ⚠️

- [x] T014 [P] [US2] Add unit tests for explicit, inferred, no-summary, and reserved ai-enhanced provenance values in `src/knowledge/summary/inference.test.ts`
- [x] T015 [P] [US2] Add integration assertions for persisted summary provenance after write/read roundtrip in `src/knowledge/tests/rie.test.ts`

### Implementation for User Story 2

- [x] T016 [US2] Implement provenance assignment rules for explicit, inferred, and no-summary sources in `src/knowledge/summary/index.ts`
- [x] T017 [US2] Add confidence and fallback reason logic for weak or missing signals in `src/knowledge/summary/index.ts`
- [x] T018 [US2] Persist `summaryProvenance` through graph nodes and JSONL snapshot roundtrip in `src/knowledge/graph/builder.ts`
- [x] T019 [US2] Verify `summaryProvenance` is preserved by `JsonlKnowledgeStore` read/write types in `src/knowledge/storage/jsonl-store.ts`

**Checkpoint**: User Story 2 is independently testable through summary module tests and snapshot roundtrip tests.

---

## Phase 5: User Story 3 - Reuse summaries across RIE surfaces (Priority: P3)

**Goal**: Graph, context, impact, export, Studio, and MCP surfaces reuse the same persisted summary and provenance.

**Independent Test**: Compare the same node across graph, context, impact, export, Studio, and MCP outputs and verify summary/provenance consistency with stable identity.

### Tests for User Story 3 ⚠️

- [x] T020 [P] [US3] Add cross-surface summary consistency assertions for CLI graph/context/impact/export helpers in `src/knowledge/tests/rie.test.ts`
- [x] T021 [P] [US3] Add Studio graph display assertions for `summaryProvenance` in `src/knowledge/studio/data.test.ts`

### Implementation for User Story 3

- [x] T022 [US3] Include summary provenance in context prompt bundle object data in `src/knowledge/studio/data.ts`
- [x] T023 [US3] Ensure Studio graph view filtering/search retains persisted summary provenance in `src/knowledge/studio/data.ts`
- [x] T024 [US3] Ensure MCP graph, neighbors, impact, explain, and graphExport outputs expose persisted summary provenance in `src/knowledge/mcp/tools.ts`
- [x] T025 [US3] Ensure JSON graph export includes summary provenance while Mermaid export remains label-only in `src/knowledge/graph/export.ts`

**Checkpoint**: All user stories are independently functional and cross-surface behavior is consistent.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate quality gates and align documentation artifacts.

- [x] T026 [P] Update implementation notes in `specs/002-rie-node-display/quickstart.md` if validation commands change
- [x] T027 Run focused tests from `specs/002-rie-node-display/quickstart.md`
- [x] T028 Run `bun run typecheck` from repository root
- [x] T029 Run RIE build/doctor validation commands from `specs/002-rie-node-display/quickstart.md`
- [x] T030 Review final diff against `specs/002-rie-node-display/contracts/node-summary-contract.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; MVP scope.
- **User Story 2 (Phase 4)**: Depends on Foundational and can run after US1 test scaffolding exists; uses the same summary module.
- **User Story 3 (Phase 5)**: Depends on US1 and US2 because surfaces need persisted summary/provenance fields.
- **Polish (Phase 6)**: Depends on desired user stories being complete.

### User Story Dependencies

- **US1**: No dependency on other user stories after Foundational.
- **US2**: Can be developed after Foundational, but full integration validation benefits from US1 summary inference.
- **US3**: Requires US1 summary text and US2 provenance to be available.

### Within Each User Story

- Write tests first and confirm they fail.
- Implement domain/helper logic before wiring surfaces.
- Run focused story tests before moving to the next story.

## Parallel Opportunities

- T002 can run in parallel with T001.
- T007 and T008 can run in parallel because they touch different test files.
- T014 and T015 can run in parallel because one is unit-level and one is integration-level.
- T020 and T021 can run in parallel because they touch different test files.
- T026 can run in parallel with final validation commands if quickstart commands do not change.

## Parallel Example: User Story 1

```text
Task: "T007 Add coverage test for summaries on Directory, CodeFile, CodeSymbol, Config, Script, Package, Project, and File nodes in src/knowledge/tests/rie.test.ts"
Task: "T008 Add unit tests for deterministic inferred summaries and no-summary fallback in src/knowledge/summary/inference.test.ts"
```

## Parallel Example: User Story 2

```text
Task: "T014 Add unit tests for explicit, inferred, no-summary, and reserved ai-enhanced provenance values in src/knowledge/summary/inference.test.ts"
Task: "T015 Add integration assertions for persisted summary provenance after write/read roundtrip in src/knowledge/tests/rie.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "T020 Add cross-surface summary consistency assertions for CLI graph/context/impact/export helpers in src/knowledge/tests/rie.test.ts"
Task: "T021 Add Studio graph display assertions for summaryProvenance in src/knowledge/studio/data.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete US1 tests and implementation.
3. Validate every persisted node has summary text plus provenance.
4. Stop and review MVP before adding trust/provenance depth and cross-surface reuse.

### Incremental Delivery

1. US1: Persist safe deterministic summaries.
2. US2: Add explainable provenance and snapshot roundtrip validation.
3. US3: Reuse fields across Studio, MCP, context, impact, and export.
4. Polish: Run quickstart validation and typecheck.

### Notes

- Do not introduce new dependencies or model/API calls.
- Do not commit `.rie/` runtime output.
- Do not use `as any` or `@ts-ignore`.
- Preserve existing object and graph node identity fields.
