# config/

## OVERVIEW

YAML source of truth for generated Codex CLI, OMX, profile, agent, MCP, and instruction-memory configuration.

## WHERE TO LOOK

| Need                                                   | File            | Notes                                         |
| ------------------------------------------------------ | --------------- | --------------------------------------------- |
| Default profile and Codex/OMX version requirements     | `global.yaml`   | Only fields consumed by generator/check       |
| Provider base URLs and API-key env vars                | `provider.yaml` | Secrets stay env-only                         |
| Model catalog, upstream IDs, provider groups, fallback | `models.yaml`   | Referenced by profile role names              |
| Codex/OMX profile role mapping                         | `profiles.yaml` | `lite`, `cheap`, `balanced`, `coding`, etc.   |
| Codex agent runtime, role mapping, and prompt rules    | `agents.yaml`   | Codex `[agents]`, OMX slots, agent roles      |
| Codex MCP servers                                      | `mcp.yaml`      | Tokens and sensitive env values stay env-only |
| Codex `.env` runtime variables                         | `env.yaml`      | Non-secret local runtime env only             |
| Shareable onboarding templates                         | `../templates/` | Not consumed directly by generator            |

## CONVENTIONS

- Edit YAML first; generated files under the user Codex home are outputs.
- Stable keys matter: generator code references provider/model/profile/agent IDs.
- YAML field shape rules are defined once in `../src/config/schema-spec.ts`; do not mirror required/type/enum rules in docs or validators by hand.
- Keep `global.yaml` small; profile-specific behavior belongs in `profiles.yaml`.
- `profiles.yaml` currently defines `lite`, `economy`, `cheap`, `balanced`, `coding`, `research`, `writing`, `max`, `ds-max`.
- `agents.yaml` model values normally reference roles (`primary`, `reasoning`, `fast`), not raw provider model strings.
- `agents.yaml` owns Codex `[agents]` concurrency settings and OMX `model_slots` / `agent_reasoning` mappings.
- `env.yaml` only owns non-secret Codex runtime env such as local proxy; do not put API keys, tokens, `CODEX_HOME`, `PATH`, `AI_SHARE_*`, or `OMX_DEFAULT_*`.
- `config/local/` is reserved for future machine-local overlays and is ignored by Git.
- `shared_prompt.append` is Chinese and injects `AI_GUIDELINES.md` workflow expectations into Codex agents.
- Workspace excludes must keep `.env*`, `.git/**`, `node_modules/**`, lockfiles, and runtime state out.

## VALIDATION

```sh
bun run ai:check
bun run ai:gen -- --dry-run
bun run schema:gen
```

## ANTI-PATTERNS

- No real API keys, tokens, cookies, private endpoints, or local credentials in YAML.
- Do not duplicate the same setting across many profiles if a global default can own it.
- Do not edit generated TOML/JSON as the durable fix for a YAML-source issue.
- Do not change `default_profile` without checking README/user-facing implications.
