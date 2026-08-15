# src/

## OVERVIEW

Bun/strict TypeScript 实现的纯配置加载、OpenCode builder、GenerationPlan、事务化安装、安全清理和按需 memory 检索。

## STRUCTURE

```text
src/
├── generate-user-config.ts # 结构化生成入口
├── generation-preview.ts   # ai:gen/ai:explain 共享只读预览
├── config-builders.ts      # builder re-export facade
├── config/                 # async loader、schema、validation、builders
├── cli/                    # options、paths、GenerationPlan、staging、doctor/check/clean
├── memory/                 # 确定性轻量检索
├── types/                  # YAML/OpenCode/CLI types
├── types.ts                # type re-export facade
└── yaml.ts                 # Bun.YAML plain-object wrapper
```

## WHERE TO LOOK

| Need                           | Location                                        | Notes                                         |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------- |
| End-to-end generation          | `generate-user-config.ts`                       | 返回结构化结果，入口统一设置退出码            |
| Shared generation preview      | `generation-preview.ts`                         | 配置、选择、Memory 与 plan 的无副作用编排     |
| Explainable generation         | `cli/ai-explain.ts`                             | 版本化 JSON 与彩色 human 只读报告             |
| Explain report projection      | `cli/explain-report.ts`                         | 来源、排名和 plan metadata，剥离 content      |
| Async config pipeline          | `config/load.ts`                                | base + local overlay + validation             |
| YAML shape source              | `config/schema-spec.ts`                         | JSON Schema 与运行时 shape 的单一来源         |
| Cross-file/security validation | `config/validation.ts`                          | 输入 `unknown`，成功返回 `ConfigSet`          |
| OpenCode JSONC/instructions    | `config/builders/opencode.ts`                   | 只物化选中的 Provider                         |
| `.env` managed block           | `config/builders/env.ts`                        | 保留 block 外用户内容                         |
| Memory injection               | `config/builders/instructions.ts`               | 6 个基础文件 + 最多 3 个任务结果              |
| Ownership and migration        | `cli/generation-plan.ts`                        | create/update/delete/current/collision        |
| Transaction and rollback       | `cli/fs.ts`                                     | staged write/delete promotion                 |
| Surgical clean                 | `cli/clean.ts`                                  | 只清理明确受管目标                            |
| Provider checks                | `cli/provider-check.ts`                         | selected Provider `/models` 与最小 canary     |
| Provider selection             | `cli/provider-select.ts`                        | 数字索引、方向键与 Enter 的 TTY 菜单          |
| Optional component selection   | `cli/optional-components.ts`                    | 菜单 choices 构建、目标配置状态解析           |
| JSONC parsing                  | `cli/jsonc.ts`                                  | 注释与 trailing comma 的确定性解析            |
| Archify ownership              | `cli/archify-install.ts` + `generation-plan.ts` | 固定 revision、marker 与外部 skill ownership  |
| Global tool validation         | `config/validators/tools.ts`                    | 校验工具 ID 唯一性与 package secret 防护      |
| Global tool install planning   | `cli/install-plan.ts`                           | 按平台 manager 推导检测、安装和 hint 命令     |
| Global tool installation       | `cli/ai-install.ts`                             | 读取 `tools.yaml`，检测全局工具并输出安装提示 |

## CONVENTIONS

- `generate-user-config.ts` 只做 orchestration；shape 逻辑放 builder，IO/ownership 放 `cli/`。
- `ai:gen` 与 `ai:explain` 必须共享 `buildGenerationPreview`；explain 不得调用事务执行器或网络检查。
- explain JSON 只输出单一确定性对象，不包含 action content、env 值、真实凭据、ANSI、时间戳或随机 ID。
- 配置 loader 保持 async；overlay 的 object 深合并、数组/标量替换语义不可漂移。
- `exactOptionalPropertyTypes`、`noUncheckedIndexedAccess`、`noUnused*`、`isolatedDeclarations` 均启用。
- 用户可见错误使用中文；标识符、参数、路径、env 名保持英文。
- 所有验证和所有权预检完成前不得产生 OpenCode 输出副作用。
- staging 必须同时支持 write/delete，并在任一 promote 失败时回滚。
- Provider 菜单只在未传 `--provider` 且 stdin/stdout 为 TTY 时启用；非 TTY 必须确定性回退，不能等待输入。
- 任何测试调用可能触发交互的共享函数（`buildGenerationPreview`、provider-select、install-select）必须满足以下任一条件，禁止依赖「当前进程不是 TTY」的环境假设：① 注入 `providerSelector`/`optionalSelector`；② 显式传 `interactiveProviderSelection: false` 且 `interactiveOptionalSelection: false`。
- optional 交互默认 opt-in：`shouldPromptOptional` 仅当显式传 `interactiveOptionalSelection: true` 时返回 true；新调用点未传参即默认非交互。
- 不重新引入 runtime manifest 输出、workspace link 或 memory compiler/proposal。
- `tools.yaml` 由 `cli/ai-install.ts` 消费；`ai:gen` 第一轮菜单不消费 `tools.yaml`，只管理 OpenCode plugin、agents 和 native skills。
- secret 只以 env-var 名引用；不得读取后写入、打印或持久化真实值。

## VALIDATION

```sh
bun run typecheck
bun test
bun run schema:check
bun run memory:check
bun run ai:check
bun run ai:gen -- --dry-run
```

跨模块变更运行 `bun run check`。
