# Data Model: RIE MCP Injection

## RIE Tool Server

Represents the local bridge that exposes repository intelligence to Codex through MCP.

**Fields**:

- `id`: Stable server id used in generated Codex MCP registration. Must be unique among configured MCP servers.
- `transport`: `stdio` for v1.
- `command`: Local executable command used by Codex to start the server.
- `args`: Command arguments that start the RIE MCP server entrypoint.
- `env`: Optional environment placeholders. Sensitive values must use `${ENV_NAME}` references.
- `capabilities`: Stable list of RIE tools exposed to Codex.
- `sourceReadOnly`: Must be `true` for source repository files.

**Relationships**:

- Is defined by one `Source Tool Definition`.
- Is materialized as one `Injected Codex Registration` per generated Codex user config.
- Reads one selected `Repository Knowledge Snapshot` at a time.

**Validation rules**:

- Server id must not collide with unrelated MCP server ids.
- Stdio server requires a non-empty command and valid string args.
- Sensitive env keys cannot contain literal secrets.
- Source repository write permissions are not exposed.

## Source Tool Definition

Represents source-controlled configuration that describes how the RIE MCP server should be generated.

**Fields**:

- `serverId`: Canonical MCP server id.
- `enabled`: Shared default, with local opt-out allowed through existing overlay/runtime mechanisms.
- `transport`: `stdio` for v1.
- `commandTemplate`: Source-level command path or executable reference.
- `argsTemplate`: Source-level args for starting the server.
- `envPlaceholders`: Optional env placeholders only.

**Relationships**:

- Produces `Injected Codex Registration` through the ai-share generator.
- Is validated by schema and consistency checks.

**Validation rules**:

- Must be reproducible from source.
- Must not contain machine-specific absolute Codex user directory values.
- Must not contain real API keys, tokens, cookies, or private credentials.

## Injected Codex Registration

Represents the generated Codex user config entry that lets Codex discover and start RIE MCP.

**Fields**:

- `serverId`: Matches the source tool definition.
- `command`: Generated command.
- `args`: Generated args.
- `env`: Generated env map with placeholders only.
- `targetPath`: Resolved generated Codex config path.
- `generatedAt`: Generation event time if present in runtime manifest or logs.

**Relationships**:

- Is written under one `Injection Target`.
- Is derived from one `Source Tool Definition`.
- Starts one `RIE Tool Server` when Codex uses it.

**Validation rules**:

- Exactly one RIE registration should exist in generated output.
- Refresh must not remove unrelated MCP server entries.
- Existing preservation behavior applies unless forced generation is requested.

## Injection Target

Represents the Codex user directory affected by generation on the current device.

**Fields**:

- `codexHome`: Resolved Codex user directory.
- `configPath`: Generated Codex config file path.
- `envPath`: Generated Codex `.env` path.
- `runtimeManifestPath`: Generated ai-share runtime manifest path.
- `resolutionSource`: `CODEX_HOME` or home-directory default.

**Relationships**:

- Contains generated `Injected Codex Registration`.
- Is reported by dry-run, generation, and readiness output.

**Validation rules**:

- Must be created by generation if missing.
- Must not be persisted into source configuration as a machine-specific path.

## Repository Selection

Represents how RIE decides which repository to serve for a request.

**Fields**:

- `defaultRepoRoot`: Current Codex session repository.
- `overrideRepoRoot`: Optional explicit path supplied by user/tool request.
- `effectiveRepoRoot`: Override path when provided, otherwise default path.
- `selectionReason`: `session-default` or `explicit-override`.

**Relationships**:

- Selects one `Repository Knowledge Snapshot`.
- Is included in readiness diagnostics when useful.

**Validation rules**:

- Effective repo root must resolve to a safe local directory.
- Snapshot metadata must match the effective repo root or trigger rebuild/recovery behavior.

## Repository Knowledge Snapshot

Represents local RIE state for the selected repository.

**Fields**:

- `repoRoot`: Repository root stored in snapshot metadata.
- `storeDir`: Local store directory, `.rie` by default.
- `buildHash`: Snapshot hash.
- `schemaVersion`: Snapshot schema version.
- `builtAt`: Build timestamp.
- `objectCount`, `edgeCount`, `diagnosticCount`: Summary counts.
- `status`: `missing`, `current`, `stale`, `empty`, or `mismatched`.

**Relationships**:

- Is built from one repository selection.
- Is read by RIE MCP tools.
- Is summarized by `Readiness Report`.

**State transitions**:

- `missing` → `current`: automatic build succeeds.
- `missing` → `empty`: automatic build succeeds but finds no useful knowledge.
- `current` → `stale`: repository inputs change after snapshot.
- `stale` → `current`: user accepts automatic refresh and rebuild succeeds.
- `mismatched` → `current`: correct repository is selected or snapshot is rebuilt.

**Validation rules**:

- Missing snapshots should auto-build.
- Stale snapshots should prompt and allow refresh.
- Empty or mismatched snapshots must produce actionable diagnostics.
- Snapshot/caches may be written; source repository files must not be modified.

## Readiness Report

Represents diagnostic output for injection and runtime usability.

**Fields**:

- `injectionStatus`: `present`, `missing`, `disabled`, or `conflict`.
- `targetCodexHome`: Resolved target user directory.
- `serverStartup`: `ready`, `invalid-command`, `invalid-env`, or `unknown`.
- `snapshotStatus`: Snapshot status from `Repository Knowledge Snapshot`.
- `capabilityCount`: Number of exposed RIE MCP tools.
- `recoveryActions`: Ordered user-readable actions.
- `safe`: Whether no secret-like values were exposed.

**Relationships**:

- Summarizes `Injected Codex Registration`, `Injection Target`, `RIE Tool Server`, and `Repository Knowledge Snapshot`.

**Validation rules**:

- Must include field-specific errors for malformed config.
- Must not print real secrets or sensitive values.
- Must identify automatic build or refresh availability.
