# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-06
**Branch:** develop

## OVERVIEW

`ai-share` centralizes Codex CLI, MCP, native skills, prompts, profiles, and user-level memory for multiple machines/projects. Bun + strict TypeScript generate user-level Codex config, native skills, runtime manifests, and instruction memory from YAML sources.

## STRUCTURE

```text
ai-share/
├── config/                    # YAML source of truth for generated config
├── src/                       # Bun generator, builders, CLI/install helpers, types
├── bin/                       # reserved for optional local wrappers
├── docs/                      # plans/specs/protocol docs
├── memory/                    # user-level memory vault
├── templates/                 # shareable config and personal overlay templates
├── AI_GUIDELINES.md           # shared AI collaboration instructions
├── GIT_COMMIT_GUIDELINES.md   # commit message policy
└── README.md                  # user-facing setup and runbook
```

Ignored/local: `.worktrees/`, `node_modules/`, `dist/`, `.sisyphus/evidence/`, `.env*`.

## WHERE TO LOOK

| Task                                    | Location                                        | Notes                                              |
| --------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Change providers/models/profiles/agents | `config/*.yaml`                                 | Canonical inputs; generated files are outputs      |
| Codex `.env` runtime variables          | `config/env.yaml`                               | Non-secret runtime env only                        |
| Profile evaluation task set             | `config/profile-eval.yaml`                      | Fixed tasks and manual scoring dimensions          |
| Generator orchestration                 | `src/generate-user-config.ts`                   | Loads YAML, builds configs, writes/install outputs |
| Codex config shape                      | `src/config/builders/codex.ts`                  | Codex TOML, agents, MCP                            |
| YAML schema and runtime shape checks    | `src/config/schema-spec.ts`                     | Single source for JSON Schema and shape validation |
| Instruction path builder                | `src/config/builders/instructions.ts`           | Generates memory file list                         |
| Default profile resolution              | `src/config/builders/profiles.ts`               | `global.default_profile` fallback behavior         |
| Native skill install behavior           | `src/cli/install.ts`                            | Installs native skills                             |
| Output paths                            | `src/cli/paths.ts`                              | Codex home, agents, skills, user bin               |
| Shared AI workflow rules                | `AI_GUIDELINES.md`                              | Loaded into generated Codex instructions           |
| Commit format                           | `GIT_COMMIT_GUIDELINES.md`                      | `option: 中文描述`                                 |
| User memory content                     | `memory/`                                       | Structured Markdown/YAML memory                    |
| Shareable templates and overlays        | `templates/` + `docs/templates-and-overlays.md` | Not direct generator input                         |

## CODE MAP

| Symbol                     | Type     | Location                                | Role                                        |
| -------------------------- | -------- | --------------------------------------- | ------------------------------------------- |
| `loadYaml`                 | function | `src/generate-user-config.ts`           | Parse YAML source files from `config/`      |
| `buildCodexCliConfigs`     | function | `src/config/builders/codex.ts`          | Generate per-profile Codex CLI TOML shape   |
| `buildInstructionsPaths`   | function | `src/config/builders/instructions.ts`   | Generate instruction/memory file list       |
| `defaultProfileId`         | function | `src/config/builders/profiles.ts`       | Resolve default profile                     |
| `installNativeSkills`      | function | `src/cli/install.ts`                    | Install native skills into Codex home       |
| `parseCliOptions`          | function | `src/cli/options.ts`                    | Handles flags and provider groups           |
| `YAML_SCHEMA_SPECS`        | const    | `src/config/schema-spec.ts`             | Shared field spec for YAML schema/shape     |
| `validateYamlSchemaShapes` | function | `src/config/validators/schema-shape.ts` | Runtime validation derived from schema spec |

## CONVENTIONS

- Default communication/docs are Simplified Chinese; identifiers, commands, paths, API names stay English.
- YAML in `config/` is authoritative. Do not hand-edit generated user config as the durable fix.
- YAML field shape rules live in `src/config/schema-spec.ts`; JSON Schema output and runtime shape validation must derive from it.
- Secrets policy is env-only: API keys are env-var references; never write real keys/tokens/cookies into repo files.
- `config/env.yaml` may manage local proxy variables for `CODEX_HOME/.env`, but must not contain API keys, tokens, `CODEX_HOME`, `PATH`, `AI_SHARE_*`, or `CODEX_*`.
- TypeScript is strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnused*`, `isolatedDeclarations`, `erasableSyntaxOnly`.
- User-facing thrown errors in generator code are Chinese.
- Prettier: 2 spaces, double quotes, semicolons, trailing commas, LF, print width 120.
- Generated `~/.codex/config.toml` is preserved when it already exists unless `--force` is used; profile-specific files are regenerated.
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
bun run profile:eval -- --tasks project_analysis,contract_test_patch --profiles coding,max
```

## NOTES

- Built-in profiles include `lite`, `economy`, `cheap`, `balanced`, `coding`, `research`, `writing`, `max`, and `ds-max`.
- `memory/` contains user-level memory files loaded as Codex startup instructions via `buildInstructionsPaths`.
- Memory privacy layers are documented in `docs/memory-privacy.md`; local/private/project memory directories are ignored.
- Existing local knowledge files: `config/AGENTS.md`, `src/AGENTS.md`, `bin/AGENTS.md`.
