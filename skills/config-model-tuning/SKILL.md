---
name: config-model-tuning
description: Use when tuning the single Codex model, provider group selection, model metadata, fallback behavior, or generated Codex model config.
---

# Config Model Tuning

Use this skill when tuning `config/global.yaml` model selection, `config/models.yaml` metadata, provider group selection, fallback chains, or generated Codex model config.

## Core Files

- `config/global.yaml`: default Codex model and version requirements.
- `config/models.yaml`: model group definitions, provider selection, parameters, limits, and fallback chains.
- `config/provider.yaml`: provider definitions and API key env references.
- `src/config/builders/codex.ts`: generated Codex `config.toml` shape.

## Tuning Principles

- Keep `global.model` explicit and backed by a model ID in `models.yaml`.
- Keep provider groups explicit so `--provider-group` can switch concrete providers without editing model metadata.
- Document any cost, latency, or quality tradeoff in the relevant YAML comment or README section.
- Do not hand-edit generated `CODEX_HOME/config.toml` as a durable fix.

## Verification

1. Run `bun run ai:check` after YAML changes.
2. Run `bun run ai:gen -- --dry-run` and inspect generated Codex files.
3. For builder changes, run `bun run typecheck` and focused tests under `src/config/builders/`.
4. For broad changes, run `bun run check`.

## Trigger Examples

- "把默认模型切到 gpt-5.5-coding。"
- "调整模型 fallback chain。"
- "修改 provider group 或模型参数。"

## Anti Examples

- "新增一个 native skill 文件。"
- "检查 memory 是否有重复规则。"
- "提交当前改动。"
