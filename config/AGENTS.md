# config/

## OVERVIEW

YAML source of truth for every generated OpenCode, aioc, OMO, strategy, profile, and context-guard config.

## WHERE TO LOOK

| Need                                                                                | File            | Notes                                       |
| ----------------------------------------------------------------------------------- | --------------- | ------------------------------------------- |
| Default profile, shared plugins, ignored paths, DCP/checkpoint/memory/context guard | `global.yaml`   | Broad defaults and shared policy            |
| Provider base URLs and API-key env vars                                             | `provider.yaml` | Secrets stay env-only                       |
| Model catalog, upstream IDs, provider groups, fallback                              | `models.yaml`   | Referenced by profile role names            |
| OMO profile roles and profile-level strategy/compaction overrides                   | `profiles.yaml` | `lite`, `cheap`, `balanced`, `coding`, etc. |
| Agents, categories, shared prompts, runtime fallback, background concurrency        | `agents.yaml`   | OMO agent/category behavior                 |

## CONVENTIONS

- Edit YAML first; generated files under user config are outputs.
- Stable keys matter: generator code references provider/model/profile/agent IDs.
- Prefer shared defaults in `global.yaml`; use profile overrides only for real profile differences.
- `agents.yaml` model values normally reference roles (`primary`, `reasoning`, `fast`), not raw provider model strings.
- `shared_prompt.append` is Chinese and injects `AI_GUIDELINES.md` workflow expectations into OMO agents.
- Optional plugins default empty; do not add unknown package names or paths speculatively.
- Workspace/DCP/memory excludes must keep `.env*`, `.git/**`, `node_modules/**`, lockfiles, and runtime state out.

## VALIDATION

```sh
bun run ai:check
bun run ai:gen -- --dry-run
```

Use `ai:check` for schema/registry consistency and dry-run generation to inspect output changes before writing.

## ANTI-PATTERNS

- No real API keys, tokens, cookies, private endpoints, or local credentials in YAML.
- Do not duplicate the same setting across many profiles if a global default can own it.
- Do not edit generated JSON/JSONC as the durable fix for a YAML-source issue.
- Do not change `default_profile` without checking README/user-facing implications.
