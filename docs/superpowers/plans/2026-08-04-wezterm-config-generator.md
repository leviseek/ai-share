# WezTerm Config Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `bun run ai:config` to interactively and safely generate `~/.config/wezterm/wezterm.lua` on Windows and macOS.

**Architecture:** Use an independent strict YAML source, deterministic Lua builder, sequential TTY wizard, and single-file ownership plan. Reuse project HOME parsing and `StagedFileWriter`, but keep `ai:config` independent from OpenCode generation and bootstrap.

**Tech Stack:** Bun 1.3.13, strict TypeScript, Bun YAML, Lua, Bun test, generated JSON Schema.

## Global Constraints

- `config/wezterm.yaml` is authoritative; interaction only overrides one invocation and never reads prior generated values.
- Defaults are exactly: `platform-native`, `catppuccin-mocha`, `12`, `0.94`, `false`, and `100000`.
- Support Windows and macOS; reject other platforms in Chinese.
- Output only `$HOME/.config/wezterm/wezterm.lua` with a stable ai-share ownership header.
- TTY defaults to interaction; `--non-interactive` and non-TTY use YAML defaults without waiting.
- Accept only `--dry-run`, `--non-interactive`, and `--force`; reject unknown arguments in Chinese.
- Unmanaged files, symlinks, and blocking paths collide unless `--force`; `--dry-run` performs zero writes.
- Do not change `ai:bootstrap`, `ai:gen`, `ai:clean`, or OpenCode GenerationPlan behavior.
- Do not add dependencies, `as any`, `@ts-ignore`, compatibility layers, custom value input, font family, reset/delete, or JSON output.
- Follow focused TDD and keep user-visible errors in Chinese.

---

### Task 1: Strict WezTerm Configuration Source

**Files:**
- Create: `config/wezterm.yaml`
- Create: `src/config/wezterm.ts`
- Create: `src/config/wezterm.test.ts`
- Modify: `src/types/yaml.ts`
- Modify: `src/types.ts`
- Modify: `src/config/schema-spec.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/config/validators/schema-shape.ts`
- Create generated: `docs/schema/json/wezterm.schema.json`

**Interfaces:**
- Produces `WezTermConfig`, `loadWezTermConfig(configDir: string): Promise<WezTermConfig>`, and schema support consumed by later tasks.
- `WezTermConfig` fields are `shell`, `color_scheme`, `font_size`, `window_background_opacity`, `maximize_on_startup`, and `scrollback_lines` with only the fixed values below.

- [ ] Write failing tests proving valid defaults load, missing/unknown fields fail in Chinese, and every field rejects values outside the fixed presets.
- [ ] Add schema tests proving `wezterm.schema.json` carries the same required fields and enums.
- [ ] Run `bun test src/config/wezterm.test.ts` and confirm failure before implementation.
- [ ] Add exact types: shell `platform-native | wezterm-default`; theme `catppuccin-mocha | dracula | tokyo-night | wezterm-default`; font size `11 | 12 | 13`; opacity `0.88 | 0.94 | 1`; maximize boolean; scrollback `10000 | 100000 | 1000000`.
- [ ] Extend schema nodes minimally to support numeric enums, then add `wezterm.yaml` as a strict required schema without integrating it into OpenCode `ConfigSet`.
- [ ] Implement a dedicated loader using existing YAML parsing/shape validation patterns. Do not load `config/local/wezterm.yaml`.
- [ ] Add the authoritative YAML with the exact defaults from Global Constraints.
- [ ] Run `bun test src/config/wezterm.test.ts`, `bun run schema:gen`, and `bun run schema:check`; all must pass.
- [ ] Self-review the diff for schema/runtime parity and report changed files and test evidence.

### Task 2: Deterministic WezTerm Lua Builder

**Files:**
- Create: `src/config/builders/wezterm.ts`
- Create: `src/config/builders/wezterm.test.ts`

**Interfaces:**
- Consumes `WezTermConfig` from Task 1.
- Produces `WEZTERM_CONFIG_MANAGED_HEADER: string` and `buildWezTermLua(config: WezTermConfig): string`.

