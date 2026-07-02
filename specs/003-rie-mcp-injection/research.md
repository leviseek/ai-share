# Research: RIE MCP Injection

## Decision: Reuse the existing ai-share generator path for injection

**Rationale**: The repository already treats `config/*.yaml` as source and `CODEX_HOME/config.toml` as generated output. `config/mcp.yaml` is already parsed, validated, converted to Codex MCP TOML, and included in check/generation summaries. Extending that path keeps source-first configuration and avoids manual runtime edits.

**Alternatives considered**:

- Separate installer script: rejected because it creates a second durable configuration path and increases drift risk.
- Manual Codex config edits: rejected by constitution because generated user files are runtime artifacts.
- Runtime self-registration by the MCP server: rejected because it would write generated config outside the existing generator flow.

## Decision: Implement RIE MCP as local stdio by default

**Rationale**: The feature is local-first, needs no network service, and Codex MCP entries already support stdio command/args. Stdio avoids ports, authentication, daemon lifecycle, and cross-device network differences.

**Alternatives considered**:

- HTTP MCP server: rejected for v1 because it introduces local port management and auth/security surface without user value.
- Remote hosted service: rejected because RIE operates on local repository snapshots and must not require remote persistence.

## Decision: Resolve repository target from the current Codex session by default

**Rationale**: A globally injected Codex tool should be useful from any project. The clarified spec requires current session repository by default plus explicit path override. This keeps `ai-share` from being hard-coded as the only repository and matches Codex multi-project workflows.

**Alternatives considered**:

- Always serve ai-share: rejected because global injection would be misleading outside this repo.
- Require pre-registered repositories: rejected for v1 because it adds management overhead and prevents first-use flow.

## Decision: Automatically build missing snapshots; prompt/allow refresh for stale snapshots

**Rationale**: Existing CLI `loadOrBuild()` already auto-builds missing snapshots, making this a natural extension. Stale refresh should be visible because rebuilding can cost time and writes local `.rie` state.

**Alternatives considered**:

- Never build automatically: rejected because first-use MCP calls would fail too often.
- Always rebuild on every call: rejected because it is slower and can make simple reads expensive.

## Decision: Keep MCP source-repository behavior read-only

**Rationale**: RIE provides repository intelligence, not source modification. Read-only tool semantics reduce security risk and make tool invocation safe during planning/debugging. Writes are limited to `.rie` runtime snapshots/caches.

**Alternatives considered**:

- Allow source edits after confirmation: rejected because code editing belongs to Codex file tools, not RIE intelligence tools.
- Allow config edits from MCP: rejected because durable config changes must go through source files and generator workflow.

## Decision: Extend validation and summaries instead of adding a new readiness subsystem

**Rationale**: Existing `ai:check`, `ai:dry-run`, `ai:doctor`, `printCheckSummary()`, and RIE `doctor` are the current operational surfaces. Enhancing them preserves existing user workflows and makes tests straightforward.

**Alternatives considered**:

- Add a separate `rie:mcp:doctor` command immediately: deferred unless tasks reveal existing commands cannot express readiness clearly.
- Validate only at runtime: rejected because malformed source config should fail before generating Codex config.

## Decision: No new dependencies for MCP planning phase

**Rationale**: The user asked to keep current stack/architecture. The current code already has a synchronous RIE tool abstraction and generator path. If implementation later needs a protocol adapter, it should first prefer Bun/Node stdio and small internal glue; dependency introduction would require a separate justification.

**Alternatives considered**:

- Introduce a full MCP SDK dependency now: rejected at planning because it expands supply-chain surface before task-level necessity is proven.
