# Quickstart: RIE MCP Injection Validation

## Prerequisites

- Dependencies installed with `bun install`.
- Run from the ai-share repository root.
- Real API keys remain in environment variables only; do not add secrets to source files.
- For isolated generation checks, set `CODEX_HOME` to a temporary directory before running generation commands.

## 1. Validate source configuration

```sh
bun run ai:check
```

Expected outcomes:

- Config validation passes.
- Output lists configured MCP server ids and includes `rie` when the feature is implemented/enabled.
- Output reports the resolved Codex home.
- No real secret values are printed.

## 2. Dry-run Codex injection

```sh
bun run ai:dry-run
```

Expected outcomes:

- Dry-run reports that Codex config would include the RIE MCP server.
- Dry-run reports the target `CODEX_HOME/config.toml` path.
- Existing no-overwrite behavior is described.

## 3. Generate into an isolated Codex user directory

PowerShell example:

```powershell
$env:CODEX_HOME = Join-Path $PWD '.tmp-codex-home'
bun run ai:gen -- --force
```

Expected outcomes:

- Generated `config.toml` contains exactly one `[mcp_servers.rie]` entry.
- Unrelated source-defined MCP entries, if any, remain present.
- Generated files are under the isolated Codex home, not committed source paths.

## 4. Build or refresh repository knowledge

```sh
bun run knowledge:build -- --repo . --json
bun run knowledge:doctor -- --repo .
```

Expected outcomes:

- Build writes local `.rie` runtime state.
- Doctor reports repository snapshot health.
- Source repository files are unchanged except local `.rie` snapshots/caches.

## 5. Verify MCP tool capability contract

Use the contract in [contracts/mcp-tools.md](./contracts/mcp-tools.md) to validate the MCP entrypoint once implemented.

Minimum expected capabilities:

- `rie.search`
- `rie.context`
- `rie.graph`
- `rie.neighbors`
- `rie.impact`
- `rie.explain`
- `rie.context_quality`
- `rie.graph_export`
- `rie.readiness`

Expected outcomes:

- Tool discovery lists at least seven RIE capabilities.
- Default repository is the current Codex session repository.
- Explicit repository path override works for a valid local repo.
- Missing snapshots are built automatically.
- Stale snapshots expose a visible refresh choice.
- Tool calls do not modify source repository files.

## 6. Negative validation scenarios

Create temporary invalid source configuration in a test fixture or unit test, not in committed `config/mcp.yaml`.

Expected covered failures:

- Missing stdio command.
- Invalid args item.
- Sensitive env literal such as `TOKEN: plain-token`.
- Secret-like env value.
- Conflicting HTTP/stdio fields.
- Duplicate/conflicting RIE server identity.

Expected outcomes:

- Validation returns field-specific Chinese error messages.
- No generated examples or diagnostics contain real secrets.

## 7. Cleanup isolated runtime outputs

If an isolated Codex home was used, remove only that temporary directory after verification.

PowerShell example:

```powershell
Remove-Item -Recurse -Force .tmp-codex-home
Remove-Item Env:CODEX_HOME
```

Do not remove shared user `CODEX_HOME` unless explicitly intended.

## 8. Implemented command expectations

After implementation, `config/mcp.yaml` should define `servers.rie` as a stdio server using `bun run --cwd . knowledge:mcp`; generated Codex config resolves `--cwd .` to the ai-share project root.

Readiness is exposed through both the MCP tool contract (`rie.readiness`) and `ai:doctor` as the `rie_mcp_readiness` check.
