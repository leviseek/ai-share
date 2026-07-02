# Feature Specification: RIE MCP Injection

**Feature Branch**: `003-rie-mcp-injection`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "增强rie，实现mcp，并且支持自动注入到codex用户目录下"

## Clarifications

### Session 2026-07-02

- Q: Which repository should the globally injected RIE MCP serve by default? → A: Default to the current Codex session repository, with an explicit repository path override available.
- Q: How should RIE MCP behave when the repository knowledge snapshot is missing or stale? → A: Automatically build when missing; prompt and allow automatic refresh when stale.
- Q: What write permissions should RIE MCP tools have? → A: Read-only for source repositories; writes limited to local RIE snapshots and caches.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Use RIE from Codex sessions (Priority: P1)

Codex users need RIE capabilities to be available inside ordinary Codex sessions without manually copying configuration into the user directory, so repository search, graph inspection, context assembly, impact analysis, and explanations can be requested as live tools for the current Codex session repository while coding.

**Why this priority**: The main value of RIE is to make repository intelligence available at the point where the user asks Codex to plan, debug, review, or implement changes.

**Independent Test**: Generate the user-level Codex configuration in a dry-run or isolated target directory and verify that the RIE tool entry is present, points at the current repository source, and can be discovered by a Codex-compatible MCP client.

**Acceptance Scenarios**:

1. **Given** a user has a valid ai-share checkout, **When** they run the standard configuration generation flow, **Then** the generated Codex user configuration includes an enabled RIE tool server entry by default.
2. **Given** the generated Codex configuration includes RIE, **When** Codex starts a session from any project, **Then** the user can request repository search, context, graph, impact, and explanation capabilities for that session repository through the injected tool server.
3. **Given** the user performs a dry-run generation, **When** the output summary is shown, **Then** it clearly reports whether the RIE tool server would be injected and which user-level target directory would receive it.

---

### User Story 2 - Keep injection safe, reproducible, and source-controlled (Priority: P2)

Maintainers need the RIE tool server registration to be defined in source configuration and generated into the Codex user directory, rather than manually edited in runtime files, so every device can reproduce the same setup while keeping local secrets out of the repository.

**Why this priority**: ai-share treats generated user files as runtime artifacts; source-controlled injection prevents drift and protects env-only secret handling.

**Independent Test**: Inspect source configuration, run validation, and confirm that generated output can be recreated without storing real API keys, tokens, cookies, private credentials, or machine-specific runtime artifacts.

**Acceptance Scenarios**:

1. **Given** a fresh device with ai-share source files, **When** the user runs the standard generation command, **Then** the Codex user directory receives the RIE tool server registration from source configuration.
2. **Given** an existing Codex user configuration already exists, **When** generation runs without explicit overwrite permission, **Then** existing preservation rules remain visible and the user is told how to refresh safely.
3. **Given** a configured environment contains secrets or local-only values, **When** the RIE tool server entry is generated, **Then** no real secret values are written to source specs, source configuration, or generated examples.

---

### User Story 3 - Diagnose RIE MCP readiness (Priority: P3)

Users and maintainers need a repeatable readiness check that explains whether the injected RIE tool server can start and serve useful repository intelligence, so configuration mistakes are caught before a Codex session depends on it.

**Why this priority**: Injection alone is insufficient if the tool server cannot start, cannot locate a repository snapshot, or exposes stale/empty knowledge without clear diagnostics.

**Independent Test**: Run the repository validation or doctor flow and verify that it reports RIE tool server registration, startup readiness, target Codex directory, snapshot availability, and actionable failure messages.

**Acceptance Scenarios**:

1. **Given** the user runs the diagnostic flow after generation, **When** RIE tool server registration is valid, **Then** the report marks the injection as ready and includes the target Codex user directory.
2. **Given** the RIE snapshot is missing or stale, **When** diagnostics run, **Then** the report explains how to build or refresh repository knowledge before using the tools.
3. **Given** the configured command, working directory, or environment is invalid, **When** readiness is checked, **Then** the user receives a specific error that identifies the broken field and suggested recovery action.

### Edge Cases