- [ ] Write failing tests for the managed header, `wezterm.config_builder()`, every theme mapping, omitted default theme, both platform-native shell branches, omitted default shell, numeric options, optional maximize flow, LF, and trailing newline.
- [ ] Run `bun test src/config/builders/wezterm.test.ts` and confirm failure.
- [ ] Implement deterministic Lua generation. Map themes to `Catppuccin Mocha`, `Dracula`, and `Tokyo Night`.
- [ ] For platform-native shell, use `wezterm.target_triple`: `x86_64-pc-windows-msvc` maps to `{ "pwsh.exe", "-NoLogo" }`; triples ending in `-apple-darwin` map to `{ "/bin/zsh", "-l" }`.
- [ ] For maximization only, emit the documented `gui-startup` handler, call `wezterm.mux.spawn_window(cmd or {})`, and maximize its GUI window. Do not emit an event when false.
- [ ] Run `bun test src/config/builders/wezterm.test.ts`; all tests must pass.
- [ ] Self-review for valid Lua quoting, deterministic output, and no config-evaluation side effects beyond the optional documented startup event.

### Task 3: Sequential TTY Configuration Wizard

**Files:**
- Create: `src/cli/wezterm-select.ts`
- Create: `src/cli/wezterm-select.test.ts`

**Interfaces:**
- Consumes and returns `WezTermConfig`.
- Produces `WezTermSelector`, pure state transition/render helpers, and `selectWezTermConfigInteractive(initial, io?): Promise<WezTermConfig>`.

- [ ] Write failing pure-state tests for arrow wrapping, numeric selection, Enter progression, split ANSI sequences, final Generate/Cancel, and Ctrl+C cancellation.
- [ ] Write rendering tests for `步骤 n/6`, current selection, repository-default marker, final complete summary, and keyboard help.
- [ ] Write IO lifecycle tests proving non-TTY rejection and raw-mode/listener cleanup on success, cancellation, input end/error, and output failure.
- [ ] Run `bun test src/cli/wezterm-select.test.ts` and confirm failure.
- [ ] Implement six screens in this exact order: Shell, color theme, font size, opacity, startup window, scrollback. Use only the approved fixed presets.
- [ ] Implement final Generate/Cancel confirmation without writing files or persisting selection.
- [ ] Run `bun test src/cli/wezterm-select.test.ts`; all tests must pass.
- [ ] Self-review terminal sanitization, ANSI decoding, no hanging paths, and exact restoration of input raw/flowing state.

### Task 4: WezTerm Paths And Safe Single-File Plan

**Files:**
- Modify: `src/cli/paths.ts`
- Create: `src/cli/wezterm-plan.ts`
- Create: `src/cli/wezterm-plan.test.ts`

**Interfaces:**
- Consumes `WEZTERM_CONFIG_MANAGED_HEADER` and existing `StagedFileWriter`.
- Produces `WezTermPaths`, `buildWezTermPaths(env?)`, `WezTermPlan`, `buildWezTermPlan({ path, content, force })`, and `executeWezTermPlan(plan, stagingRoot)`.

- [ ] Write failing path tests for HOME/USERPROFILE resolution, absolute-path validation, and exact `.config/wezterm/wezterm.lua` target.
- [ ] Write failing plan tests for create, managed update, preserve, unmanaged collision, symlink/blocking collision, `--force` adoption, zero writes on collision/preserve, successful staging, and rollback preservation on failure.
- [ ] Run `bun test src/cli/wezterm-plan.test.ts` and confirm failure.
- [ ] Extract or reuse HOME resolution without changing existing `buildGeneratorPaths` behavior.
- [ ] Implement the single-file plan with explicit kind, path, ownership, reason, and content only for create/update.
- [ ] Implement execution through `StagedFileWriter`; reject collision and no-op preserve.
- [ ] Run `bun test src/cli/wezterm-plan.test.ts`; all tests must pass.
- [ ] Self-review that no path outside the fixed WezTerm target can be accidentally selected and no default collision is overwritten.

