# src/

## OVERVIEW

Bun/TypeScript generator for user-level Codex CLI, OMX, native-skill, launcher, MCP, agent, and instruction-memory outputs.

## STRUCTURE

```text
src/
├── generate-user-config.ts # Bun entrypoint/orchestrator
├── config-builders.ts      # re-export facade for builder APIs
├── config/                 # model refs, validation, concrete builders
├── cli/                    # options, paths, install, output, registry/API checks
├── loaders/                # memory loader/compiler helpers
├── memory/                 # memory retrieval
├── protocol/               # tri-role protocol and adapters
├── types/                  # YAML/Codex/CLI type modules
├── types.ts                # type re-export facade
└── yaml.ts                 # YAML parsing helper
```

## WHERE TO LOOK

| Need                       | Location                          | Notes                                                     |
| -------------------------- | --------------------------------- | --------------------------------------------------------- |
| End-to-end generation flow | `generate-user-config.ts`         | Loads YAML, validates, writes Codex/OMX outputs, installs |
| Codex/OMX config           | `config/builders/codex.ts`        | Profiles, providers, MCP, agents, OMX model env           |
| Instruction/memory paths   | `config/builders/instructions.ts` | Shared instruction file ordering                          |
| Default profile resolution | `config/builders/profiles.ts`     | `global.default_profile` fallback behavior                |
| CLI flags                  | `cli/options.ts`                  | `--force`, `--dry-run`, `--check`, provider groups/env    |
| Install/copy behavior      | `cli/install.ts`                  | Launchers and Codex native skills                         |
| Output paths               | `cli/paths.ts`                    | Codex home, agents, skills, user bin                      |
| Required field guards      | `config/validation.ts`            | Chinese errors for missing config                         |

## CONVENTIONS

- Keep `generate-user-config.ts` orchestration-only; put config shape logic in builders and IO/install logic in `cli/`.
- `config-builders.ts` and `types.ts` are facades; avoid business logic there.
- Use explicit exports/types at module boundaries; `isolatedDeclarations` requires declaration-friendly code.
- Handle missing indexed values explicitly; `noUncheckedIndexedAccess` is enabled.
- User-facing errors/messages are Chinese; option names, env vars, paths, schema fields stay English.
- `writeJson` / `writeText` calls must preserve dry-run/force semantics.
- Independent YAML reads/builds may run concurrently with `Promise.all`.
- Secrets are checked by env-var name only; never materialize real key values into generated config.

## VALIDATION

```sh
bun run typecheck
bun run lint
bun run ai:check
```

Use `bun run check` when touching cross-cutting generator behavior.
