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

| Need                           | Location             | Notes                                      |
| ------------------------------ | -------------------- | ------------------------------------------ |
| Cross-platform launcher logic  | `codex.ts`           | Selects generated Codex profile            |
| POSIX entry                    | `codex`              | Invokes `bun codex.ts`                     |
| Windows PowerShell entry       | `codex.ps1`          | Invokes `bun codex.ts` with UTF-8 settings |
| Windows cmd shim               | `codex.cmd`          | Delegates to `codex.ps1`                   |
| Launcher install/copy behavior | `src/cli/install.ts` | Copies launchers and updates PATH          |

## CONVENTIONS

- Pair user-facing launcher changes across POSIX and Windows unless the platform difference is intentional.
- PowerShell files are installed with UTF-8 BOM by `installLaunchers`; preserve Windows behavior.
- `codex` selects a generated Codex profile, copies the matching `.codex-config.json`, and forwards arguments to `codex`.
- Do not hard-code user-specific absolute paths outside generated Codex config and user bin targets.

## VALIDATION

```sh
bun run ai:gen -- --dry-run
codex version
```
