# plugins/omo-agent-monitor/

## OVERVIEW

Local OpenCode plugin that records OMO agent/session activity and exposes a TUI command/WebUI monitor.

## STRUCTURE

```text
omo-agent-monitor/
├── server.ts              # OpenCode server hooks -> persisted state
├── tui.ts                 # TUI command + slash registration
├── server/                # event parsing, state, persistence, token helpers
├── tui/                   # WebUI server, renderer, view model, assets
├── agents-registry.json   # copied into built plugin output
└── package.json           # copied into built plugin output
```

## WHERE TO LOOK

| Need                     | Location                                                                                              | Notes                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Hook event wiring        | `server.ts`                                                                                           | Handles `session.status`, `todo.updated`, `tool.execute.before/after` |
| Agent identification     | `server/agent-info.ts`                                                                                | Maps tool calls to monitor agent labels                               |
| Persisted state model    | `server/state.ts`                                                                                     | Session, todos, active calls, per-agent metrics                       |
| Token extraction         | `server/tokens.ts`                                                                                    | Adds token deltas from tool input/output                              |
| Persistence helpers      | `server/persist.ts`, `server/sqlite.ts`, `server/json.ts`                                             | State file / SQLite / JSON parsing                                    |
| TUI command registration | `tui.ts`                                                                                              | `OMO agents monitor`, `/omo-monitor`, alias `/omom`                   |
| WebUI lifecycle          | `tui/web-server.ts`                                                                                   | Starts local monitor UI and opens browser                             |
| Rendering/view model     | `tui/renderer.ts`, `tui/view-model.ts`, `tui/template.html`, `tui/styles.css`, `tui/client-script.ts` | Browser display                                                       |
| Default agent registry   | `agents-registry.json`, `shared.ts`                                                                   | Main/subagent/category labels merged into empty state                 |

## CONVENTIONS

- Server code owns OpenCode event capture and persistence; TUI code owns command/WebUI only.
- `shared.ts` is the cross-entry contract for agent names/kinds; keep server and TUI behavior compatible.
- Persisted monitor state lives outside repo in user config (`omo-agent-monitor-state.json`).
- Build command uses Bun and keeps `bun:sqlite` external; do not replace it with a dependency.
- `installPlugins` copies built `server.js`, `tui.js`, `package.json`, and `agents-registry.json` into user plugin dir.
- ESLint ignores `plugins/**`, but `tsconfig.json` includes `plugins/**/*.ts`; TypeScript must still pass.
- Command metadata is user-facing Chinese; command IDs/slash aliases stay stable.

## VALIDATION

```sh
bun run typecheck
bun run ai:gen -- --dry-run
```

For build/install changes, verify the generated plugin output still includes both entry files plus copied metadata.

## ANTI-PATTERNS

- Do not mix WebUI rendering logic into server hook handlers.
- Do not change OpenCode event names or slash command names casually.
- Do not persist API keys, prompts, credentials, or full sensitive tool payloads.
- Do not add external packages for rendering/state unless Bun/local APIs cannot cover it.
