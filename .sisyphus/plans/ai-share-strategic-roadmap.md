# ai-share 战略演进路线图

## TL;DR

> **Quick Summary**: 分三阶段将 ai-share 从 OpenCode/OMO 配置仓库演进为本地优先的个人 AI Workspace OS — 先稳核心（记忆收敛、schema 校验、版本锁定），再深能力（memory RAG、成本仪表板、插件自注册），最后平台化（三角色协议、多工具适配器、profile 共享）。
>
> **Deliverables**:
> - 阶段一：单仓库记忆体系、schema/snapshot 校验、锁定兼容版本、schema 合约文档
> - 阶段二：独立 LLM 摘要命令、轻量 memory 检索、插件 manifest 自注册、token/cost 仪表板
> - 阶段三：三角色协议规范、Cursor/Copilot 规则适配器、profile 导入/导出
>
> **Estimated Effort**: XL（三阶段跨越 6 个月，约 30-40 任务）
> **Parallel Execution**: YES — 每个阶段内最大并行，阶段间顺序推进
> **Critical Path**: 记忆收敛 → memory RAG → 三角色协议 → 多平台适配器

---

## Context

### Original Request
用户要求基于前文深度调研结论，按建议的三阶段路线制定长期规划：阶段一夯实核心（2-4 周）、阶段二能力深化（1-2 月）、阶段三平台化探索（3-6 月）。

