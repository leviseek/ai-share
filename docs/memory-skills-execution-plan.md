# Memory And Skills Execution Plan

本文档记录 ai-share 的 memory、prompt 和 native skills 运行资产规划。执行时遵循 `memory/policies/ai-execution-contract.md`：先读上下文，做最小正确改动，修改后验证，不写真实密钥。

## Goal

把 ai-share 的知识库维护为可 lint、可评测、可迁移的 AI Runtime 资产，同时避免 native skills 与 Codex/GPT 内置能力过度重叠。

## Current Baseline

- memory 治理基础已存在：
  - `memory/policies/ai-execution-contract.md`
  - `memory/policies/memory-lifecycle.md`
  - `bun run memory:check`
  - `bun run memory:lint`
  - `bun run memory:eval`
- 原生 skills 从仓库内标准 skill 源目录 `skills/*/SKILL.md` 读取，并由生成器安装到 Codex skills 目录。
- 激进精简后只保留 3 个项目专用 skills：
  - `ai-share-generator`
  - `memory-curator`
  - `failure-distiller`

## Skills Source Directory

当前目录结构：

```text
skills/
├── ai-share-generator/
│   └── SKILL.md
├── failure-distiller/
│   └── SKILL.md
└── memory-curator/
    └── SKILL.md
```

实现约束：

- `src/cli/native-skills.ts` 从 `skills/*/SKILL.md` 动态读取 skill 内容。
- `src/cli/install.ts` 不改变安装行为，只消费 `NATIVE_SKILLS` 来源。
- 新增或恢复 skill 时必须先确认其与 Codex 内置能力、插件和 `AGENTS.md` 规则没有明显重叠。

验收标准：

- `bun run ai:gen -- --dry-run` 输出的 runtime manifest 只包含当前保留的 native skills。
- `bun run skill:lint` 通过。
- `bun test src/cli/install.test.ts src/generator-install-contract.test.ts` 通过。

## Skill Lint

`skill:lint` 继续作为 native skills 的质量门禁。

Error：

- `skills/*/SKILL.md` 缺失。
- frontmatter 缺少 `name` 或 `description`。
- `name` 与目录名不一致。
- frontmatter 出现 `name`、`description` 之外的字段。
- `SKILL.md` 含疑似明文 secret。

Warning：

- `description` 太短或没有明确触发语义。
- 缺少 `Trigger Examples` 或 `Anti Examples`。
- `SKILL.md` 超过 500 行。
- skill 目录含 `README.md`、`CHANGELOG.md`、`INSTALLATION_GUIDE.md` 等非必要文档。

验证：

```sh
bun test src/cli/skill-lint.test.ts
bun run skill:lint
bun run check
```

## Distilled Memory Template

`failure-distiller` 产出的候选记忆格式应保持稳定、可检索、可审查。

模板路径：

```text
memory/distilled/TEMPLATE.md
```

模板内容：

```md
---
source: session-distilled
confirmed_by_user: true
created_at: YYYY-MM-DD
review_after: YYYY-MM-DD
scope: global
confidence: high
---

# Pattern

## Root Cause

## Bad Fixes

## Correct Fix

## Detection

## Prevention

## Evidence
```

验收标准：

- `memory:lint` 通过。
- `failure-distiller` 明确引用模板路径。
- 不把真实日志、secret 或完整聊天记录写入 template。

验证：

```sh
bun run memory:check
bun run memory:lint
bun run skill:lint
bun run check
```

## Memory Eval

`memory:eval` 在 lint 之外验证 memory 注入和检索行为是否符合预期。

首版只做离线评测，不调用模型：

- 检查 `ai-execution-contract.md` 和 `memory-lifecycle.md` 是否注入基础 instructions。
- 检查 task-based retrieval 能命中相关 memory。
- 检查 stable memory 顺序稳定。
- 检查当前 native skills 出现在 runtime manifest 的 `managed.skills`。

验证：

```sh
bun test src/cli/memory-eval.test.ts
bun run memory:eval
bun run check
```

## Recommended Execution Order

1. 修改 skills 源目录后先跑 `bun run skill:lint`。
2. 修改 memory 后先跑 `bun run memory:check` 和 `bun run memory:lint`。
3. 修改生成器或安装逻辑后跑 `bun run ai:gen -- --dry-run`。
4. 交付前根据影响范围补跑 focused tests 或 `bun run check`。
