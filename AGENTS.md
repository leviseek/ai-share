# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-06
**Branch:** develop

## OVERVIEW

`ai-share` centralizes Codex CLI, OMX, MCP, native skills, prompts, profiles, and user-level memory for multiple machines/projects. Bun + strict TypeScript generate user-level Codex/OMX config, launchers, native skills, agents, runtime manifests, and instruction memory from YAML sources.

## STRUCTURE

```text
ai-share/
├── config/                    # YAML source of truth for generated config
├── src/                       # Bun generator, builders, CLI/install helpers, types
├── bin/                       # aiomx launcher wrappers
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
| Generator orchestration                 | `src/generate-user-config.ts`                   | Loads YAML, builds configs, writes/install outputs |
| Codex/OMX config shape                  | `src/config/builders/codex.ts`                  | Codex TOML, agents, MCP, OMX JSON                  |
| YAML schema and runtime shape checks    | `src/config/schema-spec.ts`                     | Single source for JSON Schema and shape validation |
| Instruction path builder                | `src/config/builders/instructions.ts`           | Generates memory file list                         |
| Default profile resolution              | `src/config/builders/profiles.ts`               | `global.default_profile` fallback behavior         |
| Launcher install behavior               | `src/cli/install.ts` + `bin/`                   | Copies aiomx launchers and native skills           |
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
| `buildCodexAgentConfigs`   | function | `src/config/builders/codex.ts`          | Generate Codex agent TOML configs           |
| `buildOmxConfigs`          | function | `src/config/builders/codex.ts`          | Generate per-profile OMX JSON configs       |
| `buildInstructionsPaths`   | function | `src/config/builders/instructions.ts`   | Generate instruction/memory file list       |
| `defaultProfileId`         | function | `src/config/builders/profiles.ts`       | Resolve default profile                     |
| `installLaunchers`         | function | `src/cli/install.ts`                    | Copy platform launchers to user bin         |
| `installNativeSkills`      | function | `src/cli/install.ts`                    | Install native skills into Codex home       |
| `parseCliOptions`          | function | `src/cli/options.ts`                    | Handles flags and provider groups           |
| `YAML_SCHEMA_SPECS`        | const    | `src/config/schema-spec.ts`             | Shared field spec for YAML schema/shape     |
| `validateYamlSchemaShapes` | function | `src/config/validators/schema-shape.ts` | Runtime validation derived from schema spec |

## CONVENTIONS

- Default communication/docs are Simplified Chinese; identifiers, commands, paths, API names stay English.
- YAML in `config/` is authoritative. Do not hand-edit generated user config as the durable fix.
- YAML field shape rules live in `src/config/schema-spec.ts`; JSON Schema output and runtime shape validation must derive from it.
- Secrets policy is env-only: API keys are env-var references; never write real keys/tokens/cookies into repo files.
- TypeScript is strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnused*`, `isolatedDeclarations`, `erasableSyntaxOnly`.
- User-facing thrown errors in generator code are Chinese.
- Prettier: 2 spaces, double quotes, semicolons, trailing commas, LF, print width 120.
- Generated `~/.codex/config.toml` is preserved when it already exists; profile-specific files are regenerated.
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
bun run lint
bun run typecheck
bun run format:check
bun run schema:gen
bun run profile:eval -- --task "分析当前项目" --profiles coding,max
```

## NOTES

- Built-in profiles include `lite`, `economy`, `cheap`, `balanced`, `coding`, `research`, `writing`, `max`, and `ds-max`.
- `memory/` contains user-level memory files loaded as Codex startup instructions via `buildInstructionsPaths`.
- Memory privacy layers are documented in `docs/memory-privacy.md`; local/private/project memory directories are ignored.
- Existing local knowledge files: `config/AGENTS.md`, `src/AGENTS.md`, `bin/AGENTS.md`.
