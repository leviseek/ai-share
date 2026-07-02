# Tasks: RIE Repository Browser Search

**Input**: Design documents from `/specs/004-rie-browser-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/repository-browser-search.md, quickstart.md

**Tests**: Included because the project constitution requires test-first delivery for feature work, and the quickstart defines targeted Studio search tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing RIE Studio touchpoints and prepare for test-first implementation without changing stack or dependencies.

- [x] T001 Review existing repository tree rendering and copy keys in src/knowledge/studio/ui/src/main.tsx
- [x] T002 Review existing Studio API routing and active repository/import handling in src/knowledge/studio/server.ts
- [x] T003 Review existing repository tree data helpers and test fixtures in src/knowledge/studio/data.ts and src/knowledge/studio/data.test.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared search contracts and helper seams that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Add `RepositorySearchQuery`, `RepositorySearchResultFile`, `RepositorySearchResponse`, and search match types in src/knowledge/studio/data.ts
- [x] T005 Add reusable test fixtures for nested repository trees and searchable files in src/knowledge/studio/data.test.ts
- [x] T006 Add `/api/repository/search` route dispatch and query parsing scaffold in src/knowledge/studio/server.ts
- [x] T007 Add repository search UI copy keys for zh-CN/en-US labels, placeholders, statuses, and match badges in src/knowledge/studio/ui/src/main.tsx

**Checkpoint**: Shared search types, route seam, fixtures, and UI copy are available for all story work.

---

## Phase 3: User Story 1 - Regex search files by name (Priority: P1) 🎯 MVP

**Goal**: Users can type a regex into a search bar above the repository tree and see matching files with parent directory context.

**Independent Test**: Open a repository tree, enter a valid regex matching known file names/paths, confirm matching files render with ancestors, no duplicate files appear, and clearing search restores the full tree.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation.**

- [x] T008 [P] [US1] Add tests for valid name/path regex filtering with preserved parent directories in src/knowledge/studio/data.test.ts
- [x] T009 [P] [US1] Add tests for empty query restoring the unfiltered repository tree in src/knowledge/studio/data.test.ts
- [x] T010 [P] [US1] Add tests for no-result name regex output and stable tree sorting in src/knowledge/studio/data.test.ts

### Implementation for User Story 1

- [x] T011 [US1] Implement regex query parsing and name/path tree filtering helpers in src/knowledge/studio/data.ts
- [x] T012 [US1] Implement name/path search response creation for `/api/repository/search` in src/knowledge/studio/server.ts
- [x] T013 [US1] Add repository search input above `RepositoryExplorer` and wire automatic name-search loading state in src/knowledge/studio/ui/src/main.tsx
- [x] T014 [US1] Update `RepositoryExplorer`/`TreeBranch` rendering to support filtered trees and match badges in src/knowledge/studio/ui/src/main.tsx
- [x] T015 [US1] Add search input, filtered tree, no-results, and match badge styling in src/knowledge/studio/ui/src/styles.css
- [x] T016 [US1] Run `bun test src/knowledge/studio/data.test.ts` and record US1 result in specs/004-rie-browser-search/quickstart.md if validation notes change

**Checkpoint**: User Story 1 is independently functional and testable as the MVP.

---

## Phase 4: User Story 2 - Find files by content containing the search text (Priority: P2)

**Goal**: Files whose names do not match but whose text contents literally contain the query appear once as content matches.

**Independent Test**: Use a repository where a known literal string appears in a file whose name does not match the query; confirm it appears with a `content` badge, while files matching both name and content appear once with `both`.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation.**

- [x] T017 [P] [US2] Add tests for literal content containment matching when file name does not match in src/knowledge/studio/data.test.ts
- [x] T018 [P] [US2] Add tests for deduplicating name+content matches into `both` classification in src/knowledge/studio/data.test.ts
- [x] T019 [P] [US2] Add tests for skipping binary/unreadable or out-of-scope files without failing search in src/knowledge/studio/data.test.ts

### Implementation for User Story 2

- [x] T020 [US2] Implement content-match merge helpers and `name`/`content`/`both` result classification in src/knowledge/studio/data.ts
- [x] T021 [US2] Implement safe text file content reads for active repo/import scope in src/knowledge/studio/server.ts
- [x] T022 [US2] Integrate literal content search into `/api/repository/search` response with skipped-file reporting in src/knowledge/studio/server.ts
- [x] T023 [US2] Render `content` and `both` match badges without snippets or line numbers in src/knowledge/studio/ui/src/main.tsx
- [x] T024 [US2] Add visual styles for `name`, `content`, and `both` badges in src/knowledge/studio/ui/src/styles.css
- [x] T025 [US2] Run `bun test src/knowledge/studio/data.test.ts` and verify content-search scenarios from specs/004-rie-browser-search/quickstart.md

**Checkpoint**: User Stories 1 and 2 both work independently with one search bar.

---

## Phase 5: User Story 3 - Handle invalid and changing queries gracefully (Priority: P3)

**Goal**: Invalid regex and rapid query changes do not interrupt browsing, clear input, or show stale results.

**Independent Test**: Enter malformed regex such as `[`, edit it into a valid query, then type rapidly across multiple values and confirm only the final query's results are displayed.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation.**

- [x] T026 [P] [US3] Add tests for invalid regex status and error response in src/knowledge/studio/data.test.ts
- [x] T027 [P] [US3] Add tests for current-query identity or stale-result prevention helper behavior in src/knowledge/studio/data.test.ts
- [x] T028 [P] [US3] Add tests for no-results versus invalid-query state distinction in src/knowledge/studio/data.test.ts

### Implementation for User Story 3

- [x] T029 [US3] Implement invalid regex normalization and no-results state helpers in src/knowledge/studio/data.ts
- [x] T030 [US3] Return invalid-query responses without reading file contents in src/knowledge/studio/server.ts
- [x] T031 [US3] Add stale response protection for automatic search requests in src/knowledge/studio/ui/src/main.tsx
- [x] T032 [US3] Render invalid-query, loading, no-results, skipped-file, and restored-tree states in src/knowledge/studio/ui/src/main.tsx
- [x] T033 [US3] Add UI styles for invalid-query, loading, no-results, and skipped-file states in src/knowledge/studio/ui/src/styles.css
- [x] T034 [US3] Run `bun test src/knowledge/studio/data.test.ts` and verify invalid/rapid-query scenarios from specs/004-rie-browser-search/quickstart.md

**Checkpoint**: All user stories are independently functional and user-visible edge cases are handled.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, docs consistency, and build confidence across all stories.

- [x] T035 [P] Verify the HTTP/UI contract examples remain consistent with implementation in specs/004-rie-browser-search/contracts/repository-browser-search.md
- [x] T036 [P] Verify quickstart commands and expected outcomes remain accurate in specs/004-rie-browser-search/quickstart.md
- [x] T037 Run `bun run knowledge:studio:build` to validate the Studio UI build for src/knowledge/studio/ui/src/main.tsx and src/knowledge/studio/ui/src/styles.css
- [x] T038 Run `bun run typecheck` to validate strict TypeScript across src/knowledge/studio/data.ts, src/knowledge/studio/server.ts, and src/knowledge/studio/ui/src/main.tsx
- [x] T039 Run `bun run lint` to validate lint rules across src/knowledge/studio/data.ts, src/knowledge/studio/server.ts, and src/knowledge/studio/ui/src/main.tsx
- [x] T040 Run `bun run ai:check` to confirm generated Codex config validation remains unaffected by specs/004-rie-browser-search/plan.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; delivers MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational and can be developed after or alongside US1, but full one-search-bar demo benefits from US1 UI.
- **User Story 3 (Phase 5)**: Depends on Foundational and can be developed after US1 route/UI exists.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories after Foundational; MVP scope.
- **US2 (P2)**: Uses shared search endpoint/UI from US1 for full UX, but data/server content matching is testable independently.
- **US3 (P3)**: Uses shared query parsing and UI request flow; can be tested independently with invalid/stale query fixtures.

### Within Each User Story

- Tests must be written first and fail before implementation.
- Data helpers before server endpoint behavior.
- Server response before UI integration when the UI depends on endpoint shape.
- Styling after UI states/classes exist.
- Story-specific validation command before checkpoint.

### Parallel Opportunities

- T001, T002, T003 can be performed by separate readers if needed.
- T008, T009, T010 can be written in parallel within `data.test.ts` only if coordinated to avoid overlapping fixture edits.
- T017, T018, T019 can be written in parallel within `data.test.ts` only if coordinated to avoid overlapping fixture edits.
- T026, T027, T028 can be written in parallel within `data.test.ts` only if coordinated to avoid overlapping fixture edits.
- T035 and T036 can run in parallel during polish because they touch different documentation files.

---

## Parallel Example: User Story 1

```text
Task: "T008 [US1] Add tests for valid name/path regex filtering with preserved parent directories in src/knowledge/studio/data.test.ts"
Task: "T009 [US1] Add tests for empty query restoring the unfiltered repository tree in src/knowledge/studio/data.test.ts"
Task: "T010 [US1] Add tests for no-result name regex output and stable tree sorting in src/knowledge/studio/data.test.ts"
```

## Parallel Example: User Story 2

```text
Task: "T017 [US2] Add tests for literal content containment matching when file name does not match in src/knowledge/studio/data.test.ts"
Task: "T018 [US2] Add tests for deduplicating name+content matches into both classification in src/knowledge/studio/data.test.ts"
Task: "T019 [US2] Add tests for skipping binary/unreadable or out-of-scope files without failing search in src/knowledge/studio/data.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "T026 [US3] Add tests for invalid regex status and error response in src/knowledge/studio/data.test.ts"
Task: "T027 [US3] Add tests for current-query identity or stale-result prevention helper behavior in src/knowledge/studio/data.test.ts"
Task: "T028 [US3] Add tests for no-results versus invalid-query state distinction in src/knowledge/studio/data.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate with `bun test src/knowledge/studio/data.test.ts` plus a manual Studio name-search check.

### Incremental Delivery

1. Add US1 name/path regex search and validate independently.
2. Add US2 literal content matching and match-type badges without snippets.
3. Add US3 invalid/stale query handling.
4. Run polish verification commands before delivery.

### Parallel Team Strategy

1. One person prepares data/server foundations while another reviews UI touchpoints.
2. After Foundational, tests for US1/US2/US3 can be drafted in parallel with coordination in `src/knowledge/studio/data.test.ts`.
3. Implementation should merge story-by-story in priority order to preserve a working MVP.

---

## Notes

- All tasks preserve existing Bun + strict TypeScript + React/Vite + RIE Studio architecture.
- No task introduces a new dependency, database, service, or generated-runtime source edit.
- Generated `src/knowledge/studio/public/dist/*` remains build output and should not be hand-edited.
- Use existing Chinese user-facing error/copy style in Studio UI where applicable.
