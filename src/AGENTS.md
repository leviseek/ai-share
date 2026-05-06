# src/

## OVERVIEW

Bun/TypeScript generator for user-level OpenCode, aioc, oh-my-openagent, strategy, context-guard, launcher, plugin, and native-skill outputs.

## STRUCTURE

```text
src/
├── generate-user-config.ts # Bun entrypoint/orchestrator
├── config-builders.ts      # re-export facade for builder APIs
├── config/                 # model refs, validation, concrete builders
├── context-guard/          # runtime check/rescue/handoff/watch implementation
├── cli/                    # options, paths, install, output, registry/API checks
├── types/                  # YAML/OpenCode/OMO/CLI type modules
├── types.ts                # type re-export facade
└── yaml.ts                 # YAML parsing helper
```

## WHERE TO LOOK

| Need                        | Location                           | Notes                                                      |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| End-to-end generation flow  | `generate-user-config.ts`          | Loads YAML with `Promise.all`, validates, writes, installs |
| OpenCode/native aioc config | `config/builders/opencode.ts`      | Profiles, native agents, plugins, compaction               |
| OMO config                  | `config/builders/omo.ts`           | Agents/categories, fallback, concurrency, prompt append    |
| Strategy sidecars           | `config/builders/strategy.ts`      | DCP/checkpoint/memory merge output                         |
| Provider blocks             | `config/builders/provider.ts`      | Provider/model materialization                             |
| Context guard sidecars      | `config/builders/context-guard.ts` | Guard defaults and max-input-token profiles                |
| Context guard runtime       | `context-guard/`                   | CLI, config, DB, risk, rescue/handoff, watch logic         |
| CLI flags                   | `cli/options.ts`                   | `--force`, `--dry-run`, `--check`, provider groups/env     |
| Install/copy/build behavior | `cli/install.ts`                   | Launchers, plugins, all local native skills                |
| Output paths                | `cli/paths.ts`                     | User config/bin/skills/plugin targets                      |
| Required field guards       | `config/validation.ts`             | Chinese errors for missing config                          |

## CONVENTIONS

- Keep `generate-user-config.ts` orchestration-only; put config shape logic in builders and IO/install logic in `cli/`.
- `config-builders.ts` and `types.ts` are facades; avoid business logic there.
- Use explicit exports/types at module boundaries; `isolatedDeclarations` requires declaration-friendly code.
- Handle missing indexed values explicitly; `noUncheckedIndexedAccess` is enabled.
- User-facing errors/messages are Chinese; option names, env vars, paths, schema fields stay English.
- `writeJson` calls must preserve dry-run/force semantics; no silent overwrite path.
- Independent YAML reads/builds may run concurrently with `Promise.all`.
- Secrets are checked by env-var name only; never materialize real key values into generated config.
- `src/context-guard/cli.ts` installs as `opencode-context-guard.ts`; sibling modules install as `context-guard/*.ts`.
- Context guard has its own child `AGENTS.md`; read it before changing watch/rescue/check behavior.

## VALIDATION

```sh
bun run typecheck
bun run lint
bun run ai:check
```

Use `bun run check` when touching cross-cutting generator behavior.

## ANTI-PATTERNS

- No `as any`, type-error suppression, unused exports/locals, or implicit optional-field assumptions.
- Do not mix CLI parsing/install side effects into builder modules.
- Do not move context-guard runtime back into `bin/`; `bin/` owns launch wrappers only.
- Do not change generated schema fields without checking current OpenCode/OMO schema expectations.
- Do not add runtime dependencies unless existing Bun/Node APIs cannot meet the need.