- The Codex user directory does not exist yet and must be created by the generation flow.
- An existing generated configuration is missing the RIE server because it was created before this feature.
- The target user directory is customized by environment while source files must not persist that path.
- The RIE source checkout is moved or renamed after injection, causing the generated command path to become stale.
- The repository has not been indexed, the local snapshot is empty, or the snapshot belongs to a different repository.
- The RIE tool server is disabled or omitted intentionally for a device or local workflow.
- Multiple MCP/tool server entries exist and RIE must not overwrite unrelated entries.
- Runtime startup failures must not expose real secrets, tokens, cookies, or private credentials in logs or generated files.
- MCP tool requests must not modify source repository files; only local RIE runtime snapshots and caches may be written.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a user-facing RIE tool server that exposes repository search, context assembly, graph retrieval, neighbor inspection, impact analysis, object explanation, and graph export capabilities for the current Codex session repository by default.
- **FR-002**: System MUST register the RIE tool server through source-controlled ai-share configuration that can be regenerated into the Codex user directory.
- **FR-003**: Users MUST be able to inject the RIE tool server into the Codex user directory through the standard ai-share generation flow without hand-editing runtime Codex files.
- **FR-004**: System MUST include the RIE tool server in dry-run output and generation summaries, including whether it is enabled and which user-level target directory is affected.
- **FR-005**: System MUST preserve existing runtime configuration safety behavior, including no overwrite of existing user configuration unless the user explicitly requests a refresh mode already supported by the generation workflow.
- **FR-006**: System MUST keep all durable injection settings in source files or templates, while keeping generated Codex files, local snapshots, caches, and runtime manifests out of source control unless explicitly defined as templates.
- **FR-007**: System MUST NOT write real API keys, tokens, cookies, passwords, private credentials, or secret-like values into source configuration, generated examples, specs, diagnostics, or runtime injection metadata.
- **FR-008**: System MUST validate RIE tool server configuration and report malformed command, arguments, environment placeholders, target directory, or conflicting server identity with actionable messages.
- **FR-009**: System MUST support an intentional opt-out or local override path so a device can avoid injecting RIE without deleting shared source definitions.
- **FR-010**: System MUST avoid overwriting or removing unrelated MCP/tool server entries when adding or refreshing the RIE tool server registration.
- **FR-011**: System MUST provide a readiness check that reports injection status, target Codex user directory, server startup viability, repository snapshot availability, automatic build or refresh availability, and recovery guidance.
- **FR-012**: System MUST automatically build repository knowledge when the selected repository has no snapshot, MUST prompt and allow automatic refresh when the snapshot is stale, and MUST fail gracefully when RIE knowledge is empty or tied to a different repository. Users MUST be able to override the default repository path explicitly when the current Codex session repository is not the desired target.
- **FR-013**: System MUST expose stable tool names, descriptions, input expectations, and output summaries so Codex users can understand what each RIE capability is for.
- **FR-014**: System MUST keep RIE tool behavior local by default and MUST NOT require a network service or remote persistence to provide repository intelligence.
- **FR-015**: System MUST keep RIE MCP tools read-only with respect to source repository files, allowing writes only to local RIE runtime snapshots and caches needed for indexing and diagnostics.

### Key Entities

- **RIE Tool Server**: The local user-facing bridge that makes repository intelligence capabilities available to Codex sessions without granting source-file write capabilities.
- **Injected Codex Registration**: The generated user-level configuration entry that allows Codex to discover and start the RIE tool server.
- **Source Tool Definition**: The source-controlled ai-share setting or template that defines how RIE should appear in generated Codex configuration.
- **Injection Target**: The resolved Codex user directory that receives generated runtime configuration for the current device.
- **Readiness Report**: A diagnostic result covering registration presence, startup viability, snapshot status, validation errors, and recovery guidance.
- **Repository Knowledge Snapshot**: The local RIE snapshot for the current Codex session repository, or an explicitly selected repository path, used by the tool server to answer repository search, graph, context, and impact requests; this is the allowed local write target for indexing state.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A standard dry-run generation on the current repository reports the RIE tool server as included in the generated Codex configuration.
- **SC-002**: A standard forced generation into an isolated Codex user directory produces exactly one RIE tool server registration and does not remove unrelated tool server entries.
- **SC-003**: 100% of RIE tool server registration values in source configuration are reproducible from source and contain no real secret values.
- **SC-004**: A readiness check on a correctly configured current repository reports injection status, startup readiness, snapshot status, automatic build or refresh availability, and target user directory in one command output.
- **SC-005**: When the repository snapshot is missing, the readiness check can trigger or describe automatic build behavior and returns a user-readable recovery instruction instead of a silent failure or stack trace.
- **SC-006**: Codex-compatible MCP client discovery lists the RIE tool server and at least seven RIE capabilities after injection.
- **SC-007**: Users can complete first-time RIE injection and readiness verification in under 5 minutes on a clean device with dependencies already installed.
- **SC-008**: Validation rejects malformed or unsafe RIE tool server configuration with field-specific messages in 100% of covered invalid cases.
- **SC-009**: 100% of MCP tool operations leave source repository files unchanged except for local RIE runtime snapshots and caches.

## Assumptions

- The feature enhances the existing RIE knowledge engine and ai-share Codex generation flow rather than creating a separate standalone installer.
- MCP is the intended Codex tool-server integration mechanism for this feature.
- The RIE tool server runs locally and uses the current Codex session repository snapshot by default, with an explicit repository path override for cross-repository use. Missing snapshots should be built automatically; stale snapshots should require a visible refresh choice. MCP tools are read-only for source repository files.
- The existing `config/*.yaml` source-first model remains the authority for generated Codex configuration.
- The existing `CODEX_HOME` resolution and force/dry-run behavior remain the default injection pathway.
- Device-specific opt-out or path customization should be handled through existing local override patterns or environment-controlled runtime behavior, not by committing machine-specific paths.
