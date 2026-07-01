---
name: ai-share-generator
description: Use when changing config/*.yaml, Codex builders, generated Codex config, ai:gen, or ai:check behavior.
---

# AI Share Generator

Use this skill when modifying YAML source files, Codex config builders, generated Codex config shape, native skills, launchers, or generator CLI behavior.

## Source Of Truth

- `config/global.yaml`: default Codex model and version requirements.
- `config/provider.yaml`: provider definitions and API key env references.
- `config/models.yaml`: model catalog and provider groups.
- `config/mcp.yaml`: Codex MCP server definitions.
- `config/env.yaml`: non-secret Codex .env runtime variables such as local proxy settings.

## Implementation Map

- Orchestration: `src/generate-user-config.ts`.
- Codex config: `src/config/builders/codex.ts`.
- Codex .env config: `src/config/builders/env.ts`.
- Instruction paths: `src/config/builders/instructions.ts`.
- Output paths: `src/cli/paths.ts`.
- Install behavior: `src/cli/install.ts`.

## Workflow

1. Read the relevant YAML and builder before editing.
2. Make the smallest durable source change; do not patch generated user config as the fix.
3. If schema or behavior changes, update README or project knowledge.
4. Add or update focused tests near the builder/runtime when possible.
5. Run `bun run ai:check`, `bun run ai:gen -- --dry-run`, and `bun run check` for cross-cutting changes.
6. Run `bun run memory:check` when touching memory privacy layers or generated instruction sources.

## Safety

- Keep secrets as env-var names only.
- Do not add external runtime dependencies unless Bun/Node APIs cannot meet the need.
- Keep generated config reproducible from repository sources.

## Trigger Examples

- "修改 config/global.yaml 的默认模型后更新生成器行为。"
- "调整 Codex config builder 输出。"
- "排查 ai:gen --dry-run 的生成结果。"

## Anti Examples

- "整理一段调试失败经验到 memory。"
- "只查看 git status。"
- "为普通业务代码新增测试。"
