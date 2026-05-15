
## 2026-05-15: 记忆迁移脚本（migrate-ai-memory.ts）

**任务**: 从 ../ai-memory 迁移到 i-share/memory/ 的 4 层记忆目录结构。

**实现细节**:
- 脚本路径: src/migration/migrate-ai-memory.ts
- 使用 
ode:fs/promises 纯标准库，无外部依赖
- 使用 import.meta.url + ileURLToPath 计算 __dirname（兼容 Bun）
- 目录创建用 mkdir(dir, { recursive: true }) — 已存在时不报错，通过 EEXIST 判断
- 文件复制用 stat(dest) 检查存在性 + copyFile(src, dest)
- .gitignore 更新用逐行读取 + Set 判重
- 用户界面消息使用中文，代码标识符使用英文

**新增目录**:
- memory/stable/ — 已确认的用户事实（不可变）
- memory/profiles/ — 场景 profile（coding, research, infra）
- memory/policies/ — 记忆治理策略
- memory/inferred/ — AI 推断模式（待人工审核）
- memory/distilled/ — 精炼后的知识
- memory/runtime/ — 运行时状态（gitignored）
- memory/sync/ — 跨设备同步状态（gitignored）

**注意点**:
- .gitignore 已有 46 行规则，新规则追加在文件末尾
- 不忽略整个 memory/，只忽略 untime/ 和 sync/ 子目录
- 脚本幂等：第二次运行跳过所有已存在的文件
- ../ai-memory 不存在时脚本优雅退出（exit 0，打印提示）
- memory/link.ts 使用 
ode:fs/promises 模式，本脚本沿用

**验证结果**:
- un run src/migration/migrate-ai-memory.ts 成功
- 首次运行: 7 文件复制，7 目录创建，5 .gitkeep 写入
- 二次运行: 7 文件跳过（幂等验证）
- bun run typecheck 通过（tsc --noEmit 无错误）

## 2026-05-15: memory-loader 移除外部 ai-memory 路径依赖

**任务**: 修改 `src/loaders/memory-loader.ts`，移除对外部 `../ai-memory` 的路径依赖，所有 memory 文件路径相对于 projectRoot + `memory/` 前缀解析。

**改动**:
- `profileMemoryMap` 路径从 `"stable/user.yaml"` 风格改为 `"memory/stable/user.yaml"` 风格（相对于 projectRoot）
- `getMemoryFilesForProfile()` 参数 `aiMemoryBase` 改为 `projectRoot`
- 删除了 `defaultMemoryFiles` 常量，回退值使用内联 `["memory/stable/user.yaml"]`
- JSDoc 注释更新为反映单仓库 memory 路径用法

**注意事项**:
- 函数签名参数名变更不会破坏调用侧（TypeScript 按位置传参），T3 会更新 opencode.ts 调用者
- `existsSync` 检查保留作为优雅回退
- 配置文件格式和映射逻辑不变

**验证结果**:
- `bun run typecheck` 通过
- `bun run ai:check` 通过（配置检查通过，无 ai-memory 相关警告）

## 2026-05-15: docs/schema/ 合约文档

**任务**: 创建 `docs/schema/` 目录，为 5 个 YAML 配置文件撰写 schema 合约文档。

**实现细节**:
- 目录: `docs/schema/`
- 文件 5 个: `global.md`, `provider.md`, `models.md`, `profiles.md`, `agents.md`
- 每文件包含: Overview、Fields 表（Field/Type/Default/Required/Description）、Valid Values、Examples、Cross-File References
- 字段表使用英文字段名、中文描述，与 YAML 风格一致
- dot notation 表示嵌套字段（如 `compaction.threshold`）
- 类型信息从 `src/types/yaml.ts`、`src/types/omo.ts`、`src/types/opencode.ts` 提取

**关键字段覆盖**:
- `global.md`: 全部 50+ 字段，含 context_guard/dingtalk_notifier/compaction/dcp/checkpoint/memory
- `provider.md`: 4 个 providers，每个 8 字段
- `models.md`: 8 个 models，每个 12+ 字段含 capabilities/cost/limits/parameters/fallback
- `profiles.md`: 8 个 profiles，每个含 models/compaction/strategies（opencode + oh_my_openagent）
- `agents.md`: 11 个 agents + 8 个 categories + runtime_fallback/background_task/dcp/checkpoint/memory/tmux

**数据验证**:
- 所有 Cross-File References 指向实际存在的 YAML 文件
- profile 模型映射表与 `models.yaml` 中的模型 ID 一致
- agent/category 角色分配与 `agents.yaml` 一致

## 2026-05-15: buildInstructionsPaths 移除外部 ai-memory 路径

**任务**: 修改 `src/config/builders/opencode.ts`，完全移除 `buildInstructionsPaths()` 中对外部 `../ai-memory` 的引用，所有 memory 文件从单仓库 `memory/` 目录加载。

**改动**:
- `src/config/builders/opencode.ts`:
  - 移除 `import { existsSync }` 和 `import { compileMemory }`（均不再使用）
  - 移除 `const aiMemoryBase = resolve(projectRoot, "..", "ai-memory")`
  - 移除条件分支：`profile ? getMemoryFilesForProfile(profile, aiMemoryBase) : existsSync(aiMemoryBase) ? [...] : []`
  - 移除 `createCompiledMemoryContext()` 调用和整函数定义
  - **保留** `getMemoryFilesForProfile(profile, projectRoot)` — 传入 `projectRoot` 后自动解析 `memory/stable/`、`memory/profiles/`、`memory/policies/` 下的 profile-specific 文件
