# bin/

## OVERVIEW

No custom launchers are installed; use Codex CLI directly.

## STRUCTURE

```text
bin/
├── codex
├── codex.cmd
├── codex.ps1
└── codex.ts
```

## WHERE TO LOOK

| Need                           | Location             | Notes                                       |
| ------------------------------ | -------------------- | ------------------------------------------- |
| Legacy launcher logic          | `codex.ts`           | Kept for compatibility; not installed       |
| POSIX entry                    | `codex`              | Legacy wrapper                              |
| Windows PowerShell entry       | `codex.ps1`          | Legacy wrapper with UTF-8 settings          |
| Windows cmd shim               | `codex.cmd`          | Delegates to `codex.ps1`                    |
| Launcher install/copy behavior | `src/cli/install.ts` | Currently does not install custom launchers |

## CONVENTIONS

- Prefer direct Codex CLI usage over custom launchers.
- Do not hard-code user-specific absolute paths outside generated Codex config and user bin targets.

## VALIDATION

```sh
bun run ai:gen -- --dry-run
codex version
```
