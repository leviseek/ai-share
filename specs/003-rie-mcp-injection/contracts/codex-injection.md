# Contract: Codex Injection

This contract describes how source configuration becomes generated Codex user configuration.

## Source Input: `config/mcp.yaml`

The RIE MCP server is defined under `servers` using the existing MCP source shape.

```yaml
servers:
  rie:
    transport: stdio
    command: bun
    args:
      - run
      - ./src/knowledge/mcp/server.ts
```

Rules:

- `servers.rie` is the canonical shared id unless implementation discovers an existing project convention requiring a different non-conflicting id.
- `transport` must be `stdio` for v1.
- `command` and every `args` item must be non-empty strings.
- Sensitive env values must be `${ENV_NAME}` placeholders.
- Source must not contain `CODEX_HOME`, generated target paths, real secrets, tokens, cookies, or private credentials.

## Generated Output: `CODEX_HOME/config.toml`

Generated TOML must contain exactly one RIE MCP server entry when enabled.

```toml
[mcp_servers.rie]
command = "bun"
args = ["run", "./src/knowledge/mcp/server.ts"]
```

Rules:

- Generated output is reproducible from source configuration and current path resolution.
- Generation preserves existing no-overwrite behavior unless the user passes the existing force mode.
- Refresh must not remove unrelated MCP server entries from source-derived generated output.
- Dry-run output reports whether `rie` would be included and the target Codex user directory.

## Runtime Manifest / Summary Expectations

Generation and check summaries must include:

- configured MCP server ids including `rie` when enabled;
- target Codex user directory;
- default config drift status;
- readiness or recovery hints when RIE injection is missing, stale, disabled, or malformed.

## Validation Errors

Validation must produce field-specific errors for:

- missing stdio command;
- invalid args item;
- unsupported or conflicting transport fields;
- sensitive env values written as literals;
- secret-like strings in MCP env;
- duplicate/conflicting RIE server identity.

## Local Opt-Out

A device may intentionally opt out without deleting shared source definitions. The opt-out mechanism must follow existing local override/runtime patterns and must not require committing machine-specific source changes.
