---
name: verification-planner
description: Use when choosing the smallest required and optional verification commands for memory, native skill, config generator, TypeScript CLI, or broad changes.
---

# Verification Planner

Use this skill to plan verification scope before or after a change. It selects checks; it does not run commands unless the user explicitly asks for execution.

## Rules

- Separate **Required Checks** from **Optional Checks**.
- Choose the smallest command set that can prove the changed behavior.
- Include focused tests before broad checks when both are useful.
- Do not run commands, install dependencies, or mutate files unless explicitly requested.
- Mention verification gaps when no automated command can prove the claim.

## Verification Matrix

```text
memory changes:
  required:
    - bun run memory:check
    - bun run memory:lint
  optional:
    - bun run check

native skill changes:
  required:
    - bun run skill:lint
    - bun test src/cli/install.test.ts src/generator-install-contract.test.ts
  optional:
    - bun run ai:gen -- --dry-run
    - bun run check

config/generator changes:
  required:
    - bun run ai:check
    - bun run ai:gen -- --dry-run
  optional:
    - bun run typecheck
    - bun run check

typescript cli changes:
  required:
    - bun run typecheck
    - bun test <focused tests>
  optional:
    - bun run lint
    - bun run check

broad changes:
  required:
    - bun run check
  optional:
    - targeted smoke test for the changed workflow
```

## Output Template

```md
## Verification Plan

### Required Checks

- `<command>` — proves `<claim>`

### Optional Checks

- `<command>` — use when `<condition>`

### Gaps / Manual Checks

- `<gap or none>`
```

## Trigger Examples

- "这次改了 native skill，应该跑哪些验证？"
- "为这个 CLI 改动规划最小测试命令。"
- "区分这批修改的 required checks 和 optional checks。"

## Anti Examples

- "直接运行 bun run check。"
- "实现 skill:lint CLI。"
- "把失败日志沉淀成 memory。"
