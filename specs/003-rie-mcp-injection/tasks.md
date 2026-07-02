# Tasks: RIE MCP Injection

**Input**: Design documents from `/specs/003-rie-mcp-injection/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included because the project constitution requires test-first delivery for feature work and the spec defines independent validation scenarios.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Each task includes exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared source definitions and test fixtures used by all stories.

- [x] T001 Add the canonical `rie` MCP source definition to `config/mcp.yaml`
- [x] T002 [P] Add shared RIE MCP fixture helpers in `src/knowledge/mcp/fixtures.test.ts`
- [x] T003 [P] Add shared isolated Codex home test helpers in `src/cli/codex-home-fixture.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core contracts, type surfaces, repository selection, and snapshot lifecycle behavior needed before any user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Add failing tests for repository selection defaults and explicit overrides in `src/knowledge/mcp/repository.test.ts`
- [x] T005 [P] Add failing tests for missing/stale snapshot lifecycle behavior in `src/knowledge/mcp/snapshot.test.ts`
- [x] T006 [P] Add failing tests for read-only source repository guarantees in `src/knowledge/mcp/tools.test.ts`
- [x] T007 Define repository selection types and safe path resolution in `src/knowledge/mcp/repository.ts`
- [x] T008 Implement snapshot status detection and load/build/refresh orchestration in `src/knowledge/mcp/snapshot.ts`
- [x] T009 Update RIE MCP tool result envelope types to include repository and snapshot metadata in `src/knowledge/mcp/types.ts`
- [x] T010 Update `createKnowledgeMcpTools` to use repository-aware snapshot loading in `src/knowledge/mcp/tools.ts`
- [x] T011 Export repository, snapshot, tool, and type modules from `src/knowledge/mcp/server.ts`

**Checkpoint**: Foundation ready - repository-aware, snapshot-aware, read-only RIE MCP core can now support user stories.

---

## Phase 3: User Story 1 - Use RIE from Codex sessions (Priority: P1) 🎯 MVP

**Goal**: Codex sessions can discover and use RIE MCP tools for the current session repository through generated user configuration.

**Independent Test**: Generate Codex configuration in dry-run or isolated `CODEX_HOME` and verify the `rie` MCP entry exists, points at the current source, and exposes at least seven RIE capabilities.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T012 [P] [US1] Add contract tests for generated `mcp_servers.rie` TOML in `src/config/builders/codex-rie-mcp.test.ts`
- [x] T013 [P] [US1] Add contract tests for RIE MCP tool discovery names in `src/knowledge/mcp/server.test.ts`
- [x] T014 [P] [US1] Add integration tests for isolated `CODEX_HOME` injection in `src/cli/rie-mcp-injection.test.ts`

### Implementation for User Story 1

- [x] T015 [US1] Extend Codex config generation assertions for stdio RIE MCP entries in `src/config/builders/codex.ts`
- [x] T016 [US1] Implement the stdio MCP entrypoint and tool registry in `src/knowledge/mcp/server.ts`
- [x] T017 [US1] Add stable RIE MCP tool names and descriptions in `src/knowledge/mcp/tools.ts`
- [x] T018 [US1] Include `rie` MCP server ids in generation and dry-run summaries in `src/cli/output.ts`
- [x] T019 [US1] Ensure generated runtime manifest records the `rie` MCP server id in `src/generate-user-config.ts`
- [x] T020 [US1] Verify US1 with isolated generation output documented in `specs/003-rie-mcp-injection/quickstart.md`

**Checkpoint**: User Story 1 is independently functional as MVP.

---

## Phase 4: User Story 2 - Keep injection safe, reproducible, and source-controlled (Priority: P2)

**Goal**: RIE MCP injection is defined in source configuration, reproducible across devices, preserves runtime safety rules, and never writes real secrets.

