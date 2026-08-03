# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-01
**Branch:** develop

## OVERVIEW

`ai-share` centralizes OpenCode CLI, MCP, native skills, agents, and user-level memory for multiple machines/projects. Bun + strict TypeScript generate user-level OpenCode config, native skills, an `aioc` launcher, and instruction paths from YAML sources.

## STRUCTURE

```text
ai-share/
├── config/                    # YAML source of truth for generated config
├── src/                       # Bun generator, builders, CLI/install helpers, types
├── docs/                      # specs and runbooks
├── memory/                    # user-level memory vault
├── templates/                 # shareable config and personal overlay templates
├── AI_GUIDELINES.md           # shared AI collaboration instructions
├── GIT_COMMIT_GUIDELINES.md   # commit message policy
└── README.md                  # user-facing setup and runbook
```

Ignored/local: `.worktrees/`, `node_modules/`, `dist/`, `.sisyphus/evidence/`, `.env*`.

## WHERE TO LOOK

| Task                                  | Location                                        | Notes                                              |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Change providers/models/default model | `config/*.yaml`                                 | Canonical inputs; generated files are outputs      |
| `aioc` runtime variables              | `config/env.yaml`                               | Non-secret runtime env only                        |
| OpenCode plugins                      | `config/plugins.yaml`                           | Safe npm or named `git+https` specs                |
| Generator orchestration               | `src/generate-user-config.ts`                   | Loads YAML, builds configs, writes/install outputs |
| OpenCode config shape                 | `src/config/builders/opencode.ts`               | JSONC config, model providers, agents, MCP         |
| YAML schema and runtime shape checks  | `src/config/schema-spec.ts`                     | Single source for JSON Schema and shape validation |
| Instruction path builder              | `src/config/builders/instructions.ts`           | Generates memory file list                         |
| Skills and launcher ownership         | `src/cli/generation-plan.ts`                    | Plans transactional managed outputs                |
| Output paths                          | `src/cli/paths.ts`                              | OpenCode config, skills, and `aioc` paths          |
| Shared AI workflow rules              | `AI_GUIDELINES.md`                              | Referenced by OpenCode instructions                |
| Commit format                         | `GIT_COMMIT_GUIDELINES.md`                      | `option: 中文描述`                                 |
| User memory content                   | `memory/`                                       | Structured Markdown/YAML memory                    |
| Shareable templates and overlays      | `templates/` + `docs/templates-and-overlays.md` | Not direct generator input                         |

## CODE MAP

| Symbol                     | Type     | Location                                | Role                                   |
| -------------------------- | -------- | --------------------------------------- | -------------------------------------- |
| `loadYaml`                 | function | `src/generate-user-config.ts`           | Parse YAML source files from `config/` |
| `buildOpenCodeConfig`      | function | `src/config/builders/opencode.ts`       | Generate OpenCode config shape         |
| `buildInstructionsPaths`   | function | `src/config/builders/instructions.ts`   | Generate instruction/memory file list  |
| `buildAiocLauncherFiles`   | function | `src/cli/aioc-install.ts`               | Build cross-platform `aioc` launchers  |
| `parseCliOptions`          | function | `src/cli/options.ts`                    | Handles flags and provider groups      |
| `YAML_SCHEMA_SPECS`        | const    | `src/config/schema-spec.ts`             | Shared field spec for YAML schema      |
| `validateYamlSchemaShapes` | function | `src/config/validators/schema-shape.ts` | Runtime validation from schema spec    |

## CONVENTIONS

- Default communication/docs are Simplified Chinese; identifiers, commands, paths, API names stay English.
- YAML in `config/` is authoritative. Do not hand-edit generated user config as the durable fix.
- YAML field shape rules live in `src/config/schema-spec.ts`; JSON Schema output and runtime shape validation must derive from it.
- Providers declare their associated model IDs and default model; generation and checks process only the selected provider's associated models.
- Selecting `global.provider` uses `global.model`; selecting another provider uses that provider's `default_model`.
- Secrets policy is env-only: API keys are env-var references; never write real keys/tokens/cookies into repo files.
- `config/env.yaml` may manage local proxy variables for the OpenCode config `.env`, but must not contain API keys, tokens, `PATH`, `AI_SHARE_*`, or `OPENCODE_*`.
- `config/plugins.yaml` accepts npm package specs and named `git+https` specs only; explain output exposes package IDs, not versions or URLs.
- TypeScript is strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnused*`, `isolatedDeclarations`, `erasableSyntaxOnly`.
- User-facing thrown errors in generator code are Chinese.
- Prettier: 2 spaces, double quotes, semicolons, trailing commas, LF, print width 120.
- An unmanaged `~/.config/opencode/opencode.jsonc` is preserved unless explicit adoption uses `--force`.
- Git commits require explicit user request; format is `option: 中文描述`.

## ANTI-PATTERNS

- Do not bypass failures by deleting tests/assertions, loosening types, swallowing errors, or suppressing type errors.
- Do not commit or print secrets, `.env*`, local credentials, dependency caches, generated artifacts, or unrelated changes.
- Do not run destructive Git commands, force push, amend, skip hooks, or overwrite user changes without explicit request.
- Do not duplicate generated config back into YAML unless it is intentionally becoming source.
- Do not expand scope for unrelated issues; record them separately.

## COMMANDS

```sh
bun install
bun run ai:check
bun run ai:gen -- --dry-run
bun run ai:gen -- --force
bun run check
bun run memory:check
bun run provider:check
bun run lint
bun run typecheck
bun run format:check
bun run schema:gen
```

## NOTES

- Default OpenCode model is configured by `config/global.yaml` (`model: gpt-5.5`).
- `memory/` contains user-level memory files referenced by OpenCode startup instructions via `buildInstructionsPaths`.
- Memory privacy layers are documented in `docs/memory-privacy.md`; local/private/project memory directories are ignored.
- Existing local knowledge files: `config/AGENTS.md`, `src/AGENTS.md`.
