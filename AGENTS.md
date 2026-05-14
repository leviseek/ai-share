# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-15
**Commit:** 1b30ffe
**Branch:** develop

## OVERVIEW

`ai-share` centralizes OpenCode, aioc, and oh-my-openagent configuration for multiple machines/projects. Bun + strict TypeScript generate user-level config, launchers, plugins, native skills, proxy/strategy sidecars, context-guard tooling, and local TUI plugin assets from YAML sources.

## STRUCTURE

```text
ai-share/
├── config/                    # YAML source of truth for generated config
├── src/                       # Bun generator, context guard, builders, CLI/install helpers, types
├── bin/                       # aiomo/aioc launchers + install doctor wrappers
├── docs/                      # plans/specs for local superpowers work
├── memory/                    # user-level memory vault (structured Markdown)
├── plugins/                  # local OpenCode/TUI plugins
│   ├── omo-agent-monitor/    # local OMO status monitor plugin
│   ├── dingtalk-notifier/    # review-first DingTalk notification plugin
│   └── live2d-pet/           # Live2D TUI command + desktop/Tauri pet window
├── AI_GUIDELINES.md           # generated OpenCode instruction source
├── GIT_COMMIT_GUIDELINES.md   # commit message policy
└── README.md                  # user-facing setup and runbook
```

Ignored/local: `.worktrees/`, `node_modules/`, `dist/`, `.opencode-rescue/`, `.opencode/context-guard-*`, `.sisyphus/evidence/`, `.env*`, `plugins/live2d-pet/src-tauri/target/`.

## WHERE TO LOOK

| Task                                    | Location                               | Notes                                                      |
| --------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Change providers/models/profiles/agents | `config/*.yaml`                        | Canonical inputs; generated JSON is output                 |
| Generator orchestration                 | `src/generate-user-config.ts`          | Loads YAML, builds configs, writes/install outputs         |
| OpenCode config shape                   | `src/config/builders/opencode.ts`      | Native agent/profile/provider config                       |
| OMO config shape                        | `src/config/builders/omo.ts`           | Agents/categories/runtime fallback/background task         |
| Context guard config generation         | `src/config/builders/context-guard.ts` | Profile max-input-token sidecars                           |
| Context guard runtime                   | `src/context-guard/`                   | Check/rescue/handoff/watch implementation                  |
| Launcher install behavior               | `src/cli/install.ts` + `bin/`          | Copies launchers/plugins/skills; Windows PATH/BOM handling |
| OMO monitor behavior                    | `plugins/omo-agent-monitor/`           | Server event capture + TUI command/WebUI                   |
| DingTalk notification plugin            | `plugins/dingtalk-notifier/`           | Env-only webhook/secret, review-before-send flow           |
| Live2D pet plugin                       | `plugins/live2d-pet/`                  | TUI slash command, browser fallback, optional Tauri binary  |
| Shared AI workflow rules                | `AI_GUIDELINES.md`                     | Loaded into generated OpenCode configs                     |
| Commit format                           | `GIT_COMMIT_GUIDELINES.md`             | `option: 中文描述`                                         |
| User memory content                     | `memory/`                              | Structured Markdown; injected as startup instructions      |
| Instructions path builder               | `src/config/builders/opencode.ts`      | `buildInstructionsPaths` generates memory file list        |

## CODE MAP

