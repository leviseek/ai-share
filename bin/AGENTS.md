# bin/

## OVERVIEW

Installable launcher wrappers copied by `src/cli/install.ts` into the user's bin directory. Context-guard implementation lives in `src/context-guard/` and is installed from there.

## STRUCTURE

```text
bin/
├── aiomo / aiomo.cmd / aiomo.ps1
├── aioc / aioc.cmd / aioc.ps1
├── aiomo-monitor / aiomo-monitor.cmd / aiomo-monitor.ps1
├── opencode-launcher-common.sh
├── opencode-launcher-common.ps1
└── opencode-install-doctor.ts
```

## WHERE TO LOOK

| Need                             | Location                       | Notes                                         |
| -------------------------------- | ------------------------------ | --------------------------------------------- |
| POSIX shared launcher behavior   | `opencode-launcher-common.sh`  | Used by shell launchers                       |
| Windows shared launcher behavior | `opencode-launcher-common.ps1` | Used by `.cmd`/`.ps1` launchers               |
| Install health checks            | `opencode-install-doctor.ts`   | `aiomo doctor install`, `aioc doctor install` |
| Installed context guard entry    | `opencode-context-guard.ts`    | Copied from `src/context-guard/cli.ts`        |
| Installed guard modules          | `context-guard/*.ts`           | Copied from `src/context-guard/`              |

## CONVENTIONS

- Pair user-facing launcher changes across POSIX and Windows unless platform difference is intentional.
- PowerShell files are installed with UTF-8 BOM by `installLaunchers`; preserve Windows behavior.
- Windows install updates user PATH, but current terminals may need restart.
- `aiomo` selects OMO profile and copies matching `opencode.<profile>.json` / OMO sidecars.
- `aioc` selects native profile and excludes `oh-my-openagent` + monitor while keeping shared plugins.
- Do not put TypeScript business implementation here; keep it under `src/` and install/copy it from there.
- Context guard writes local alerts/history/rescue files under `.opencode/` and `.opencode-rescue/` per generated config.
- Doctor output should be actionable: `OK` / `WARN` / `FAIL` with exact missing path/config item.

## VALIDATION

```sh
aiomo doctor install
aioc doctor install
```

When changing generated install artifacts, also run `bun run ai:gen -- --dry-run` from repo root.

## ANTI-PATTERNS

- Do not hard-code user-specific absolute paths outside generated config/bin targets.
- Do not let guard rescue/watch paths drift from `config/global.yaml` and generated sidecars.
- Do not reintroduce `.mjs` context-guard implementation under `bin/`; use `src/context-guard/*.ts`.
- Do not add broad shell advice or README duplication here.
- Do not write credentials, logs, or temporary debug files into `bin/`.
