# bin/

## OVERVIEW

Installable `aiomx` launcher wrappers copied by `src/cli/install.ts` into the user's bin directory.

## STRUCTURE

```text
bin/
├── aiomx
├── aiomx.cmd
├── aiomx.ps1
└── aiomx.ts
```

## WHERE TO LOOK

| Need                           | Location             | Notes                                      |
| ------------------------------ | -------------------- | ------------------------------------------ |
| Cross-platform launcher logic  | `aiomx.ts`           | Selects generated Codex/OMX profile        |
| POSIX entry                    | `aiomx`              | Invokes `bun aiomx.ts`                     |
| Windows PowerShell entry       | `aiomx.ps1`          | Invokes `bun aiomx.ts` with UTF-8 settings |
| Windows cmd shim               | `aiomx.cmd`          | Delegates to `aiomx.ps1`                   |
| Launcher install/copy behavior | `src/cli/install.ts` | Copies launchers and updates PATH          |

## CONVENTIONS

- Pair user-facing launcher changes across POSIX and Windows unless the platform difference is intentional.
- PowerShell files are installed with UTF-8 BOM by `installLaunchers`; preserve Windows behavior.
- `aiomx` selects a generated Codex/OMX profile, copies the matching `.omx-config.json`, and forwards arguments to `omx`.
- Do not hard-code user-specific absolute paths outside generated Codex config and user bin targets.

## VALIDATION

```sh
bun run ai:gen -- --dry-run
aiomx version
```
