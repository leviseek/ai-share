# Memory And Skills Execution Plan

本文档把下一阶段 memory、prompt 和 native skills 增强拆成可交给 AI/agent 执行的任务。执行时遵循 `memory/policies/ai-execution-contract.md`：先读上下文，做最小正确改动，修改后验证，不写真实密钥。

## Goal

把 ai-share 的知识库从“可注入的记忆文件”升级为“可维护、可 lint、可评测、可迁移的 AI Runtime 资产”。

## Current Baseline

- memory 治理基础已存在：
  - `memory/policies/ai-execution-contract.md`
  - `memory/policies/memory-lifecycle.md`
  - `bun run memory:lint`
- 原生 skills 当前由 `src/cli/native-skills.ts` 中的字符串定义，并由生成器安装到 Codex skills 目录。
- 已有新增 skills：
  - `memory-curator`
  - `failure-distiller`

## Phase 1 — Skills Source Directory

目标：把 native skills 从 TypeScript 字符串迁移到仓库内标准 skill 源目录。

### Implementation

新增目录：

```text
skills/
├── git-master/
│   └── SKILL.md
├── ai-share-generator/
│   └── SKILL.md
├── config-profile-tuning/
│   └── SKILL.md
├── context-compiler/
│   └── SKILL.md
├── memory-curator/
│   └── SKILL.md
├── failure-distiller/
│   └── SKILL.md
├── prompt-lint/
│   └── SKILL.md
└── release-commit/
    └── SKILL.md
```

修改：

- `src/cli/native-skills.ts`
  - 从 `skills/*/SKILL.md` 读取 skill 内容。
  - 导出与当前一致的 `NATIVE_SKILLS` 结构。
  - 保留 `nativeSkillNames()` 对外契约。
- `src/cli/install.ts`
  - 不改变安装行为，只消费新的 `NATIVE_SKILLS` 来源。

### Acceptance Criteria

- `bun run ai:gen -- --dry-run` 输出仍包含所有 native skills。
- runtime manifest 的 `managed.skills` 仍包含全部 skill 名称。
- 旧测试通过，不需要用户手动迁移 Codex 目录。

### Verification

```sh
bun test src/cli/install.test.ts src/generator-install-contract.test.ts
bun run ai:gen -- --dry-run
bun run check
```

## Phase 2 — `skill:lint`

目标：让 skills 像 memory 一样可检查，避免触发模糊、结构漂移和上下文膨胀。

### Implementation

新增：

```text
src/cli/skill-lint.ts
src/cli/skill-lint.test.ts
```

新增 package script：

```json
{
  "skill:lint": "bun run ./src/cli/skill-lint.ts"
}
```

并把 `skill:lint` 加入 `bun run check`。

### Rules

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

### Acceptance Criteria

- 现有 skills 全部通过 `skill:lint`。
- 新增 tests 覆盖 error、warning 和 clean fixture。
- `bun run check` 包含 `skill:lint` 且通过。

### Verification

```sh
bun test src/cli/skill-lint.test.ts
bun run skill:lint
bun run check
```

## Phase 3 — `project-onboarding` Skill

目标：进入新项目时快速建立项目地图，降低每次重新探索成本。

### Implementation

新增：

```text
skills/project-onboarding/SKILL.md
```

触发场景写入 frontmatter `description`：

- 用户要求分析新项目。
- 用户要求找构建、测试、入口、生成文件或风险区。
- 用户要求先熟悉仓库再计划修改。

输出模板：

```md
## Project Map

- Runtime:
- Package manager:
- Entry points:
- Config source of truth:
- Generated files:
- Test commands:
- Risk zones:
- Local rules:
- Next files to inspect:
```

### Acceptance Criteria

- skill 包含 3 个 Trigger Examples 和 3 个 Anti Examples。
- `skill:lint` 通过。
- `ai:gen -- --dry-run` 显示会安装 `project-onboarding`。

### Verification

```sh
bun run skill:lint
bun run ai:gen -- --dry-run
bun run check
```

## Phase 4 — `verification-planner` Skill

目标：根据改动类型选择最小验证命令，减少漏测和过度验证。

### Implementation

新增：

```text
skills/verification-planner/SKILL.md
```

内置验证矩阵：

```text
memory changes:
  - bun run memory:check
  - bun run memory:lint

native skill changes:
  - bun run skill:lint
  - bun test src/cli/install.test.ts src/generator-install-contract.test.ts

config/generator changes:
  - bun run ai:check
  - bun run ai:gen -- --dry-run

typescript cli changes:
  - bun run typecheck
  - bun test <focused tests>

broad changes:
  - bun run check
```

### Acceptance Criteria

- skill 输出必须区分 required checks 和 optional checks。
- skill 不主动运行命令，只规划验证，除非用户要求执行。
- `skill:lint` 通过。

### Verification

```sh
bun run skill:lint
bun run ai:gen -- --dry-run
bun run check
```

## Phase 5 — Distilled Memory Template

目标：让 `failure-distiller` 产出的候选记忆格式稳定、可检索、可审查。

### Implementation

新增：

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

更新：

- `skills/failure-distiller/SKILL.md`
  - 要求输出候选条目时遵循该模板。
  - 未经用户确认时标记为 candidate，不直接写入 `memory/distilled/`。

### Acceptance Criteria

- `memory:lint` 通过。
- `failure-distiller` 明确引用模板路径。
- 不把真实日志、secret 或完整聊天记录写入 template。

### Verification

```sh
bun run memory:check
bun run memory:lint
bun run skill:lint
bun run check
```

## Phase 6 — `memory:eval`

目标：在 lint 之外验证 memory 注入和检索行为是否符合预期。

### Implementation

新增：

```text
src/cli/memory-eval.ts
src/cli/memory-eval.test.ts
config/memory-eval.yaml
```

首版只做离线评测，不调用模型：

- 检查 `ai-execution-contract.md` 和 `memory-lifecycle.md` 是否注入基础 instructions。
- 检查 task-based retrieval 能命中相关 memory。
- 检查 profile-specific memory 顺序稳定。
- 检查新增 skills 出现在 runtime manifest 的 `managed.skills`。

### Acceptance Criteria

- `memory:eval` 默认不访问网络。
- 评测失败返回非零退出码。
- 输出包含 pass/fail、任务名和失败原因。

### Verification

```sh
bun test src/cli/memory-eval.test.ts
bun run memory:eval
bun run check
```

## Recommended Execution Order

1. Phase 1：skills 源目录化。
2. Phase 2：新增 `skill:lint` 并加入 `check`。
3. Phase 3：新增 `project-onboarding`。
4. Phase 4：新增 `verification-planner`。
5. Phase 5：新增 distilled memory template。
6. Phase 6：新增 `memory:eval`。

每个 phase 单独提交，提交格式遵循 `GIT_COMMIT_GUIDELINES.md`。