- `src/generate-user-config.ts`:
  - 新增 `import { existsSync } from "node:fs"` 和 `import { color } from "./cli/color.ts"`
  - 在 `ensureAiWorkspaceLinks` 后添加 deprecation 检查：如果 `../ai-memory` 仍存在，打印黄色警告提示用户手动归档

**验证结果**:
- `bun run typecheck` 通过（tsc --noEmit 无错误）
- `bun run ai:check` 通过
- `bun run ai:gen -- --force` 执行成功，deprecation notice 正确输出
- 生成的 balanced profile instructions 确认：
  - 包含 `memory/user/profile.md`、`memory/stable/user.yaml` 等单仓库路径
  - 无 `D:\ai-memory\...` 路径
  - 无 `# compiled memory context` 条目

**注意事项**:
- `prettier --check` 失败来自 `docs/schema/*.md`、`memory/profiles/*.yaml` 和 `memory/stable/workflows.yaml`（均为 pre-existing 问题，非本次改动引入）
- `color` 和 `existsSync` 导入未经 `isolatedDeclarations` 限制，无需额外声明文件

## T9 - 更新 README + AGENTS 反映记忆结构变化

### 完成时间
2026-05-15

### 变更摘要
- **README.md**: 
  - 更新了 memory/ 目录树结构，从原来的 3 个子目录改为 10 个子目录（user, architecture, stack, stable, profiles, policies, inferred, distilled, runtime, sync）
  - 替换了 ai-memory 工作区链接段落，改为说明 memory/ 已完全整合到本仓库内，不再需要独立 ai-memory 仓库
- **src/cli/memory-link.ts**: 
  - 为 nsureAiMemoryWorkspaceLink 添加了 JSDoc @deprecated 注释，说明 ai-memory 已废弃

### 无需修改的文件
- 所有 AGENTS.md 文件均不包含 ai-memory 引用，无需修改
- 无 src/config/builders/AGENTS.md 文件
- 函数 nsureAiMemoryWorkspaceLink 保留不动（仅添加了 doc comment）

### 验证
- `bun run format:check` - 修改的文件无格式问题（仅有预存问题在其他文件）
- lsp_diagnostics on src/cli/memory-link.ts - clean

## 2026-05-15: Task 7 - Version Compatibility Locking

**Completed**: Added version compatibility fields to config/global.yaml + version checking in ai:check + locked devDependencies.

### Changes
- `config/global.yaml`: Added `opencode_min_version: 0.23.0` and `omo_min_version: 3.17.5` after `default_profile`
- `src/types/yaml.ts`: Added `opencode_min_version?: string` and `omo_min_version?: string` to `GlobalYaml`
- `src/cli/registry-check.ts`: Added `checkVersions()`, `VersionCheckResult` type, `getInstalledVersion()`, `semverGte()` — reads installed versions from `node_modules/{pkg}/package.json`, simple semver comparison (no npm dependency), unknown versions treated as passing (warn-only)
- `src/generate-user-config.ts`: Imported `checkVersions`, added version output block in `checkOnly` branch with color-coded pass/warn messages
- `package.json` + `bun.lock`: All devDependencies locked to exact versions (removed `^`)

### Verification
- `bun run typecheck` — ✅ passes (0 errors)
- `bun run ai:check` — exits with code 1 (pre-existing: `models.yaml` references `provider_group: gpt` but no `gpt` in `provider.yaml` — from T3 validation, not this task)
- Pre-existing `bun run ai:check` failure has no effect on version check logic correctness

### Notes
- Version check is warn-only, does NOT block startup on mismatch
- No npm semver dependency — uses simple split/compare
- `getInstalledVersion` reads from `node_modules/{pkg}/package.json` relative to `pluginDir/..`
- The `color` import was already added to `generate-user-config.ts` in T3 (buildInstructionsPaths cleanup), so I didn't need to add it

## 2026-05-15: T5 - YAML Schema Business Rule Validator

**Task**: Add `validateYamlConsistency()` in `src/config/validation.ts` and integrate into `ai:check` + normal generation.

### Key learnings
- Provider groups (`gpt`, `deepseek`) in `models.yaml` are **logical group names**, not direct keys in `provider.yaml`. Individual providers are `codexapis`, `packyapi`, `deepseek` etc. The validation must check against the known group names, not against `providersConfig.providers`.
- The `ProfileYaml` type is `Record<string, AgentProfileSource>`, so `Object.entries()` iterates over profile IDs.
- `compaction` field in profiles is optional — need `undefined` checks before accessing `threshold`/`max_input_tokens`.
- Economy profile intentionally has `threshold: 500000000`, `max_input_tokens: 1000000000` — these are valid (threshold ≤ max_input_tokens).
- Two integration points in `generate-user-config.ts`:
  1. `checkOnly` branch: before `printCheckSummary`, use `process.exit(1)` on failure
  2. Normal generation path: after registry-mismatch check, use `throw new Error(...)` on failure
- `--force` flag: warn but continue on validation failure.
- ESLint `@typescript-eslint/prefer-optional-chain` requires optional chaining (`compaction?.threshold !== undefined`) instead of `compaction && compaction.threshold !== undefined`.

### Verification
- `bun run typecheck` — ✅ passes
- `bun run ai:check` — ✅ passes (配置检查通过)
- `bun run ai:gen -- --dry-run` — ✅ passes
- `bun run lint` — ✅ passes on changed files
- `bun run format` — applied to both changed files
