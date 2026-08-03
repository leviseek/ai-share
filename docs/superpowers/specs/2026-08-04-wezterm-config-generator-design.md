# WezTerm Config Generator Design

## Goal

Add `bun run ai:config` as a dedicated WezTerm user-configuration generator. It writes a safe, deterministic
`~/.config/wezterm/wezterm.lua` on Windows and macOS without coupling WezTerm lifecycle or failures to the existing
OpenCode `ai:gen` pipeline.

## Configuration Source

`config/wezterm.yaml` is the authoritative source for repository defaults:

```yaml
shell: platform-native
color_scheme: catppuccin-mocha
font_size: 12
window_background_opacity: 0.94
maximize_on_startup: false
scrollback_lines: 100000
```

The file uses the project's strict YAML schema pipeline and rejects unknown fields. Runtime interactive choices are
in-memory overrides for one invocation only: they do not modify the YAML and do not read values from the previously
generated Lua file.

## Generated Lua

The output target is always `$HOME/.config/wezterm/wezterm.lua`. It uses `wezterm.config_builder()` and a stable
ai-share ownership header. Platform-native shell selection uses `wezterm.target_triple`: Windows starts
`pwsh.exe -NoLogo`, while Intel and Apple Silicon macOS start `/bin/zsh -l`. Selecting WezTerm's default shell omits
`default_prog`.

The generated config sets the selected color scheme, font size, window background opacity, and scrollback lines.
Selecting WezTerm's default theme omits `color_scheme`. A default-sized window adds no event handler. Selecting
startup maximization emits the documented `gui-startup` flow that calls `wezterm.mux.spawn_window(cmd or {})` and
`window:gui_window():maximize()`.

## Interaction

In a TTY, `ai:config` presents six sequential menus: Shell, color scheme, font size, background opacity, startup
window behavior, and scrollback lines. Each screen displays `步骤 n/6`, highlights the current choice, marks the
repository default, and supports arrow keys, numeric selection, Enter, and Ctrl+C. A final summary requires Generate
or Cancel confirmation.

Fixed presets are:

| Field | Values |
| --- | --- |
| Shell | Platform native, WezTerm default |
| Color scheme | Catppuccin Mocha, Dracula, Tokyo Night, WezTerm default |
| Font size | 11, 12, 13 |
| Background opacity | 1.0, 0.94, 0.88 |
| Startup window | Default size, maximized |
| Scrollback | 10,000, 100,000, 1,000,000 |

`--non-interactive` skips the wizard. Non-TTY input/output automatically uses repository defaults and never waits for
input. `--dry-run` may still use the wizard but never writes. `--force` only adopts an unmanaged output; it never
bypasses config or argument validation.

## Ownership And Errors

Missing output is created. Matching managed content is preserved, and drifted managed content is updated. Existing
unmanaged files, symbolic links, and blocking paths are collisions unless `--force` is explicit. A collision prevents
all writes. Updates use the existing `StagedFileWriter` for atomic promotion and rollback.

Unsupported platforms and user-visible failures are reported in Chinese. `ai:bootstrap`, `ai:gen`, `ai:clean`, and
the OpenCode GenerationPlan remain unchanged.

## Testing And Documentation

Tests cover strict YAML validation, deterministic Lua generation for both supported platforms, the keyboard-driven
wizard state machine, ownership planning, transactional execution, command flags, non-TTY fallback, and script
registration. README and schema documentation describe command usage, defaults, presets, target path, and adoption.

Validation runs focused tests, schema generation/checks, typecheck, formatting, lint, an isolated-HOME command smoke
test, WezTerm's own config loading when available, and the full `bun run check` gate.
