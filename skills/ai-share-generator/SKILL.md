---
name: ai-share-generator
description: Use when changing config/*.yaml, OpenCode builders, generated OpenCode config, aioc, ai:gen, ai:explain, or ai:check behavior.
---

# AI Share Generator

Use this skill when modifying YAML sources, OpenCode config builders, native skills, launcher installation, or generator CLI behavior.

## Source Of Truth

- `config/global.yaml`: default OpenCode model, provider, and minimum version.
- `config/provider.yaml`: OpenAI-compatible providers and API key env references.
- `config/models.yaml`: upstream model names and optional reasoning effort.
- `config/mcp.yaml`: OpenCode local/remote MCP sources.
- `config/env.yaml`: shared non-secret `aioc` environment; machine-local values use `config/local/env.yaml`.
- `config/agents.yaml`: OpenCode custom agents, mode, prompt, model, and reasoning overrides.
- `config/plugins.yaml`: ordered safe npm package specs or named `git+https` plugin specs.

## Implementation Map

- Orchestration: `src/generate-user-config.ts`.
- Shared preview: `src/generation-preview.ts`.
- OpenCode config: `src/config/builders/opencode.ts`.
- Managed launcher env: `src/config/builders/env.ts`.
- Instruction paths: `src/config/builders/instructions.ts`.
- `aioc` source/install: `bin/aioc.ts`, `src/cli/aioc-install.ts`.
- Output paths and ownership: `src/cli/paths.ts`, `src/cli/generation-plan.ts`.
- Explain report: `src/cli/explain-report.ts`, `src/cli/ai-explain.ts`.
- Transaction and rollback: `src/cli/fs.ts`.

## Workflow

1. Read the relevant YAML, schema spec, builder, and focused tests before editing.
2. Change authoritative sources; never patch generated user config as the durable fix.
3. Update README, schema docs, templates, and project knowledge when interfaces change.
4. Use focused TDD for behavior changes.
5. Run `bun run ai:check`, `bun run schema:check`, `bun run ai:explain -- --json`, `bun run ai:gen -- --dry-run`, and `bun run check` for cross-cutting changes.
6. Validate generated config with `opencode debug config --pure` when the OpenCode shape changes.

## Safety

- Keep secrets as env-var references only; generated providers use `{env:NAME}`.
- Reject plugin URL credentials, query/hash, local paths, `file://`, and secret literals; explain output exposes package IDs only.
- `config/env.yaml` is non-secret and only fills missing process variables through `aioc`.
- `--force` adopts outputs only and never bypasses validation.
- `ai:explain` stays read-only and offline; never expose generated content or env values.
- Keep generation deterministic and avoid external runtime dependencies.

## Trigger Examples

- "修改 config/global.yaml 的默认模型后更新 OpenCode 生成结果。"
- "调整 OpenCode provider 或 MCP builder。"
- "排查 aioc 环境注入或 ai:gen --dry-run。"

## Anti Examples

- "整理一段调试失败经验到 memory。"
- "只查看 git status。"
- "为普通业务代码新增测试。"