**Independent Test**: Inspect source config, run validation, and confirm generated output is reproducible without storing real API keys, tokens, cookies, private credentials, or machine-specific runtime artifacts.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T021 [P] [US2] Add validation tests for RIE MCP duplicate/conflicting server identity in `src/config/validation.test.ts`
- [x] T022 [P] [US2] Add schema tests for any RIE MCP enablement or local opt-out fields in `src/config/schema-spec.test.ts`
- [x] T023 [P] [US2] Add generation preservation tests for unrelated MCP server entries in `src/config/builders/codex-rie-mcp.test.ts`
- [x] T024 [P] [US2] Add secret-redaction regression tests for MCP diagnostics in `src/config/validators/mcp.test.ts`

### Implementation for User Story 2

- [x] T025 [US2] Extend MCP YAML schema source for any RIE enablement or opt-out metadata in `src/config/schema-spec.ts`
- [x] T026 [US2] Implement RIE MCP identity conflict and safe opt-out validation in `src/config/validators/mcp.ts`
- [x] T027 [US2] Update source config types for any RIE MCP metadata in `src/types/yaml.ts`
- [x] T028 [US2] Preserve unrelated MCP servers while generating the RIE registration in `src/config/builders/codex.ts`
- [x] T029 [US2] Add generated summary wording for enabled/disabled RIE injection in `src/cli/output.ts`
- [x] T030 [US2] Verify US2 source-first and secret-handling scenarios from `specs/003-rie-mcp-injection/contracts/codex-injection.md`

**Checkpoint**: User Story 2 is independently functional and safe.

---

## Phase 5: User Story 3 - Diagnose RIE MCP readiness (Priority: P3)

**Goal**: Users can run a repeatable readiness check that reports injection status, startup viability, target Codex directory, snapshot availability, and actionable recovery guidance.

**Independent Test**: Run repository validation or doctor flow and confirm RIE registration, startup readiness, target Codex directory, snapshot status, automatic build/refresh availability, and field-specific failures are reported.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T031 [P] [US3] Add readiness report unit tests for present/missing/disabled/conflict statuses in `src/knowledge/mcp/readiness.test.ts`
- [x] T032 [P] [US3] Add ai-doctor integration tests for RIE MCP readiness output in `src/cli/ai-doctor-rie-mcp.test.ts`
- [x] T033 [P] [US3] Add stale and missing snapshot readiness tests in `src/knowledge/mcp/snapshot.test.ts`

### Implementation for User Story 3

- [x] T034 [US3] Implement readiness report assembly in `src/knowledge/mcp/readiness.ts`
- [x] T035 [US3] Expose the `rie.readiness` MCP tool in `src/knowledge/mcp/tools.ts`
- [x] T036 [US3] Integrate RIE MCP readiness checks into `src/cli/ai-doctor.ts`
- [x] T037 [US3] Add field-specific recovery messages for invalid command/env/snapshot states in `src/knowledge/mcp/readiness.ts`
- [x] T038 [US3] Verify US3 readiness scenarios from `specs/003-rie-mcp-injection/quickstart.md`

**Checkpoint**: User Story 3 is independently functional and diagnostically useful.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, generated schema refresh, and cross-story hardening.

- [x] T039 [P] Regenerate YAML schemas after schema changes in `config/mcp.schema.json`
- [x] T040 [P] Update RIE MCP examples and validation notes in `specs/003-rie-mcp-injection/quickstart.md`
- [x] T041 Run targeted RIE MCP tests and record any required follow-up in `specs/003-rie-mcp-injection/tasks.md`
- [x] T042 Run `bun run format:check` and fix formatting issues in touched `src/**/*.ts` files
- [x] T043 Run `bun run lint` and fix lint issues in touched `src/**/*.ts` files
- [x] T044 Run `bun run typecheck` and fix type errors in touched `src/**/*.ts` files
- [x] T045 Run `bun run ai:check` and verify RIE MCP appears in `config/mcp.yaml` derived output
- [x] T046 Run `bun run knowledge:build -- --repo . --json` and `bun run knowledge:doctor -- --repo .` to verify RIE runtime health in `.rie`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; start immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; MVP scope.
- **User Story 2 (Phase 4)**: Depends on Foundational; can run after or in parallel with US1 once shared files are coordinated.
- **User Story 3 (Phase 5)**: Depends on Foundational; benefits from US1/US2 outputs but remains independently testable through readiness tests.
- **Polish (Phase 6)**: Depends on desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on US2/US3 after Foundational.
- **US2 (P2)**: No dependency on US1/US3 after Foundational, but tasks touching `src/config/builders/codex.ts` and `src/cli/output.ts` must be coordinated with US1.
- **US3 (P3)**: No dependency on US1/US2 after Foundational for unit-level readiness; full end-to-end readiness is strongest after US1 injection exists.

