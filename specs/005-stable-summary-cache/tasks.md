# Tasks: Stable AI Summary Cache

**Input**: Design documents from `specs/005-stable-summary-cache/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/ai-summary-cache-identity.md`, `quickstart.md`

**Tests**: Included because the specification requires targeted cache reuse/invalidation verification and the project constitution requires test-first delivery.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (`US1`, `US2`, `US3`)
- Each task includes an exact repository file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm current implementation seams and preserve the existing Bun + strict TypeScript + RIE Studio stack.

- [x] T001 Inspect current cache key and prompt input behavior in src/knowledge/studio/ai-summary.ts
- [x] T002 [P] Inspect existing AI summary cache tests and fixture helpers in src/knowledge/studio/ai-summary.test.ts
- [x] T003 [P] Inspect Studio cache directory/import behavior tests in src/knowledge/studio/data.test.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the stable cache identity boundary that all user stories depend on.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [x] T004 Add failing tests for stable identity helper excluding `updatedAt`, import root, temp directory, build time-like metadata, volatile edge metadata, API key, and stream mode in src/knowledge/studio/ai-summary.test.ts
- [x] T005 Add failing tests for deterministic sorting of selected node, one-hop nodes, incoming edges, and outgoing edges in src/knowledge/studio/ai-summary.test.ts
- [x] T006 Implement stable node, relationship topology, file content, and AI configuration identity construction in src/knowledge/studio/ai-summary.ts
- [x] T007 Replace current full prompt-input-derived cache key with the stable Summary Cache Identity payload in src/knowledge/studio/ai-summary.ts
- [x] T008 Ensure `inputHash` represents the stable cache identity payload rather than volatile prompt display fields in src/knowledge/studio/ai-summary.ts

**Checkpoint**: Stable identity primitives exist and can be tested before story-specific behavior.

---

## Phase 3: User Story 1 - Reuse summaries for unchanged nodes (Priority: P1) 🎯 MVP

**Goal**: Reopening a previously summarized unchanged node after browser refresh/re-import reuses cached AI Summary without a new AI request.

**Independent Test**: Generate a summary, re-run with an equivalent snapshot whose stable identity matches but volatile import/build fields differ, and assert the cache is hit with no fetch call.

### Tests for User Story 1

- [x] T009 [P] [US1] Add failing cache-hit test for unchanged selected node, one-hop nodes, topology, file hash, provider/baseUrl/model, and promptVersion in src/knowledge/studio/ai-summary.test.ts
- [x] T010 [P] [US1] Add failing cache-hit test proving changed `updatedAt` values do not change cache key in src/knowledge/studio/ai-summary.test.ts
- [x] T011 [P] [US1] Add failing cache-hit test proving different repoRoot/temp import location with identical file content does not change cache key in src/knowledge/studio/ai-summary.test.ts

### Implementation for User Story 1

- [x] T012 [US1] Reuse existing cached result when stable Summary Cache Identity matches in src/knowledge/studio/ai-summary.ts
- [x] T013 [US1] Keep file content hash repository-relative and independent of absolute repoRoot in src/knowledge/studio/ai-summary.ts
- [x] T014 [US1] Preserve persisted cache read/write behavior through JsonFileAiNodeSummaryCache in src/knowledge/studio/ai-summary.ts
- [x] T015 [US1] Run `bun test src/knowledge/studio/ai-summary.test.ts` for src/knowledge/studio/ai-summary.test.ts

**Checkpoint**: User Story 1 is fully functional and testable independently as the MVP.

---

## Phase 4: User Story 2 - Regenerate when relevant content changes (Priority: P2)

**Goal**: Any meaningful change to selected node identity, one-hop identity, topology, file content, provider endpoint, model, or prompt version invalidates the previous summary.

**Independent Test**: Mutate one stable identity input at a time and verify the next request misses the previous cache entry and generates a new cache key.

### Tests for User Story 2

- [x] T016 [P] [US2] Add failing invalidation tests for selected node hash and one-hop node hash changes in src/knowledge/studio/ai-summary.test.ts
- [x] T017 [P] [US2] Add failing invalidation tests for relationship direction/type changes and stable edge metadata exclusion in src/knowledge/studio/ai-summary.test.ts
- [x] T018 [P] [US2] Add failing invalidation tests for file content hash, provider base_url, provider id, model, and promptVersion changes in src/knowledge/studio/ai-summary.test.ts
- [x] T019 [P] [US2] Add failing no-reuse tests for missing selected node hash or missing one-hop node hash in src/knowledge/studio/ai-summary.test.ts

### Implementation for User Story 2

- [x] T020 [US2] Include selected node `id`, `type`, `path`, and `hash` in stable cache identity in src/knowledge/studio/ai-summary.ts
- [x] T021 [US2] Include one-hop node `id`, `type`, `path`, and `hash` in stable cache identity in src/knowledge/studio/ai-summary.ts
- [x] T022 [US2] Include incoming/outgoing connected node identities, direction, and relationship type while excluding edge metadata in src/knowledge/studio/ai-summary.ts
- [x] T023 [US2] Include file content hash, provider id, provider base_url, model, and promptVersion while excluding API key and stream mode in src/knowledge/studio/ai-summary.ts
- [x] T024 [US2] Prevent cache reuse when selected node or included one-hop node hash is missing in src/knowledge/studio/ai-summary.ts
- [x] T025 [US2] Run `bun test src/knowledge/studio/ai-summary.test.ts` for src/knowledge/studio/ai-summary.test.ts

