# plugins/live2d-pet/

## OVERVIEW

OpenCode TUI plugin and optional desktop Live2D pet window; streams assistant text into a local pet bubble and launches via `live2d-pet`.

## STRUCTURE

```text
live2d-pet/
├── server.ts       # OpenCode message/text hooks -> bubble state
├── tui.ts          # TUI command + /live2d-pet slash
├── standalone.ts   # direct desktop/browser launcher entry
├── tui/            # local WebUI, state, renderer, client assets
├── tauri-client/   # Tauri frontend bridge
└── src-tauri/      # Rust/Tauri desktop shell; target/ is local cache
```

## WHERE TO LOOK

| Need                      | Location                      | Notes                                                  |
| ------------------------- | ----------------------------- | ------------------------------------------------------ |
| TUI command registration  | `tui.ts`                      | `Live2D pet`, `ctrl+shift+l`, `/live2d-pet`, `/l2dpet` |
| Text event capture        | `server.ts`                   | Handles assistant message parts and text completion    |
| Bubble state/publication  | `tui/state.ts`                | Shared local state for pet speech bubbles              |
| Browser/WebUI behavior    | `tui/`                        | Fallback window and Live2D rendering assets            |
| Desktop/Tauri integration | `standalone.ts`, `src-tauri/` | Optional binary copied by `installPlugins`             |
| Build/install copy rules  | `src/cli/install.ts`          | Copies release binary when present; excludes target    |

## CONVENTIONS

- Launching the pet window is best-effort; TUI command should fail quietly if `live2d-pet` is not installed.
- `server.ts` only publishes normalized assistant text; rendering/window lifecycle stays under `tui/` or Tauri.
- Keep third-party model assets CDN-based unless explicitly changing packaging policy.
- `src-tauri/target/` is build cache; source files are `Cargo.toml`, `src/`, `capabilities/`, `gen/`, and icons.
- Windows/Linux/macOS launcher behavior must stay compatible with `installPlugins` binary detection.

## VALIDATION

```sh
bun run typecheck
bun run ai:gen -- --dry-run
bun run live2d-pet:build
```

Linux Tauri builds require system `pkg-config` and `libdbus-1-dev`.

## ANTI-PATTERNS

- Do not let UI rendering leak into OpenCode server hook handlers.
- Do not commit Tauri `target/`, generated binaries, CDN model files, or local window state.
- Do not make pet launch failures break OpenCode TUI startup.
- Do not add bundled proprietary model assets without source/license review.