### Interview Summary
**关键决策**:
- **LLM 辅助救援**：不移入 context guard 运行时，做独立后处理命令 `aiomo summarize ses_xxx --llm`。guard 保持零网络、确定性。
- **记忆整合**：将 ai-memory/stable/* 全部迁移到 ai-share/memory/，保留 4 层生命周期结构。ai-memory 独立仓库归档。生成器不再读取外部路径。
- **测试策略**：新增功能采用 TDD（先写测试再实现），既有代码优先 snapshot 覆盖。
- **语言**：用户可见提示/错误用简体中文，代码标识符、命令、配置字段保持英文。

**调研共识**:
- 不做云同步/SaaS、不做数据库、不做 agent marketplace、不做 IDE 深度插件。
- local-first、config-as-code、文件即存储 是核心差异化，不可动摇。
- 每个阶段产出独立可验证价值，不堆积技术债务。

### Metis Review
**识别到的关键缺口（已处理）**:
- **上下文守卫反模式冲突**：原 Stage 2 提议 LLM 辅助 rescue 与 `src/context-guard/AGENTS.md` 第 55 行硬约束冲突。已决策：LLM 摘要独立为 `aiomo summarize --llm` 命令，不改 guard 运行时。
- **记忆整合目标模糊**：原描述只说"收敛记忆"，未定义具体方案。已决策：全部迁移到 ai-share/memory/，保留 4 层结构。
- **缺失验收标准**：原路线每个任务缺乏可执行验证命令。本计划为每个 TODO 补充 `bun run ai:check`、`bun test`、`bun run typecheck` 等级别验证。
- **scope creep 风险**：memory RAG 可能滑向向量数据库、cost dashboard 可能滑向监控平台。每个任务增加 "Must NOT do" 节锁定边界。
- **Economy profile 边缘情况**：`threshold: 500M` 实际禁用 compaction，需在 profile tuning 和 schema 校验中特殊处理。

---

## Work Objectives

### Core Objective
将 ai-share 从 OpenCode/OMO 配置生成器演进为本地优先的 AI Workspace OS 控制层：统一记忆、上下文治理、模型路由、插件管理，并使核心抽象（三角色 profile）具备跨工具可移植性。

### Concrete Deliverables
- **阶段一输出**：合并后的 `memory/` 目录结构、`docs/schema/*.md` 合约文档、`src/__snapshots__/` snapshot 基线、更新后的 `src/config/builders/opencode.ts` 记忆加载逻辑
- **阶段二输出**：`src/cli/summarize.ts`（LLM 摘要命令）、`src/memory/retrieval.ts`（轻量检索）、`src/cli/costs.ts`（成本报告）、插件 manifest 格式规范
- **阶段三输出**：`docs/spec/role-mapping-v1.md`（三角色协议）、`src/adapters/cursor.ts` 和 `src/adapters/copilot.ts`（平台适配器）、profile 导入/导出 CLI

### Definition of Done
- [ ] 阶段一：`bun run ai:check` 在所有 8 个 profile 上通过（exit 0），32 snapshot 全部匹配，移除外置 ai-memory 后无 regressions
- [ ] 阶段二：`aiomo summarize ses_xxx --llm` 在 fast 模型 5s 内产出摘要，memory 检索 <100ms，`aiomo doctor costs` 正确输出
- [ ] 阶段三：三角色协议文档独立于 OpenCode schema，至少 1 个非 OpenCode 适配器生成有效目标格式

### Must Have
- 所有生成的 config 在已有 OpenCode/OMO 版本上立即可用
- aioc（排除 OMO 的模式）始终可用
- 8 个 profile 全部保持向后兼容
- context guard 运行时保持零网络、确定性

### Must NOT Have (Guardrails)
- **不引入数据库**：SQLite（已有）仅用于读取 session，不新增数据库依赖
- **不引入外部 embedding API**：memory RAG 仅用本地 TF-IDF/关键词匹配
- **不修改 context guard 运行时架构**：LLM 摘要完全独立于 guard pipeline
- **不增加 npm 依赖**（除非 Bun/Node stdlib 无法覆盖，且需单独评估必要性）
- **不创建 agent marketplace、社区平台、Web 服务**
- **不将 Live2D、DingTalk 等趣味/辅助插件提升为主线**
- **不向生成的 config 写入真实 API Key 或凭据**

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES（`bun test` 可用，context-guard 模块可测）
- **Automated tests**: TDD（新功能先写失败测试再实现，既有代码优先 snapshot 覆盖）
- **Framework**: bun test
- **Snapshot 测试**：为生成器输出建立 JSON snapshot 基线（`bun test --update-snapshots`）
- **Fixture 策略**：T6 在建立 snapshot 测试时同步创建最小 SQLite fixture（`src/__tests__/fixtures/sample.db`），供后续 T10/T13/T15 的 QA 场景使用

### QA Policy
每个实现任务包含 agent-executed QA scenarios（Playwright 用于 UI，bash/curl 用于 CLI/API）。

---

## Execution Strategy

### Parallel Execution Waves

```
阶段一 Wave 1（立即可开始 — 基础设施）:
├── T1: 记忆迁移脚本（从 ai-memory 到 ai-share）
├── T2: 更新 memory-loader 移除外部路径依赖
├── T3: 更新 buildInstructionsPaths 单仓库逻辑
├── T4: 文档目录与 schema 合约模板

阶段一 Wave 2（依赖 Wave 1 — 校验与锁定）:
├── T5: YAML schema 业务规则校验器
├── T6: 生成器 JSON snapshot 测试体系
├── T7: 版本兼容性检查（openCode/OMO 版本锁定）
├── T8: 更新 config/global.yaml（新增版本字段）
├── T9: 更新 README + AGENTS 反映记忆结构变化

阶段二 Wave 3（依赖阶段一完成 — 核心能力）:
├── T10: LLM 辅助摘要命令（aiomo summarize --llm）
├── T11: 轻量 memory 关键词检索器
├── T12: 插件 manifest 自注册规范 + 检测器
├── T13: Token/成本仪表板（aiomo doctor costs）
├── T14: memory 检索集成到 instructions 注入管线

阶段二 Wave 4（依赖 Wave 3 — 观测与体验）:
├── T15: 上下文守卫 rescue 摘要质量改进（确定性增强）
├── T16: profile 切换时的 memory 选择性注入
├── T17: 插件 manifest 校验与安全警告
├── T18: 成本仪表板 HTML 输出模式

阶段三 Wave 5（依赖阶段二完成 — 平台化核心）:
├── T19: 三角色模型协议规范文档
├── T20: 协议规范实现（TypeScript 类型 + 验证器）
├── T21: Cursor .cursorrules 适配器
├── T22: GitHub Copilot instructions 适配器
├── T23: Profile 导出命令（aiomo profile export）
├── T24: Profile 导入命令（aiomo profile import）

阶段三 Wave 6（依赖 Wave 5 — 生态与收尾）:
├── T25: Claude Code CLAUDE.md 适配器（可选）
├── T26: profile 导入安全校验（权限/来源审查）
├── T27: 更新 README 反映平台化能力
├── T28: 全部 snapshot 更新与回归验证

阶段 FINAL（所有实现完成后 — 4 并行审查）:
├── F1: 计划合规审计（oracle）
├── F2: 代码质量审查（unspecified-high）
├── F3: 实际 QA 执行（unspecified-high）
└── F4: 范围保真度检查（deep）
```

**Critical Path**: T1 → T2 → T3 → 阶段一完成 → T10/T11 → 阶段二完成 → T19 → T20 → T21/T22/T23/T24 → 阶段三完成 → F1-F4

---

## TODOs

- [x] 1. **记忆迁移脚本：从 ai-memory 迁移到 ai-share/memory/**

  **What to do**:
  - 编写脚本 `src/migration/migrate-ai-memory.ts`，将 `../ai-memory/stable/*.yaml` 和 `../ai-memory/profiles/*.yaml`、`../ai-memory/policies/*.yaml` 复制到 `memory/` 下对应子目录
  - 保留 ai-memory 的 4 层结构：`memory/stable/`、`memory/inferred/`、`memory/runtime/`、`memory/distilled/`、`memory/sync/`
  - `.gitignore` 添加 `memory/runtime/` 和 `memory/sync/`（不提交运行时和同步暂存）
  - 迁移完成后输出统计：迁移文件数、新增目录数、跳过的已有文件数
  - 同时更新 `AI_GUIDELINES.md` 中的记忆相关描述路径

  **Must NOT do**:
  - 不修改源 ai-memory 仓库内容
  - 不自动提交迁移结果
  - 不删除源 ai-memory 仓库（手动归档）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单一脚本任务，文件复制 + 路径处理，逻辑简单
  - **Skills**: [`git-master`]
    - `git-master`: `.gitignore` 规则更新
  - **Skills Evaluated but Omitted**:
    - `ai-share-generator`: 本任务不改 YAML 或生成逻辑

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T2 概念上独立，但 T2 依赖 T1 完成后的目录结构）
  - **Parallel Group**: 阶段一 Wave 1
  - **Blocks**: T2, T3
  - **Blocked By**: None

  **References**:
  - `memory/` 目录现有结构 — 迁移目标位置的现有组织方式，新目录需兼容
  - `../ai-memory/stable/user.yaml` — 核心记忆源文件，理解当前格式
  - `../ai-memory/policies/memory-policy.yaml` — 4 层生命周期定义，迁移后仍需保留此策略
  - `.gitignore` 当前规则 — 需要追加 `memory/runtime/` 和 `memory/sync/` 忽略规则

  **Acceptance Criteria**:
  - [ ] `bun run src/migration/migrate-ai-memory.ts` 在 ai-memory 存在时成功执行
  - [ ] `memory/stable/` 下存在 `user.yaml`、`workflows.yaml`、`devices.yaml`
  - [ ] `memory/profiles/` 下存在 `coding.yaml`、`research.yaml`、`infra.yaml`
  - [ ] `memory/policies/` 下存在 `memory-policy.yaml`
  - [ ] `git status` 显示 migration 新增文件未提交（等待人工确认）

  **QA Scenarios**:
  ```
  Scenario: 迁移 ai-memory stable 文件到 ai-share/memory/
    Tool: Bash (bun)
    Preconditions: ../ai-memory/ 存在且包含 stable/*.yaml
    Steps:
      1. bun run src/migration/migrate-ai-memory.ts
      2. 检查输出含 "迁移完成" 和文件计数
      3. Test-Path -LiteralPath "memory\stable\user.yaml" → True
    Expected Result: 所有 stable/ profiles/ policies/ 文件复制到 memory/ 对应位置
    Failure Indicators: 输出含 "错误" 或文件未出现
    Evidence: .sisyphus/evidence/task-1-migrate-output.txt

  Scenario: ai-memory 不存在时优雅跳过
    Tool: Bash (bun)
    Preconditions: ../ai-memory/ 不存在或已归档
    Steps:
      1. bun run src/migration/migrate-ai-memory.ts
      2. 检查输出含 "ai-memory 未找到，跳过迁移"
    Expected Result: exit code 0，无文件变更
    Evidence: .sisyphus/evidence/task-1-migrate-skip.txt
  ```

  **Commit**: NO（等待人工确认后提交）

---

- [x] 2. **更新 memory-loader 移除外部 ai-memory 路径依赖**

  **What to do**:
  - 修改 `src/loaders/memory-loader.ts`：`profileMemoryMap` 中的路径从 `"stable/user.yaml"` 改为 `"memory/stable/user.yaml"`（相对于 ai-share 仓库根）
  - 修改 `getMemoryFilesForProfile()`：不再拼接 `aiMemoryBase` 外部路径，改为拼接 `projectRoot`
  - 修改 `buildInstructionsPaths()` in `src/config/builders/opencode.ts`：移除 `resolve(projectRoot, "..", "ai-memory")` 外部路径逻辑，所有 memory 文件统一从 `memory/` 目录读取
  - 保留 profile-aware 的选择性加载逻辑（不同 profile 加载不同 memory 文件集）
  - 更新 `src/loaders/memory-compiler.ts`：确保 compileMemory 能处理新路径结构

  **Must NOT do**:
  - 不删除 `getMemoryFilesForProfile` 的 profile 区分逻辑（不同 profile 仍需加载不同文件集）
  - 不改变 memory 文件的内容格式
  - 不移除已存在于 `memory/` 的原有文件（`memory/user/`、`memory/architecture/`、`memory/stack/`）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 路径重构，逻辑清晰，涉及 2-3 个文件
  - **Skills**: [`ai-share-generator`]
    - `ai-share-generator`: 修改 config builder 后需要运行 `ai:check`
  - **Skills Evaluated but Omitted**:
    - `config-diff-auditor`: 本任务不涉及 YAML 变更，不需要 diff

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 T1 完成后的 memory/ 目录结构）
  - **Parallel Group**: 阶段一 Wave 1（可在 T1 确认后立即开始）
  - **Blocks**: T3
  - **Blocked By**: T1

  **References**:
  - `src/loaders/memory-loader.ts:19-58` — `profileMemoryMap` 和 `getMemoryFilesForProfile` 当前实现，需修改路径映射
  - `src/config/builders/opencode.ts:19-79` — `buildInstructionsPaths` 和 `createCompiledMemoryContext` 当前实现，需移除外部 ai-memory 路径
  - `src/loaders/memory-compiler.ts:42-65` — `compileMemory` 函数签名和逻辑
  - `config/profiles.yaml` — 8 个 profile 的定义，用于验证每个 profile 的 memory 加载是否正常

  **Acceptance Criteria**:
  - [ ] `bun run ai:check` 在所有 8 个 profile 上通过（不再输出 ai-memory 未找到 warning）
  - [ ] `bun run typecheck` 通过
  - [ ] 断点验证：`balanced` profile 的 `instructions` 数组仍包含 `memory/stable/user.yaml` 等主要文件
  - [ ] `aioc balanced` 的 instructions 同样包含 memory 文件（aioc 共享同一套记忆）

  **QA Scenarios**:
  ```
  Scenario: 所有 profile 的 memory 加载回归验证
    Tool: Bash (bun)
    Preconditions: T1 迁移完成，memory/ 包含稳定文件
    Steps:
      1. bun run ai:gen -- --dry-run > .sisyphus/evidence/task-2-dry-run.txt
      2. Select-String -Path ".sisyphus/evidence/task-2-dry-run.txt" -Pattern "ai-memory" → 确认无匹配（exit 0 表示无匹配时 Select-String 返回非零）
    Expected Result: dry-run 输出中无 ai-memory 引用
    Evidence: .sisyphus/evidence/task-2-dry-run-output.txt
  ```

  **Commit**: NO（等待阶段一整体确认）

- [x] 3. **更新 buildInstructionsPaths 单仓库逻辑 + 移除双路径**

  **What to do**:
  - 修改 `src/config/builders/opencode.ts` 的 `buildInstructionsPaths()`：移除 `resolve(projectRoot, "..", "ai-memory")` 整段外部路径逻辑
  - `memory/` 下所有文件（原 `memory/user/`、`memory/architecture/`、`memory/stack/` + 新迁移的 `memory/stable/`、`memory/profiles/`、`memory/policies/`）统一从单仓库加载
  - `createCompiledMemoryContext()` 的 `aiMemoryBase` 参数改为 `resolve(projectRoot, "memory")`
  - 更新 `src/generate-user-config.ts` 中 `ensureAiWorkspaceLinks`：若 `../ai-memory` 仍存在，输出提示建议手动归档

  **Must NOT do**: 不删除 profile-aware 逻辑，不改变加载顺序，不把 runtime/sync 层注入 instructions

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: 路径整合，涉及 2 个文件
  - **Skills**: [`ai-share-generator`]

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 T2）
  - **Blocks**: T5
  - **Blocked By**: T2

  **References**:
  - `src/config/builders/opencode.ts:19-60` — buildInstructionsPaths 完整实现
  - `src/generate-user-config.ts:42` — ensureAiWorkspaceLinks 调用点
  - `src/cli/memory-link.ts` — workspace links 实现

  **Acceptance Criteria**:
  - [ ] `bun run ai:gen -- --dry-run` 无任何 ai-memory 相关 warning
  - [ ] 生成的 balanced profile instructions 同时包含 `memory/stable/user.yaml` 和 `memory/user/profile.md`
  - [ ] `bun run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: 移除双路径后所有 profile instructions 完整
    Tool: Bash (bun + pwsh)
    Steps:
      1. bun run ai:gen -- --dry-run > .sisyphus/evidence/task-3-dry-run.txt
      2. $content = Get-Content -Raw ".sisyphus/evidence/task-3-dry-run.txt"; if ($content -match "ai.memory") { exit 1 } else { exit 0 }
    Expected Result: exit 0（不含 ai-memory 引用）
    Evidence: .sisyphus/evidence/task-3-dry-run.txt
  ```

  **Commit**: NO

- [x] 4. **建立 docs/schema/ 合约文档**

  **What to do**:
  - 创建 `docs/schema/` 目录
  - 为每个 `config/*.yaml` 编写 `docs/schema/<name>.md`：`global.md`、`provider.md`、`models.md`、`profiles.md`、`agents.md`
  - 每个包含：字段表（名称/类型/默认值/必填）、有效值范围、示例、与其他文件的联动说明

  **Must NOT do**: 不写设计哲学，不写真实 API Key

  **Recommended Agent Profile**:
  - **Category**: `writing` — Reason: 纯文档，结构化字段参考
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 T1-T3 无依赖）
  - **Blocks**: None
  - **Blocked By**: None

  **References**: `config/global.yaml`、`config/profiles.yaml`、`config/agents.yaml`、`src/types.ts`

  **Acceptance Criteria**:
  - [ ] `docs/schema/` 下 5 个 `.md` 文件存在且非空
  - [ ] 每个文件包含字段表（名称/类型/默认值/必填/说明）

  **QA Scenarios**:
  ```
  Scenario: schema 文档完整性
    Tool: Bash (pwsh)
    Steps:
      1. Get-ChildItem -LiteralPath "docs\schema" -Filter "*.md"
      2. 确认至少 5 个文件
    Expected Result: 5 个 schema 文件存在
    Evidence: .sisyphus/evidence/task-4-schema-list.txt
  ```

  **Commit**: NO

- [x] 5. **YAML schema 业务规则校验器**

  **What to do**:
  - 在 `src/config/validation.ts` 中新增 `validateYamlConsistency()` 函数
  - 校验：所有 profile 必须定义 3 个模型角色（primary/reasoning/fast）
  - 校验：agents/categories 引用的 model 必须在 models.yaml 中存在或在 profile 角色映射中可解析
  - 校验：`default_profile` 指向的 profile 必须存在
  - 校验：`compaction.threshold` 不能超过 `max_input_tokens`
  - 校验：provider group 引用的 provider 必须在 provider.yaml 中定义
  - 在 `src/generate-user-config.ts` 的 `checkOnly` 分支和正常生成前均调用该校验
  - 错误消息用中文，指明具体 YAML 文件和字段路径

  **Must NOT do**:
  - 不引入 JSON Schema 库或其他验证依赖
  - 不做 OpenCode/OMO 在线 schema 校验（已有 `$schema` URL）
  - 校验失败不阻止 `--force` 模式（warn 但继续）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单一模块，纯逻辑校验
  - **Skills**: [`ai-share-generator`]
    - `ai-share-generator`: 修改生成器入口和校验模块

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 T2/T3 完成后的正确 memory 结构，确保校验基线正确）
  - **Parallel Group**: 阶段一 Wave 2
  - **Blocks**: T6（snapshot 测试需要校验通过的基线）
  - **Blocked By**: T3

  **References**:
  - `src/config/validation.ts` — 现有校验函数（`requireRecord`、`requireString`、`requireValue`），新增函数需与此风格一致
  - `config/profiles.yaml` — 8 个 profile 的结构，校验模型角色完整性
  - `config/agents.yaml:13-78` — agents/categories 引用 `primary`/`reasoning`/`fast` 模型角色
  - `config/models.yaml` — 模型定义，校验 agent model 引用有效性
  - `src/generate-user-config.ts:65-77` — `checkOnly` 分支，需要在此加入新校验调用

  **Acceptance Criteria**:
  - [ ] `bun run ai:check` 在正常配置上通过（exit 0）
  - [ ] 故意删除 `profiles.yaml` 中 balanced 的 `reasoning` 角色后，`bun run ai:check` 输出中文错误并 exit 1
  - [ ] 故意指向不存在的 `default_profile` 后，`bun run ai:check` 报错
  - [ ] `--force` 模式下校验失败输出 warning 但继续生成

  **QA Scenarios**:
  ```
  Scenario: 正常配置通过校验
    Tool: Bash (bun)
    Preconditions: 所有 config/*.yaml 处于正常状态
    Steps:
      1. bun run ai:check
    Expected Result: exit 0，输出包含 "校验通过"
    Evidence: .sisyphus/evidence/task-5-check-pass.txt

  Scenario: 缺少模型角色时报错
    Tool: Bash (bun)
    Preconditions: 临时注释 profiles.yaml 中 balanced.reasoning
    Steps:
      1. 临时修改 config/profiles.yaml
      2. bun run ai:check
      3. 恢复 config/profiles.yaml
    Expected Result: exit 1，错误消息包含 "缺少 reasoning" 和 "balanced"
    Evidence: .sisyphus/evidence/task-5-check-fail.txt
  ```

  **Commit**: NO

- [x] 6. **生成器 JSON snapshot 测试体系 + 测试 fixture 基础设施**

  **What to do**:
  - 在 `src/__tests__/snapshots/` 下建立 snapshot 测试基础设施
  - 为每个 profile 的 4 种输出（opencode、aioc、omo、strategy）建立 JSON snapshot：8 profiles × 4 types = 32 snapshots
  - 使用 bun test 的 `expect(value).toMatchSnapshot()` 机制，`bun test --update-snapshots` 更新基线
  - **同步创建测试 fixture**：在 `src/__tests__/fixtures/` 下放置最小 SQLite 数据库（来自已知 session 的 schema 骨架）和示例 `omo-agent-monitor-state.json`（含 2 条模拟 session 记录），供 T10/T13/T15 QA 使用
  - 同时覆盖 context-guard 和 dingtalk-notifier 的输出 snapshot

  **Must NOT do**: 不把 snapshot 测试变成 YAML 变更的门槛，不在 snapshot 中写入真实 API Key

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: 测试基础设施，模式固定
  - **Skills**: [`ai-share-generator`]

  **Parallelization**: NO（依赖 T5 校验通过）| **Blocks**: T9 | **Blocked By**: T5

  **References**: `src/context-guard/*.test.ts`、`src/generate-user-config.ts`、`src/config/builders/opencode.ts`、`https://bun.sh/docs/test/snapshots`

  **Acceptance Criteria**:
  - [ ] `bun test` 包含至少 8 个 snapshot 测试
  - [ ] `bun test --update-snapshots` 生成 snapshot 文件后，`bun test` 全部通过

  **QA Scenarios**:
  ```
  Scenario: snapshot 创建和匹配
    Tool: Bash (bun)
    Steps:
      1. bun test --update-snapshots
      2. bun test → 全部 PASS
    Expected Result: 所有 snapshot 测试通过
    Evidence: .sisyphus/evidence/task-6-snapshot.txt
  ```

  **Commit**: NO

- [x] 7. **版本兼容性锁定：OpenCode/OMO 版本字段**

  **What to do**:
  - 在 `config/global.yaml` 新增 `opencode_min_version` 和 `omo_min_version`
  - 在 `ai:check` 中比较当前安装版本与最低要求，不满足时输出中文 warning
  - `package.json` 所有 devDependencies 改为精确版本（无 `^` 或 `~`）

  **Must NOT do**: 不阻止启动，只 warning

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: 配置字段 + 简单比较
  - **Skills**: [`ai-share-generator`]

  **Parallelization**: YES（与 T5/T6 不冲突）| **Blocked By**: None

  **References**: `config/global.yaml`、`src/cli/registry-check.ts`、`src/cli/output.ts`

  **Acceptance Criteria**:
  - [ ] `config/global.yaml` 含 `opencode_min_version` 和 `omo_min_version`
  - [ ] `bun run ai:check` 输出包含版本检查结果
  - [ ] `package.json` devDependencies 精确版本

  **QA Scenarios**:
  ```
  Scenario: 版本锁定检查
    Tool: Bash (bun)
    Steps:
      1. 确认 config/global.yaml 含 opencode_min_version 字段
      2. bun run ai:check → 含版本信息
    Expected Result: ai:check 显示版本
    Evidence: .sisyphus/evidence/task-7-version.txt
  ```

  **Commit**: NO

- [x] 8. **更新 .gitignore + memory 目录 .gitkeep**

  **What to do**:
  - `.gitignore` 添加 `memory/runtime/` 和 `memory/sync/`
  - `memory/stable/`、`memory/profiles/`、`memory/policies/`、`memory/inferred/`、`memory/distilled/` 下放 `.gitkeep`

  **Must NOT do**: 不忽略整个 memory/

  **Recommended Agent Profile**: `quick` | **Skills**: [`git-master`]

  **Parallelization**: YES | **Blocked By**: T1

  **Acceptance Criteria**: `git status` 显示 stable/profiles/policies 可追踪，runtime/sync 被忽略

  **QA Scenarios**:
  ```
  Scenario: 目录可追踪性验证
    Tool: Bash (git)
    Steps:
      1. git status --short
      2. 确认 memory/stable/ 下的 .gitkeep 出现在 untracked 中
      3. New-Item -ItemType File -Path "memory\runtime\test.txt" -Force
      4. git status --short → 确认 memory/runtime/ 未显示
      5. Remove-Item -LiteralPath "memory\runtime\test.txt"
    Expected Result: stable/profiles/policies 可追踪，runtime/sync 被忽略
    Evidence: .sisyphus/evidence/task-8-gitignore.txt
  ```

  **Commit**: NO

- [x] 9. **更新 README + AGENTS 反映记忆结构变化**

  **What to do**: 移除 README 和 AGENTS.md 中 ai-memory 独立仓库引用，反映单仓库 memory/ 结构

  **Recommended Agent Profile**: `writing` | **Skills**: []

  **Parallelization**: YES | **Blocked By**: T1

  **Acceptance Criteria**: README.md 中无 ai-memory 独立仓库引用

  **QA Scenarios**:
  ```
  Scenario: ai-memory 引用完全移除
    Tool: Bash (pwsh)
    Steps:
      1. Select-String -Path "README.md" -Pattern "ai-memory" → 确认无匹配（或仅有"已迁移到 ai-share/memory/"说明）
      2. Select-String -Path "memory\user\devices.md" -Pattern "ai-memory" → 确认无匹配
      3. Select-String -Path "src\AGENTS.md" -Pattern "ai-memory" → 确认已更新
    Expected Result: 所有文档中独立 ai-memory 仓库引用已移除或更新
    Evidence: .sisyphus/evidence/task-9-readme-scan.txt
  ```

  **Commit**: NO

---

## 阶段二：能力深化（Wave 3-4）

- [x] 10. **LLM 辅助摘要命令 `aiomo summarize --llm`**

  **What to do**:
  - 新建 `src/cli/summarize.ts`，注册为 `aiomo summarize <session-id> [--llm]` 命令
  - 复用 `src/context-guard/rescue.ts` 的 SQLite 读取和 `text-summary.ts` 的消息解析逻辑
  - `--llm` 模式：用 fast 模型调用 OpenCode/OMO 的 LLM API（通过 `bun run opencode run --agent fast "summarize: ..."` 方式），将 rescue 摘要作为 prompt，让模型产出更结构化的摘要
  - 必须加 5s 超时，超时或失败时自动回退确定性摘要
  - 输出写入 `.opencode-rescue/<session-id>-llm.md`

  **Must NOT do**:
  - **绝对不修改 `src/context-guard/` 中的任何文件**
  - 不把 LLM 调用逻辑放入 guard 运行时
  - 不在无 `--llm` 标志时发起任何网络调用

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: 涉及 CLI 命令注册、上下文守卫逻辑复用、LLM 调用和错误处理
  - **Skills**: [`context-guard`]
    - `context-guard`: 理解 rescue 摘要的数据来源和格式

  **Parallelization**: NO（依赖阶段一完成）| **Blocks**: None | **Blocked By**: 阶段一完成

  **References**:
  - `src/context-guard/rescue.ts` — rescue 命令入口和摘要生成逻辑
  - `src/context-guard/text-summary.ts` — 确定性摘要生成器
  - `src/context-guard/db.ts` — SQLite session 读取
  - `src/context-guard/AGENTS.md:55` — "Do not call external models" 约束（本任务不触碰此模块）
  - `bin/aiomo` — launcher 入口，需要注册新子命令

  **Acceptance Criteria**:
  - [ ] `aiomo summarize ses_xxx`（无 --llm）产出确定性摘要
  - [ ] `aiomo summarize ses_xxx --llm` 产出 LLM 增强摘要
  - [ ] LLM 调用超时或失败后自动回退确定性摘要，exit code 仍为 0
  - [ ] `bun run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: summarize 命令存在且处理无效 session
    Tool: Bash (bun)
    Steps:
      1. aiomo summarize --help → exit 0（命令存在）
      2. aiomo summarize ses_nonexistent → exit 1 或输出 "未找到 session"
    Expected Result: 命令可调用，无效 session 优雅报错
    Evidence: .sisyphus/evidence/task-10-deterministic.txt

  Scenario: --llm 模式处理无效 session 回退
    Tool: Bash (bun)
    Steps:
      1. aiomo summarize ses_nonexistent --llm → exit 0（回退确定模式或报错）
      2. 确认输出中无 unhandled exception
    Expected Result: 优雅处理，exit 0
    Evidence: .sisyphus/evidence/task-10-llm.txt
  ```

  **Commit**: NO

- [x] 11. **轻量 memory 关键词检索器**

  **What to do**:
  - 新建 `src/memory/retrieval.ts`：实现 TF-IDF 关键词匹配检索
  - 输入：中文/英文查询字符串
  - 输出：按相关性排序的 memory 文件路径列表（top 5）
  - 检索范围：`memory/stable/`、`memory/profiles/`、`memory/policies/`、`memory/user/`、`memory/architecture/`、`memory/stack/`
  - 预处理：对 YAML 文件做 `parseMemYaml` 后提取所有文本 tokens；对 Markdown 文件提取标题和段落文本
  - 性能：<100ms 完成检索（memory 总量约 50KB）

  **Must NOT do**:
  - 不引入外部 embedding API
  - 不引入向量数据库（Chroma/Pinecone/Weaviate 等）
  - 不把运行时 memory 文件加入索引

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: 算法实现（TF-IDF），需要正确性和性能
  - **Skills**: [`context-compiler`]
    - `context-compiler`: 上下文压缩和文本处理经验相关

  **Parallelization**: NO（依赖阶段一完成）| **Blocks**: T14 | **Blocked By**: 阶段一完成（T1/T2/T3）

  **References**:
  - `src/loaders/memory-compiler.ts:42-65` — `compileMemory` 现有的文件读取和 YAML 解析逻辑
  - `src/loaders/memory-compiler.ts:77-147` — `parseMemYaml` 函数，可在检索中复用
  - `memory/` 目录下的所有 .md 和 .yaml 文件 — 检索语料

  **Acceptance Criteria**:
  - [ ] `import { searchMemory } from "./src/memory/retrieval.ts"` 可用
  - [ ] `searchMemory("proxy")` 返回包含 `proxy` 相关记忆文件
  - [ ] `searchMemory("上下文守卫")` 返回 `memory/stack/opencode.md` 或 `context-guard` 相关文件
  - [ ] 检索完成时间 <100ms（bun test 中验证）

  **QA Scenarios**:
  ```
  Scenario: 关键词检索正确性
    Tool: Bash (bun)
    Steps:
      1. bun test src/memory/retrieval.test.ts
      2. 确认 "proxy" 查询返回包含代理相关记忆
      3. 确认 "profile" 查询返回 models.yaml 相关记忆
    Expected Result: 测试全部 PASS
    Evidence: .sisyphus/evidence/task-11-retrieval-test.txt
  ```

  **Commit**: NO

- [x] 12. **插件 manifest 自注册规范 + 检测器**

  **What to do**:
  - 定义 manifest 格式 `ai-share-plugin.json`（字段：name/version/source_url/permissions/aioc_compatible）
  - 新建 `src/cli/plugin-scanner.ts`：扫描 `plugins/` 下所有含 manifest 的目录
  - 修改 `installPlugins` 从硬编码列表改为自动发现
  - `ai:check` 模式输出扫描到的插件列表，未知插件默认不启用

  **Must NOT do**: 不建远程注册表，不自动安装未启用的插件

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: manifest schema + 安装器重构
  - **Skills**: [`ai-share-generator`、`plugin-vetting`]

  **Parallelization**: NO（依赖阶段一）| **Blocked By**: 阶段一

  **References**: `src/cli/install.ts:65-86`、`plugins/omo-agent-monitor/package.json`、`config/global.yaml:28-35`

  **Acceptance Criteria**:
  - [ ] 为 3 个现有插件各创建 `ai-share-plugin.json`
  - [ ] `bun run ai:check` 输出扫描到的插件列表

  **QA Scenarios**:
  ```
  Scenario: 插件自动发现
    Tool: Bash (bun + pwsh)
    Steps:
      1. bun run ai:check > .sisyphus/evidence/task-12-plugin-scan.txt
      2. Select-String -Path ".sisyphus/evidence/task-12-plugin-scan.txt" -Pattern "omo-agent-monitor" -Quiet; if ($?) { exit 0 } else { exit 1 }
      3. Select-String -Path ".sisyphus/evidence/task-12-plugin-scan.txt" -Pattern "dingtalk-notifier" -Quiet
    Expected Result: 3 个已知插件被检测到
    Evidence: .sisyphus/evidence/task-12-plugin-scan.txt
  ```

  **Commit**: NO

- [x] 13. **Token/成本仪表板 `aiomo doctor costs`**

  **What to do**: 从 OpenCode SQLite 读取 session 的 token 记录（若 SQLite 不含 token，回退读取 `~/.config/opencode/omo-agent-monitor-state.json` 中的 `session.totalTokens`）。按 profile/model 聚合统计，输出终端表格或 `--html` 导出

  **Must NOT do**: 不建实时监控，不持久化成本历史

  **Recommended Agent Profile**: `deep` | **Skills**: [`context-guard`]

  **Parallelization**: YES | **Blocked By**: 阶段一

  **References**: `src/context-guard/db.ts` — session SQLite 读取；`plugins/omo-agent-monitor/server/state.ts` — OMO monitor state 模型含 `totalTokens` 字段；`plugins/omo-agent-monitor/server/tokens.ts` — token 提取逻辑；`config/models.yaml` — 模型定价信息源

  **Acceptance Criteria**: `aiomo doctor costs` 输出含 token 数/成本列的表格

  **QA Scenarios**:
  ```
  Scenario: 成本仪表板使用 fixture 数据
    Tool: Bash (bun + pwsh)
    Preconditions: T6 已生成 src/__tests__/fixtures/omo-agent-monitor-state.json
    Steps:
      1. aiomo doctor costs --state-file src/__tests__/fixtures/omo-agent-monitor-state.json > .sisyphus/evidence/task-13-costs.txt
      2. Select-String -Path ".sisyphus/evidence/task-13-costs.txt" -Pattern "token" -Quiet
    Expected Result: 输出含 token 计数和预估成本
    Evidence: .sisyphus/evidence/task-13-costs.txt

  Scenario: 无 state 文件时优雅处理
    Tool: Bash (bun + pwsh)
    Steps:
      1. aiomo doctor costs --state-file /nonexistent/path.json > .sisyphus/evidence/task-13-costs-empty.txt
      2. Select-String -Path ".sisyphus/evidence/task-13-costs-empty.txt" -Pattern "无.*数据|未找到" -Quiet
    Expected Result: 匹配到优雅提示
    Evidence: .sisyphus/evidence/task-13-costs-empty.txt
  ```

  **Commit**: NO

- [x] 14. **memory 检索集成到 instructions 注入管线**

  **What to do**: 启动器新增 `--task <description>` 参数，调用 T11 检索器将 top 3 相关 memory 注入 instructions 顶部

  **Must NOT do**: 不改变无 `--task` 时的默认行为

  **Recommended Agent Profile**: `deep` | **Skills**: [`ai-share-generator`、`context-compiler`]

  **Parallelization**: NO（依赖 T11）| **Blocked By**: T11

  **References**: `src/config/builders/opencode.ts:19-60`、`src/memory/retrieval.ts`（T11）、`bin/aiomo.ps1`

  **Acceptance Criteria**: `aiomo --task "调试 proxy"` 启动后 instructions 顶部包含 proxy 相关 memory

  **QA Scenarios**:
  ```
  Scenario: --task 参数触发记忆检索
    Tool: Bash (bun + pwsh)
    Preconditions: T11 检索器已实现，可通过 CLI 直接调用
    Steps:
      1. bun -e "import { searchMemory } from './src/memory/retrieval.ts'; console.log(searchMemory('proxy').slice(0,3).join('\n'))" > .sisyphus/evidence/task-14-search.txt
      2. Select-String -Path ".sisyphus/evidence/task-14-search.txt" -Pattern "memory" -Quiet
    Expected Result: 检索输出含 memory 文件路径
    Evidence: .sisyphus/evidence/task-14-search.txt
  ```

  **Commit**: NO

- [x] 15. **上下文守卫 rescue 摘要质量改进（确定性增强）**

  **What to do**: 改进 `text-summary.ts` 输出为五段式结构（目标/进展/关键决策/未解决问题/相关文件），增强 TODO 和决策点提取

  **Must NOT do**: 不调用模型或外部服务

  **Recommended Agent Profile**: `quick` | **Skills**: [`context-guard`]

  **Parallelization**: YES | **Blocked By**: 阶段一

  **References**: `src/context-guard/text-summary.ts`、`src/context-guard/rescue.ts`

  **Acceptance Criteria**: rescue 摘要含五段式结构；`bun test src/context-guard` 通过

  **QA Scenarios**:
  ```
  Scenario: 五段式摘要结构验证（无效 session 路径）
    Tool: Bash (bun)
    Steps:
      1. aiomo rescue ses_nonexistent → exit 1, 检查输出含 "未找到 session"
    Expected Result: 命令正确处理无效输入
    Evidence: .sisyphus/evidence/task-15-missing-session.txt

  Scenario: 单元测试覆盖摘要格式
    Tool: Bash (bun)
    Steps:
      1. bun test src/context-guard/text-summary.test.ts（如不存在先创建基础测试）
      2. 确认测试中包含五段式结构断言
    Expected Result: 测试 PASS
    Evidence: .sisyphus/evidence/task-15-summary-test.txt
  ```

  **Commit**: NO

- [x] 16. **profile 切换时的 memory 选择性注入**

  **What to do**: 更新 `profileMemoryMap` 为每个 profile 定制 memory 文件集（lite 仅 user.yaml，coding 加 coding-philosophy.md，max 全量）

  **Must NOT do**: 不删除 memory 文件

  **Recommended Agent Profile**: `quick` | **Skills**: [`ai-share-generator`]

  **Parallelization**: YES | **Blocked By**: T1/T2

  **Acceptance Criteria**: 不同 profile 的 instructions 文件集不同

  **QA Scenarios**:
  ```
  Scenario: lite profile 仅加载最小记忆集
    Tool: Bash (bun)
    Steps:
      1. bun run ai:gen -- --dry-run
      2. 检查 lite profile 的 instructions 仅含 memory/stable/user.yaml（不含 coding-philosophy.md）
    Expected Result: lite 不含 architecture/ 或 stack/ 下的文件
    Evidence: .sisyphus/evidence/task-16-lite-profile.txt

  Scenario: coding profile 包含代码哲学
    Tool: Bash (bun)
    Steps: 确认 coding profile instructions 含 memory/architecture/coding-philosophy.md
    Expected Result: coding 包含 architecture/ 文件
    Evidence: .sisyphus/evidence/task-16-coding-profile.txt
  ```

  **Commit**: NO

- [x] 17. **插件 manifest 校验与安全警告**

  **What to do**: 扩展 plugin-scanner 读取 permissions 字段，`ai:check` 中输出权限摘要和高权限 ⚠ 标记

  **Must NOT do**: 不自动禁用高权限插件

  **Recommended Agent Profile**: `quick` | **Skills**: [`plugin-vetting`]

  **Parallelization**: YES | **Blocked By**: T12

  **Acceptance Criteria**: `bun run ai:check` 输出每个插件的权限摘要

  **QA Scenarios**:
  ```
  Scenario: 权限摘要输出
    Tool: Bash (bun + pwsh)
    Steps:
      1. bun run ai:check > .sisyphus/evidence/task-17-permission-check.txt
      2. Select-String -Path ".sisyphus/evidence/task-17-permission-check.txt" -Pattern "permissions" -Quiet → 确认有匹配
    Expected Result: 权限摘要正确显示
    Evidence: .sisyphus/evidence/task-17-permission-check.txt

  Scenario: 无 manifest 的插件警告
    Tool: Bash (bun + pwsh)
    Preconditions: 临时移除 dingtalk-notifier/ai-share-plugin.json
    Steps:
      1. bun run ai:check > .sisyphus/evidence/task-17-missing-manifest.txt
      2. Select-String -Path ".sisyphus/evidence/task-17-missing-manifest.txt" -Pattern "缺少 ai-share-plugin.json" -Quiet
      3. 恢复 manifest 文件
    Expected Result: warning 被 Select-String 匹配到
    Evidence: .sisyphus/evidence/task-17-missing-manifest.txt
  ```

  **Commit**: NO

- [x] 18. **成本仪表板 HTML 输出模式**

  **What to do**: `--html` 模式产出纯 HTML+CSS 可视化（token 卡片、按 profile 饼图、按模型柱状图），无外部 JS 依赖

  **Must NOT do**: 不引入 chart.js，不启用 web server

  **Recommended Agent Profile**: `visual-engineering` | **Skills**: []

  **Parallelization**: YES | **Blocked By**: T13

  **Acceptance Criteria**: `aiomo doctor costs --html` 产出可视化 HTML

  **QA Scenarios**:
  ```
  Scenario: HTML 输出有效性
    Tool: Bash (bun)
    Steps:
      1. aiomo doctor costs --html --output .sisyphus/evidence/task-18-costs.html
      2. 确认文件存在且 >500 bytes
      3. Select-String -Path ".sisyphus/evidence/task-18-costs.html" -Pattern "<table" → 含表格
      4. Select-String -Path ".sisyphus/evidence/task-18-costs.html" -Pattern "chart" → 含 CSS 图表
    Expected Result: HTML 含表格和 CSS 可视化元素
    Evidence: .sisyphus/evidence/task-18-costs.html
  ```

  **Commit**: NO

---

## 阶段三：平台化探索（Wave 5-6）

- [x] 19. **三角色模型协议规范文档**

  **What to do**:
  - 编写 `docs/spec/role-mapping-v1.md`
  - 定义 3 个角色语义（primary/reasoning/fast）、模型分配规则、fallback 链、profile→角色映射关系
  - 文档不引用 OpenCode/OMO 具体字段，包含 2 个非 OpenCode 场景示例（Cursor/Claude Code）

  **Must NOT do**: 不引用 OpenCode JSON schema 字段

  **Recommended Agent Profile**: `writing` — Reason: 规范文档 | **Skills**: [`ai-workspace-os-refactor`]

  **Parallelization**: YES（独立）| **Blocked By**: 阶段二完成

  **References**: `config/profiles.yaml`、`config/agents.yaml:13-78`、`memory/architecture/ai-desktop.md:32-41`

  **Acceptance Criteria**: `docs/spec/role-mapping-v1.md` 存在且无 `opencode`/`$schema` 引用

  **QA Scenarios**:
  ```
  Scenario: 协议独立性
    Tool: Bash (pwsh)
    Steps: Get-Content docs/spec/role-mapping-v1.md | Select-String "opencode" → 无匹配
    Expected Result: 文档中立
    Evidence: .sisyphus/evidence/task-19-spec.txt
  ```

  **Commit**: NO

- [x] 20. **协议规范实现：TypeScript 类型 + 验证器**

  **What to do**: 新建 `src/spec/role-mapping.ts`，实现 `exportToRoleMapping(profileId)`、`importFromRoleMapping(spec)`、`validateRoleMapping(spec)`

  **Must NOT do**: 不改变 profiles.yaml 格式

  **Recommended Agent Profile**: `quick` | **Skills**: [`ai-share-generator`]

  **Parallelization**: YES | **Blocked By**: 阶段二完成

  **References**: `src/types.ts`、`config/profiles.yaml`

  **Acceptance Criteria**: `exportToRoleMapping("balanced")` 返回协议格式；`validateRoleMapping` 对不完整 spec 报错

  **QA Scenarios**:
  ```
  Scenario: 导出 balanced profile 为协议格式
    Tool: Bash (bun)
    Steps:
      1. bun -e "import { exportToRoleMapping } from './src/spec/role-mapping.ts'; console.log(JSON.stringify(exportToRoleMapping('balanced'), null, 2))"
      2. 确认输出含 primary/reasoning/fast 三个角色的模型映射
    Expected Result: JSON 含三个角色键
    Evidence: .sisyphus/evidence/task-20-export.txt

  Scenario: 不完整 spec 校验失败
    Tool: Bash (bun)
    Steps:
      1. bun -e "import { validateRoleMapping } from './src/spec/role-mapping.ts'; const r = validateRoleMapping({primary:'gpt-5.5'}); console.log(r.errors)"
      2. 确认输出含 "missing reasoning" 或 "缺少 reasoning"
    Expected Result: 校验返回错误列表
    Evidence: .sisyphus/evidence/task-20-validation.txt
  ```

  **Commit**: NO

- [x] 21. **Cursor .cursorrules 适配器**

  **What to do**: 新建 `src/adapters/cursor.ts`，注册 `aiomo adapter cursor [--profile] [--output]`，生成 `.cursorrules`

  **Must NOT do**: 不生成 hook 脚本

  **Recommended Agent Profile**: `quick` | **Skills**: [`ai-share-generator`]

  **Parallelization**: YES（与 T22 并行）| **Blocked By**: T20

  **References**: `https://cursor.com/docs/rules`、`memory/architecture/coding-philosophy.md`

  **Acceptance Criteria**: `aiomo adapter cursor --profile coding` 产出 `.cursorrules`

  **QA Scenarios**:
  ```
  Scenario: Cursor 规则生成
    Tool: Bash (bun)
    Steps:
      1. aiomo adapter cursor --profile coding --output .sisyphus/evidence/task-21/
      2. 确认 .sisyphus/evidence/task-21/.cursorrules 存在且 >100 bytes
      3. 确认文件含 "coding" 或 "编码" 相关规则
    Expected Result: .cursorrules 含 coding profile 规则
    Evidence: .sisyphus/evidence/task-21-cursor-rules.mdc
  ```

  **Commit**: NO

- [x] 22. **GitHub Copilot instructions 适配器**

  **What to do**: 新建 `src/adapters/copilot.ts`，注册 `aiomo adapter copilot`，生成 `.github/copilot-instructions.md`

  **Must NOT do**: 不生成 CI workflow

  **Recommended Agent Profile**: `quick` | **Skills**: [`ai-share-generator`]

  **Parallelization**: YES（与 T21 并行）| **Blocked By**: T20

  **Acceptance Criteria**: `aiomo adapter copilot` 产出 copilot-instructions.md

  **QA Scenarios**:
  ```
  Scenario: Copilot 指令生成
    Tool: Bash (bun)
    Steps:
      1. aiomo adapter copilot --profile balanced --output .sisyphus/evidence/task-22/
      2. 确认 .sisyphus/evidence/task-22/.github/copilot-instructions.md 存在且 >50 bytes
    Expected Result: copilot-instructions.md 生成
    Evidence: .sisyphus/evidence/task-22-copilot-instructions.md
  ```

  **Commit**: NO

- [x] 23. **Profile 导出命令**

  **What to do**: 注册 `aiomo profile export <name>`，输出自包含 YAML 片段（models/compaction/strategies）

  **Must NOT do**: 不导出全局默认值

  **Recommended Agent Profile**: `quick` | **Skills**: [`ai-share-generator`]

  **Parallelization**: YES | **Blocked By**: T20

  **Acceptance Criteria**: `aiomo profile export coding` 输出完整 profile YAML

  **QA Scenarios**:
  ```
  Scenario: 导出 coding profile
    Tool: Bash (bun)
    Steps:
      1. aiomo profile export coding > .sisyphus/evidence/task-23-coding.yaml
      2. 确认文件含 "models:" "primary:" "reasoning:" 字段
      3. 确认文件不含 api_key 或真实密钥
    Expected Result: 自包含 YAML 片段，无敏感信息
    Evidence: .sisyphus/evidence/task-23-coding.yaml
  ```

  **Commit**: NO

- [x] 24. **Profile 导入命令**

  **What to do**: 注册 `aiomo profile import <url_or_file>`，校验后追加到 `config/profiles.yaml`

  **Must NOT do**: 不自动覆盖同名 profile，不自动生成配置

  **Recommended Agent Profile**: `deep` | **Skills**: [`ai-share-generator`、`plugin-vetting`]

  **Parallelization**: YES（与 T23 并行）| **Blocked By**: T20

  **Acceptance Criteria**: 校验失败拒绝导入并输出中文错误

  **QA Scenarios**:
  ```
  Scenario: 合法 profile 导入
    Tool: Bash (bun)
    Preconditions: 从 T23 导出的合法 YAML 文件存在于 .sisyphus/evidence/task-23-coding.yaml
    Steps:
      1. aiomo profile import .sisyphus/evidence/task-23-coding.yaml
      2. 确认输出含 "已追加" 或 "已导入"
      3. 确认 config/profiles.yaml 末尾有 "# imported from" 注释
    Expected Result: profile 成功追加
    Evidence: .sisyphus/evidence/task-24-import-success.txt

  Scenario: 同名 profile 拒绝
    Tool: Bash (bun)
    Preconditions: 使用与 coding profile 同名的 YAML 片段（可从 T23 导出文件复制并改名为 coding）
    Steps: aiomo profile import .sisyphus/evidence/task-23-coding.yaml → exit code 1, 输出含 "已存在"
    Expected Result: 同名拒绝
    Evidence: .sisyphus/evidence/task-24-import-duplicate.txt
  ```

  **Commit**: NO

- [x] 25. **Claude Code CLAUDE.md 适配器（可选）**

  **What to do**: `aiomo adapter claude` 生成 CLAUDE.md

  **Must NOT do**: 不生成 hooks/MCP 配置

  **Recommended Agent Profile**: `quick` | **Skills**: [`ai-share-generator`]

  **Parallelization**: YES | **Blocked By**: T20

  **QA Scenarios**:
  ```
  Scenario: CLAUDE.md 生成
    Tool: Bash (bun)
    Steps:
      1. aiomo adapter claude --profile balanced --output .sisyphus/evidence/task-25/
      2. 确认 .sisyphus/evidence/task-25/CLAUDE.md 存在且 >50 bytes
    Expected Result: CLAUDE.md 生成
    Evidence: .sisyphus/evidence/task-25-claude.md
  ```

  **Commit**: NO

- [x] 26. **profile 导入安全校验增强**

  **What to do**: 扩展 T24 的 import——校验来源 URL/IP、拒绝含 `exec`/`script`/`command` 等危险字段

  **Recommended Agent Profile**: `deep` | **Skills**: [`plugin-vetting`]

  **Parallelization**: YES | **Blocked By**: T24

  **QA Scenarios**:
  ```
  Scenario: 危险字段被拒绝
    Tool: Bash (bun)
    Steps:
      1. 构造含 "command: rm -rf /" 的恶意 YAML 片段
      2. aiomo profile import <malicious-file> → exit code 1, 输出含 "拒绝" 或 "危险字段"
    Expected Result: 危险导入被拦截
    Evidence: .sisyphus/evidence/task-26-dangerous-reject.txt
  ```

  **Commit**: NO

- [x] 27. **更新 README 反映平台化能力**

  **What to do**: README 新增"平台适配器""profile 导入/导出"节

  **Recommended Agent Profile**: `writing` | **Skills**: []

  **Parallelization**: YES | **Blocked By**: T21-T26 基本完成

  **QA Scenarios**:
  ```
  Scenario: README 包含新章节
    Tool: Bash (pwsh)
    Steps:
      1. Select-String -Path "README.md" -Pattern "平台适配器" → 确认有匹配
      2. Select-String -Path "README.md" -Pattern "profile 导入" → 确认有匹配
    Expected Result: README 含平台化相关章节
    Evidence: .sisyphus/evidence/task-27-readme-check.txt
  ```

  **Commit**: NO

- [x] 28. **全部 snapshot 更新与回归验证**

  **What to do**: `bun test --update-snapshots` + `bun run check` + `bun test`，审查 snapshot diff

  **Must NOT do**: 不跳过失败测试

  **Recommended Agent Profile**: `quick` | **Skills**: [`ai-share-generator`]

  **Parallelization**: NO（依赖所有实现完成）

  **Acceptance Criteria**: `bun run check` exit 0, `bun test` 全部 PASS

  **QA Scenarios**:
  ```
  Scenario: 全量回归通过
    Tool: Bash (bun)
    Steps:
      1. bun test --update-snapshots → 确认无 FAIL
      2. bun run check → 确认 exit 0
      3. bun test → 确认全部 PASS, snapshot matched
    Expected Result: 所有检查通过
    Evidence: .sisyphus/evidence/task-28-full-regression.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present results to user for explicit okay.

**Test Fixture**: 执行前先运行 `bun run ai:gen -- --force` 确保生成环境就绪。对于需要 session 数据的场景，使用 T6 创建的 `src/__tests__/fixtures/` 下的测试 SQLite 数据库和 OMO state JSON。

- [x] F1. **Plan Compliance Audit** — `oracle`
  逐条对照 Must Have/Must NOT Have。每发现违反输出 file:line。
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

  **QA Scenarios**:
  ```
  Scenario: 合规审查执行
    Tool: Bash (bun)
    Steps:
      1. oracle agent 读取 .sisyphus/plans/ai-share-strategic-roadmap.md 中的 Must Have/Must NOT Have 清单
      2. 对每项 Must Have 搜索代码库确认实现存在（grep 目标文件/函数名）
      3. 对每项 Must NOT Have 搜索代码库确认反模式不存在
      4. 输出符合格式的计数报告
    Expected Result: Must Have 全部通过; Must NOT Have 零违反
    Evidence: .sisyphus/evidence/final-f1-compliance.md
  ```

- [x] F2. **Code Quality Review** — `unspecified-high`
  运行 `bun run check` + `bun test`。审查 `as any`/`@ts-ignore`、AI slop、unused imports。
  Output: `Build [PASS/FAIL] | Tests [N/N] | VERDICT`

  **QA Scenarios**:
  ```
  Scenario: 代码质量全面检查
    Tool: Bash (bun)
    Steps:
      1. bun run check → exit 0
      2. bun test → 全部 PASS
      3. 搜索代码库中 @ts-ignore 和 as any → 确认仅存在于有注释说明的边界代码
    Expected Result: 所有 quality gates 通过
    Evidence: .sisyphus/evidence/final-f2-quality.txt
  ```

- [x] F3. **Real Manual QA** — `unspecified-high`
  执行每个阶段的 QA 场景（clean state），验证所有证据文件存在。
  Output: `Scenarios [N/N pass] | VERDICT`

  **QA Scenarios**:
  ```
  Scenario: 全场景 QA 执行
    Tool: Bash (bun) + Playwright（UI 场景）
    Steps:
      1. 遍历计划中所有 T1-T28 的 QA Scenarios
      2. 逐条执行并记录 pass/fail
      3. 确认 .sisyphus/evidence/ 下所有证据文件存在
      4. 输出场景计数和 pass/fail 汇总
    Expected Result: 100% scenarios pass; 所有证据文件可查
    Evidence: .sisyphus/evidence/final-f3-qa-summary.md
  ```

- [x] F4. **Scope Fidelity Check** — `deep`
  逐任务对比 diff vs 计划范围，确保无 scope creep。
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

  **QA Scenarios**:
  ```
  Scenario: 范围保真度验证
    Tool: Bash (git)
    Steps:
      1. git diff 阶段一~三的所有变更文件列表
      2. 对每个变更文件，确认其对应至少一个 TODO 任务的 "What to do" 描述
      3. 列出无对应任务的变更文件（标记为 unaccounted）
    Expected Result: 所有变更文件有对应任务；unaccounted = 0
    Evidence: .sisyphus/evidence/final-f4-scope.txt
  ```

---

## Commit Strategy

每阶段完成后 grouped commit（用户确认后）：

- **阶段一**: `feat: 记忆仓库收敛、schema 校验与 snapshot 测试体系`
- **阶段二**: `feat: LLM 摘要、memory 检索、插件自注册与成本仪表板`
- **阶段三**: `feat: 三角色协议规范与多平台适配器`

---

## Success Criteria

### 阶段一
```bash
bun run check                    # Expected: exit 0
bun test                         # Expected: 全部 PASS（含 snapshot）
bun run ai:gen -- --dry-run     # Expected: 无 ai-memory warning
```

### 阶段二
```bash
aiomo summarize ses_xxx --llm    # Expected: LLM 摘要或优雅回退
bun test src/memory/retrieval.test.ts  # Expected: PASS
aiomo doctor costs               # Expected: 表格输出
```

### 阶段三
```bash
aiomo adapter cursor --profile coding   # Expected: .cursorrules
aiomo adapter copilot --profile balanced # Expected: copilot-instructions.md
aiomo profile export coding             # Expected: 完整 YAML
aiomo profile import .sisyphus/evidence/task-23-coding.yaml  # Expected: 正确校验
```

### Final Checklist
- [ ] 所有 "Must Have" 可验证存在
- [ ] 所有 "Must NOT Have" 未被违反
- [ ] `bun run check` 全面通过
- [ ] 8 个 profile 所有 snapshot 匹配
- [ ] aioc 模式保持可用
- [ ] context guard 保持零网络、确定性