### Task 5: `ai:config` Command Orchestration

**Files:**
- Create: `src/cli/ai-config.ts`
- Create: `src/cli/ai-config.test.ts`
- Modify: `package.json`
- Modify: `src/cli/command-scripts.test.ts`

**Interfaces:**
- Consumes Task 1 loader, Task 2 builder, Task 3 selector, and Task 4 paths/plan.
- Produces `parseWezTermConfigOptions`, `runWezTermConfig`, result formatting/printing, and the `ai:config` package script.

- [ ] Write failing tests accepting only `--dry-run`, `--non-interactive`, and `--force`, including unknown-argument errors.
- [ ] Write failing integration tests for Windows/macOS support, Chinese unsupported-platform errors, TTY selector invocation, explicit/non-TTY selector skipping, dry-run zero writes, collision exit failure, force adoption, create/update/preserve output, and injected temporary HOME.
- [ ] Extend script registration test to require `"ai:config": "bun run ./src/cli/ai-config.ts"`.
- [ ] Run `bun test src/cli/ai-config.test.ts src/cli/command-scripts.test.ts` and confirm failure.
- [ ] Implement orchestration in this order: platform validation, paths, YAML load/validate, interaction decision, Lua build, plan build, summary/plan output, collision failure, optional execute.
- [ ] Ensure `--dry-run` may interact but never calls execution; non-TTY never waits; `--force` does not bypass validation.
- [ ] Run `bun test src/cli/ai-config.test.ts src/cli/command-scripts.test.ts`; all tests must pass.
- [ ] Self-review exit codes, dependency injection, Chinese errors, and absence of bootstrap/OpenCode behavior changes.

### Task 6: User Documentation And Project Knowledge

**Files:**
- Modify: `README.md`
- Create: `docs/schema/wezterm.md`
- Modify: `docs/schema/README.md`
- Modify: `config/AGENTS.md`
- Modify: `src/AGENTS.md`

**Interfaces:**
- Documents the implemented public command and configuration source; introduces no runtime interface.

- [ ] Update README command examples with `ai:config`, `--dry-run`, `--non-interactive`, and `--force`.
- [ ] Document exact target, defaults, presets, TTY/non-TTY behavior, one-run-only overrides, managed collision/adoption, automatic WezTerm reload, and exclusion from bootstrap.
- [ ] Add concise field/type/default documentation in `docs/schema/wezterm.md` and link it from schema docs.
- [ ] Update config/src project maps to include the authoritative file and implementation locations.
- [ ] Run `bun run format:check` and repair only formatting introduced by this task.
- [ ] Self-review that docs contain no unsupported flags or promises and exactly match implemented names/values.

### Task 7: End-To-End Verification And Review Readiness

**Files:**
- Modify only files needed to correct failures caused by Tasks 1-6.

**Interfaces:**
- Consumes the complete feature; produces verification evidence and a review-ready branch.

- [ ] Run all focused tests: `bun test src/config/wezterm.test.ts src/config/builders/wezterm.test.ts src/cli/wezterm-select.test.ts src/cli/wezterm-plan.test.ts src/cli/ai-config.test.ts src/cli/command-scripts.test.ts`.
- [ ] Run `bun run typecheck`, `bun run schema:gen`, `bun run schema:check`, `bun run format:check`, and `bun run lint`; fix only feature-caused failures and rerun the failing command.
- [ ] Verify `bun run ai:config -- --dry-run --non-interactive` with an isolated temporary HOME and confirm no `wezterm.lua` is written.
- [ ] Generate into an isolated temporary HOME, then run `wezterm --config-file <temp-home>/.config/wezterm/wezterm.lua ls-fonts`; record whether WezTerm loaded the file successfully.
- [ ] Run `bun run check`; all project gates must pass.
- [ ] Review the complete branch for requirement coverage, test quality, scope, security, and accidental changes to OpenCode commands.
- [ ] Report exact verification commands/results and any residual environment limitation.
