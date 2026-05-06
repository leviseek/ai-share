# src/context-guard/

## OVERVIEW

Runtime guard used by `aiomo`/`aioc` launchers to inspect OpenCode sessions, block risky resumes, create local rescue summaries, and watch active sessions for context/zero-output risk.

## STRUCTURE

```text
context-guard/
├── cli.ts            # installed as opencode-context-guard.ts
├── check.ts          # pre-resume token risk gate
├── watch.ts          # live watcher, alert/history writer, process stopper
├── rescue.ts         # local markdown rescue summary
├── handoff.ts        # handoff summary command
├── db.ts             # OpenCode SQLite readers
├── risk.ts           # threshold decisions and diagnostics
├── config.ts         # guard/strategy/profile sidecar readers
├── process.ts        # process liveness/termination helpers
├── text-summary.ts   # deterministic local summarizer
└── *.test.ts         # Bun tests for check/watch behavior
```

## WHERE TO LOOK

| Need                        | File                                         | Notes                                             |
| --------------------------- | -------------------------------------------- | ------------------------------------------------- |
| CLI command dispatch        | `cli.ts`                                     | `check`, `rescue`, `handoff`, `watch`             |
| Resume blocking logic       | `check.ts`                                   | Reads session tokens, honors `--force`            |
| Watch alerts/history        | `watch.ts`                                   | Writes `alert.json` + timestamped JSONC snapshots |
| Session/token reads         | `db.ts`                                      | SQLite schema assumptions live here               |
| Risk thresholds             | `risk.ts`                                    | `safe` / `warning` / `danger` / `blocked`         |
| Config defaults and ignores | `config.ts`                                  | Mirrors `config/global.yaml` generated sidecars   |
| Rescue/handoff text output  | `rescue.ts`, `handoff.ts`, `text-summary.ts` | Local-only summaries; no model call               |

## CONVENTIONS

- User-facing console output is Chinese; command names, env vars, and file names stay English.
- `check` returns numeric exit codes: `0` allow, `10` block, `2` bad invocation.
- `watch` must keep running cheaply; catch per-loop failures and write `watch-error` instead of crashing silently.
- Alert/history paths come from generated guard config; do not hard-code `.opencode/` variants in logic.
- Rescue and handoff summaries are deterministic local extraction from SQLite messages, not LLM-generated text.
- Tests use Bun and should cover launcher argument parsing, force behavior, watcher history, and zero-output cases.

## VALIDATION

```sh
bun test src/context-guard
bun run typecheck
bun run ai:check
```

## ANTI-PATTERNS

- Do not call external models or network services from guard runtime.
- Do not print or persist full sensitive prompts/tool payloads when a short local summary is enough.
- Do not weaken block thresholds in code; tune `config/global.yaml` and generated sidecars instead.
- Do not assume SQLite fields are present without defensive parsing.
- Do not kill unrelated processes; `watch.ts` must target the launcher parent process tree only.