**Checkpoint**: User Stories 1 and 2 both work independently and cache invalidation is stable-content based.

---

## Phase 5: User Story 3 - Explain cache reuse behavior (Priority: P3)

**Goal**: Users can tell whether the displayed AI Summary was reused from cache or newly generated.

**Independent Test**: Open cached and newly generated summary responses and verify user-facing state still distinguishes cached from generated results without inspecting logs.

### Tests for User Story 3

- [x] T026 [P] [US3] Add response-state assertions for cached versus generated AI Summary results in src/knowledge/studio/ai-summary.test.ts
- [x] T027 [P] [US3] Add or update UI/API state rendering assertions for cached/generated display behavior in src/knowledge/studio/data.test.ts

### Implementation for User Story 3

- [x] T028 [US3] Preserve `cached`, `generatedAt`, `apiRequestDurationMs`, `cacheKey`, and `inputHash` response semantics in src/knowledge/studio/ai-summary.ts
- [x] T029 [US3] Ensure server response continues forwarding AI Summary cached/generated metadata in src/knowledge/studio/server.ts
- [x] T030 [US3] Ensure Studio UI continues showing cached versus newly generated state in src/knowledge/studio/ui/src/main.tsx
- [x] T031 [US3] Run `bun test src/knowledge/studio/data.test.ts src/knowledge/studio/ai-summary.test.ts` for src/knowledge/studio/data.test.ts

**Checkpoint**: All user stories are independently functional and observable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and cleanup across the feature.

- [x] T032 [P] Run `bun run typecheck` for tsconfig.json
- [x] T033 [P] Run `bun run knowledge:studio:build` for vite.config.ts
- [x] T034 Run quickstart validation scenarios from specs/005-stable-summary-cache/quickstart.md
- [x] T035 Review final diff for secrets, runtime cache files, generated artifacts, and unrelated changes in specs/005-stable-summary-cache/tasks.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; MVP scope.
- **User Story 2 (Phase 4)**: Depends on Foundational and should be implemented after US1 to preserve cache-hit behavior while adding invalidation cases.
- **User Story 3 (Phase 5)**: Depends on Foundational; can proceed after US1 response semantics are stable.
- **Polish (Phase 6)**: Depends on selected story phases being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational; no dependency on US2/US3.
- **US2 (P2)**: Can start after Foundational; best executed after US1 to avoid changing cache identity twice.
- **US3 (P3)**: Can start after Foundational; may touch server/UI and should preserve US1/US2 result semantics.

### Within Each User Story

- Write failing tests first.
- Implement only the minimum code needed for that story.
- Run the story-specific validation command before moving to the next story.

### Parallel Opportunities

- T002 and T003 can run in parallel after T001 starts.
- US1 test tasks T009, T010, and T011 can run in parallel because they only add independent test cases in one test file and should be merged carefully.
- US2 test tasks T016, T017, T018, and T019 can run in parallel as separate test-case additions.
- US3 test tasks T026 and T027 can run in parallel because they target different test concerns.
- Final validation tasks T032 and T033 can run in parallel.

---

## Parallel Example: User Story 1

```powershell
# Independent test additions before implementation:
Task: "T009 [US1] Add failing cache-hit test for stable identity match in src/knowledge/studio/ai-summary.test.ts"
Task: "T010 [US1] Add failing cache-hit test for updatedAt exclusion in src/knowledge/studio/ai-summary.test.ts"
Task: "T011 [US1] Add failing cache-hit test for repoRoot/temp import exclusion in src/knowledge/studio/ai-summary.test.ts"
```

## Parallel Example: User Story 2

```powershell
# Independent invalidation test additions before implementation:
Task: "T016 [US2] Add selected/one-hop hash invalidation tests in src/knowledge/studio/ai-summary.test.ts"
Task: "T017 [US2] Add topology invalidation and edge metadata exclusion tests in src/knowledge/studio/ai-summary.test.ts"
Task: "T018 [US2] Add file and AI configuration invalidation tests in src/knowledge/studio/ai-summary.test.ts"
Task: "T019 [US2] Add missing hash no-reuse tests in src/knowledge/studio/ai-summary.test.ts"
```

## Parallel Example: User Story 3

```powershell
# Response and UI/API observability can be prepared separately:
Task: "T026 [US3] Add response-state assertions in src/knowledge/studio/ai-summary.test.ts"
Task: "T027 [US3] Add UI/API display-state assertions in src/knowledge/studio/data.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational stable identity helper and cache key boundary.
3. Complete Phase 3: User Story 1.
4. Stop and validate with `bun test src/knowledge/studio/ai-summary.test.ts`.

### Incremental Delivery

1. Stable identity foundation.
2. US1 cache reuse for unchanged imports.
3. US2 targeted invalidation and missing hash safety.
4. US3 cached/generated observability preservation.
5. Final typecheck and Studio build.

### Quality Gates

1. `bun test src/knowledge/studio/ai-summary.test.ts`
2. `bun test src/knowledge/studio/data.test.ts src/knowledge/studio/ai-summary.test.ts`
3. `bun run typecheck`
4. `bun run knowledge:studio:build`

## Notes

- Do not include `updatedAt`, import root, temp directory, build time, volatile edge metadata, API key, or stream mode in cache identity.
- Do not write real API keys or runtime cache files into the repository.
- Avoid `as any`, `@ts-ignore`, weakened assertions, or unrelated refactors.
