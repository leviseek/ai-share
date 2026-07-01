---
name: config-profile-tuning
description: Use when tuning Codex profiles, model roles, compaction metadata, fallback behavior, or profile tradeoffs.
---

# Config Profile Tuning

Use this skill when tuning model roles, profile defaults, compaction metadata, fallback chains, or Codex profile tradeoffs.

## Core Files

- `config/profiles.yaml`: profile-level role mapping and profile metadata.
- `config/models.yaml`: model group definitions, provider selection, parameters, limits, and fallback chains.
- `config/global.yaml`: default profile and version requirements.
- `config/profile-eval.yaml`: fixed benchmark tasks and scoring dimensions for profile comparison.

## Tuning Principles

- Keep profiles meaningfully different: cheaper profiles should reduce cost/latency; research/max profiles can spend more on reasoning.
- Prefer role names such as `primary`, `reasoning`, and `fast` in profiles instead of duplicating provider-specific model choices elsewhere.
- Keep provider groups explicit so `--provider-group` can switch concrete providers without editing profile semantics.
- Document any cost, latency, or quality tradeoff in the relevant YAML comment or README section.

## Verification

1. Run `bun run ai:check` after YAML changes.
2. Run `bun run ai:gen -- --dry-run` and inspect generated Codex files.
3. Run `bun run profile:eval -- --tasks project_analysis --profiles coding,max` for planned comparison reports.
4. For builder changes, run `bun run typecheck` and focused tests under `src/config/builders/`.
5. For broad changes, run `bun run check`.

## Trigger Examples

- "调整 balanced profile 的模型角色。"
- "比较 coding 和 max profile 的取舍。"
- "修改 compaction threshold 或 fallback chain。"

## Anti Examples

- "新增一个 native skill 文件。"
- "检查 memory 是否有重复规则。"
- "提交当前改动。"