### Within Each User Story

- Tests MUST be written first and fail before implementation.
- Types/contracts before services/tool registry changes.
- Tool registry changes before generation/readiness integration.
- Story checkpoint validation before moving to the next priority story.

## Parallel Opportunities

- T002 and T003 can run in parallel after T001 is understood.
- T004, T005, and T006 can run in parallel because they create tests in different files.
- T012, T013, and T014 can run in parallel for US1 tests.
- T021, T022, T023, and T024 can run in parallel for US2 tests.
- T031, T032, and T033 can run in parallel for US3 tests.
- T039 and T040 can run in parallel during polish.

## Parallel Example: User Story 1

```bash
Task: "T012 [US1] Add contract tests for generated mcp_servers.rie TOML in src/config/builders/codex-rie-mcp.test.ts"
Task: "T013 [US1] Add contract tests for RIE MCP tool discovery names in src/knowledge/mcp/server.test.ts"
Task: "T014 [US1] Add integration tests for isolated CODEX_HOME injection in src/cli/rie-mcp-injection.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "T021 [US2] Add validation tests for RIE MCP duplicate/conflicting server identity in src/config/validation.test.ts"
Task: "T022 [US2] Add schema tests for any RIE MCP enablement or local opt-out fields in src/config/schema-spec.test.ts"
Task: "T024 [US2] Add secret-redaction regression tests for MCP diagnostics in src/config/validators/mcp.test.ts"
```

## Parallel Example: User Story 3

```bash
Task: "T031 [US3] Add readiness report unit tests for present/missing/disabled/conflict statuses in src/knowledge/mcp/readiness.test.ts"
Task: "T032 [US3] Add ai-doctor integration tests for RIE MCP readiness output in src/cli/ai-doctor-rie-mcp.test.ts"
Task: "T033 [US3] Add stale and missing snapshot readiness tests in src/knowledge/mcp/snapshot.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup.
2. Complete Phase 2 foundational repository/snapshot/tool envelope work.
3. Complete Phase 3 US1 injection and MCP discovery.
4. Stop and validate isolated Codex generation plus MCP tool discovery.

### Incremental Delivery

1. Setup + Foundational → repository-aware MCP core ready.
2. US1 → Codex can discover and use RIE MCP tools.
3. US2 → injection is hardened for source-first, reproducible, secret-safe behavior.
4. US3 → readiness diagnostics make support and failure recovery actionable.
5. Polish → schema refresh and full validation commands.

### Validation Commands

```sh
bun test src/knowledge/mcp
bun test src/config src/cli
bun run format:check
bun run lint
bun run typecheck
bun run ai:check
bun run knowledge:build -- --repo . --json
bun run knowledge:doctor -- --repo .
```

## Notes

- Do not introduce new dependencies unless an implementation task proves the existing Bun/TypeScript stdio approach cannot satisfy the MCP contract.
- Do not write real secrets into `config/mcp.yaml`, tests, generated examples, diagnostics, or specs.
- Do not edit generated Codex user files as a durable fix; change source configuration and generator code.
- Keep MCP tool operations read-only for source repository files; only `.rie` snapshots/caches may be written.