| Symbol                       | Type           | Location                               | Role                                                       |
| ---------------------------- | -------------- | -------------------------------------- | ---------------------------------------------------------- |
| `loadYaml`                   | function       | `src/generate-user-config.ts`          | Parse YAML source files from `config/`                     |
| `buildOpenCodeConfigs`       | function       | `src/config/builders/opencode.ts`      | Generate per-profile OpenCode config                       |
| `buildAiocOpenCodeConfigs`   | function       | `src/config/builders/opencode.ts`      | Remove OMO-only plugins for `aioc` profiles                |
| `buildOhMyOpenAgentConfigs`  | function       | `src/config/builders/omo.ts`           | Generate per-profile OMO config                            |
| `buildContextGuardConfig`    | function       | `src/config/builders/context-guard.ts` | Materialize guard defaults from `global.yaml`              |
| `buildStrategyConfigs`       | function       | `src/config/builders/strategy.ts`      | Generate DCP/checkpoint/memory sidecars per profile        |
| `check` / `rescue` / `watch` | functions      | `src/context-guard/`                   | Context guard runtime commands installed to user bin       |
| `installLaunchers`           | function       | `src/cli/install.ts`                   | Copy platform launchers to user bin                        |
| `installPlugins`             | function       | `src/cli/install.ts`                   | Build/copy local OpenCode plugins                          |
| `parseCliOptions`            | function       | `src/cli/options.ts`                   | Handles `--force`, `--dry-run`, `--check`, provider groups |
| `buildInstructionsPaths`     | function       | `src/config/builders/opencode.ts`      | Generate instructions list including memory/ files         |
| `plugin`                     | default export | `plugins/omo-agent-monitor/server.ts`  | Handles OpenCode server events and persists monitor state  |
| `plugin`                     | default export | `plugins/omo-agent-monitor/tui.ts`     | Registers monitor command and `/omo-monitor` slash         |
| `plugin`                     | default export | `plugins/dingtalk-notifier/server.ts`  | Logs review prompts or sends signed DingTalk messages      |
| `plugin`                     | default export | `plugins/live2d-pet/tui.ts`            | Registers `Live2D pet` command and `/live2d-pet` slash     |

## CONVENTIONS

- Default communication/docs are Simplified Chinese; identifiers, commands, paths, API names stay English.
- YAML in `config/` is authoritative. Do not hand-edit generated user config as the durable fix.
- Secrets policy is env-only: API keys are `{env:VAR}` references; never write real keys/tokens/cookies into repo files.
- TypeScript is strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnused*`, `isolatedDeclarations`, `erasableSyntaxOnly`.
- User-facing thrown errors in generator code are Chinese (`缺少必要配置字段...`, etc.).
- Prettier: 2 spaces, double quotes, semicolons, trailing commas, LF, print width 120.
- ESLint ignores `plugins/**`; TypeScript still includes `plugins/**/*.ts`.
- Generated OMO config disables `auto-slash-command` to avoid native skill prompt expansion in TUI.
- `strategy.<profile>.json` sidecars carry DCP/checkpoint/memory policy instead of unknown OpenCode top-level fields.
- `dingtalk-notifier` defaults to review-before-send; AI must confirm notification content before external sending.
- `live2d-pet` is a TUI plugin plus optional desktop binary; `src-tauri/target/` is local build cache, not source.
- `.worktrees/install-doctor/` and `.opencode/context-guard-history/` are local state; do not treat them as primary source.

## ANTI-PATTERNS (THIS PROJECT)

- Do not bypass failures by deleting tests/assertions, loosening types, swallowing errors, or suppressing type errors.
- Do not commit or print secrets, `.env*`, local credentials, dependency caches, generated artifacts, or unrelated changes.
- Do not run destructive Git commands, force push, amend, skip hooks, or overwrite user changes without explicit request.
- Do not add unknown optional OpenCode plugins/dependencies without confirming source, package/path, maintenance, and need.
- Do not bypass DingTalk review-before-send or store real webhook/SEC secrets outside env references.
- Do not duplicate generated config back into YAML unless it is intentionally becoming source.
- Do not treat plugin build outputs (`server.js`, `tui.js`, Tauri `target/`) as durable source.
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
bun run live2d-pet:build
```

## NOTES

- `memory/` contains user-level memory files (structured Markdown); loaded as OpenCode startup instructions via `buildInstructionsPaths`.
- `bun run ai:check` validates config/generator consistency without writing or installing.
- `bun run ai:gen` writes user config and installs launchers/plugins/skills; use `--dry-run` first for config edits.
- `aioc` excludes `oh-my-openagent` and `./plugins/omo-agent-monitor` for native OpenCode Build / Plan usage.
- Built-in profiles include `lite`, `economy`, `cheap`, `balanced`, `coding`, `research`, `writing`, and `max`.
- `aiomo`/`aioc` context guard can block oversized session recovery; use `aiomo rescue <session-id>` or `aioc rescue <session-id>` before forcing.
- Existing local knowledge files: `config/AGENTS.md`, `src/AGENTS.md`, `bin/AGENTS.md`, `src/context-guard/AGENTS.md`, `plugins/AGENTS.md`, `plugins/omo-agent-monitor/AGENTS.md`, `plugins/live2d-pet/AGENTS.md`.
- Git commits require explicit user request; format is `option: 中文描述`.
