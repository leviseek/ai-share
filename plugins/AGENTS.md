# plugins/

## OVERVIEW

Local OpenCode/TUI plugins installed from repo source into the user OpenCode config directory by `src/cli/install.ts`.

## STRUCTURE

```text
plugins/
├── omo-agent-monitor/ # OMO event capture + monitor WebUI
├── dingtalk-notifier/ # review-first DingTalk notification hooks
└── live2d-pet/        # Live2D pet command, browser fallback, optional Tauri app
```

## WHERE TO LOOK

| Need                         | Location                | Notes                                              |
| ---------------------------- | ----------------------- | -------------------------------------------------- |
| Monitor OMO agents/session   | `omo-agent-monitor/`    | Has child `AGENTS.md`; server + TUI + WebUI split  |
| DingTalk completion notices  | `dingtalk-notifier/`    | Env-only webhook/secret; review gate defaults on   |
| Live2D pet window            | `live2d-pet/`           | Has child `AGENTS.md`; TUI command + desktop app   |
| Plugin build/copy behavior   | `src/cli/install.ts`    | Builds TS entrypoints, copies metadata/binaries    |
| Plugin source configuration  | `config/global.yaml`    | `opencode.plugins`, `tui.plugins`, notifier config |

## CONVENTIONS

- Each plugin keeps `server.ts` and `tui.ts` as separate entrypoints when both OpenCode hooks and TUI commands exist.
- `package.json` `exports` must match built entrypoints copied during install.
- ESLint ignores `plugins/**`, but TypeScript includes `plugins/**/*.ts`; keep strict TS clean.
- Runtime state/logs belong in user config, not repo files.
- User-facing command titles/descriptions may be Chinese; command IDs and slash aliases stay stable.

## VALIDATION

```sh
bun run typecheck
bun run ai:gen -- --dry-run
```

Use `bun run live2d-pet:build` only when touching the Tauri desktop path.

## ANTI-PATTERNS

- Do not persist API keys, prompts, cookies, webhook URLs, or full sensitive tool payloads.
- Do not add plugin dependencies unless Bun/local APIs cannot cover the behavior.
- Do not hand-edit installed plugin output under user config as the durable fix.
- Do not commit `plugins/live2d-pet/src-tauri/target/` or generated desktop build caches.
