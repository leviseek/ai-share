# ai-share

`ai-share` 以严格 YAML 为权威源，为多个设备生成一套用户级 Codex 配置、instructions 和 native skills。项目使用 Bun + strict TypeScript，不维护独立启动器、Provider group、fallback 或运行时 manifest。

```text
config/*.yaml + config/local/*.yaml
→ Bun.YAML.parse
→ 严格配置与 secret 校验
→ 唯一 model/provider 解析
→ GenerationPlan
→ 事务化写入、迁移和 prune
```

## 环境要求

- Bun `1.3.13`
- Codex CLI 仅在实际使用 Codex 时需要；仓库质量检查不依赖 Codex、API Key、代理或用户配置

使用 mise 时：

```sh
mise trust
mise install
```

不使用 mise 时，直接安装匹配版本的 Bun。安装依赖时使用锁文件：

```sh
bun install --frozen-lockfile
```

## 快速开始

```sh
bun run ai:check
bun run ai:gen -- --dry-run
bun run ai:gen
```

`ai:check` 是纯仓库配置检查，不读取 API Key，不探测 Provider、代理或 Codex 安装。`ai:bootstrap` 会依次安装依赖、执行纯配置检查并生成 Codex 输出；遇到未标记的已有配置时会拒绝覆盖。

```sh
bun run ai:bootstrap
bun run ai:bootstrap -- --skip-install
```

## 配置源

| 文件                   | 用途                                                          |
| ---------------------- | ------------------------------------------------------------- |
| `config/global.yaml`   | 必填默认 `model` 和 `provider`，以及可选 Codex 运行设置       |
| `config/provider.yaml` | Provider 的 `name`、HTTPS `base_url`、API Key 环境变量引用    |
| `config/models.yaml`   | `model_name` 与可选 `reasoning_effort: low \| medium \| high` |
| `config/mcp.yaml`      | stdio 或 HTTP MCP server                                      |
| `config/env.yaml`      | 可共享的非密钥 Codex `.env` 变量；默认 `variables: {}`        |

固定对象拒绝未知字段。API Key 只能写成 `${ENV_NAME}` 引用；真实 key、token、cookie 或凭据不得进入仓库。

### 本机 overlay

生成器先读取 `config/*.yaml`，再深合并同名 `config/local/*.yaml`：object 深合并，数组和标量替换。所有合并结果都经过同一套严格校验。

当前机器的代理等非密钥值应放在被 Git 忽略的 `config/local/env.yaml`。可复制示例：

```powershell
New-Item -ItemType Directory -Force config/local | Out-Null
Copy-Item templates/personal-overlay/env.local.example.yaml config/local/env.yaml
```

禁止把 `HOME`、`USERPROFILE`、`PATH`、`AI_SHARE_*`、`CODEX_*` 或敏感变量写入 `config/env.yaml` 及其 overlay。

## Provider 与任务选择

默认 Provider 的唯一权威源是 `config/global.yaml`。临时选择优先级：

```text
--provider > AI_SHARE_PROVIDER > global.provider
```

```sh
bun run ai:gen -- --provider packyapi
AI_SHARE_PROVIDER=packyapi bun run ai:gen
```

`ai:gen` 只支持 `--provider`、`--task`、`--force`、`--dry-run`。任务描述优先级为 `--task > AI_SHARE_TASK`；本次生成会把最多 3 个相关 memory 路径编译进 `AGENTS.md`。

```sh
bun run ai:gen -- --task "Windows 事务化文件写入"
```

## 生成输出与所有权

Codex 目录优先读取 `CODEX_HOME`，否则使用 `HOME`/`USERPROFILE` 下的 `.codex`：

```text
CODEX_HOME/config.toml
CODEX_HOME/.env                         # 仅更新 ai-share managed block
CODEX_HOME/AGENTS.md
CODEX_HOME/skills/<skill>/SKILL.md
CODEX_HOME/skills/<skill>/.ai-share-managed
```

不再生成 `ai-share.runtime.json`，也不会创建 `~/ai-workspace` 或仓库 symlink。

生成规则：

- 缺失目标直接创建；受管目标自动更新；内容相同不写入。
- 未标记目标发生冲突时整批失败，不产生部分输出。
- `--force` 只用于显式接管冲突，永远不能绕过配置或 secret 校验。
- `.env` 只更新 managed block，block 外内容保持不变。
- 只 prune 带 `.ai-share-managed` 的废弃 skill；用户 skill 保留。
- 合法旧 manifest 仅用于一次迁移识别，成功后删除且不再生成。

## 安全清理

```sh
bun run ai:clean
bun run ai:clean -- --no-backup
```

`ai:clean` 默认备份即将修改的受管目标，只删除带 generated header 的固定输出、`.env` managed block、带 marker 或合法旧 manifest 声明的 skill，以及合法旧 manifest。它不会递归删除整个 `CODEX_HOME`，也不会删除未受管文件。

## Memory 注入

默认 `AGENTS.md` 只注入以下 6 个基础文件，并在第 4 位插入最多 3 个任务检索结果：

1. `AI_GUIDELINES.md`
2. `memory/policies/ai-execution-contract.md`
3. `memory/policies/memory-lifecycle.md`
4. 最多 3 个任务相关文件
5. `memory/stable/user.yaml`
6. `memory/stable/workflows.yaml`
7. `memory/stable/devices.yaml`

检索范围仅包含非固定的 `memory/architecture/`、`memory/stack/`、`memory/policies/` 和 `confirmed_by_user: true` 的 `memory/distilled/`。`TEMPLATE.md`、`memory/inferred/` 和未确认 distilled 内容不会注入。记忆修改由 `memory-curator`、`failure-distiller` 产出普通 patch，并继续要求人工确认。

## Schema 与模板

```sh
bun run schema:gen       # 写入并删除废弃 schema
bun run schema:check     # 只读检查缺失、漂移和额外 schema
```

`src/config/schema-spec.ts` 同时驱动 JSON Schema 与运行时 shape 校验。`templates/shareable/config/` 通过和主配置相同的加载、overlay、校验与 builder pipeline。

## 运行态诊断

`ai:doctor` 默认离线；缺少 API Key、Codex 或生成输出只报告 warning。`--online` 才访问 Provider `/models`，`--canary` 才发送最小 completion（并自动启用 online）。

```sh
bun run ai:doctor
bun run ai:doctor -- --online
bun run ai:doctor -- --canary --json
```

严格 Provider 检查失败返回非零：

```sh
bun run provider:check -- --provider codexapis
bun run provider:check -- --provider codexapis --canary
```

Provider 检查只访问选中的 Provider，并检查 `config/models.yaml` 中所有去重后的上游 `model_name`。

## 质量门禁

```sh
bun run check
```

完整门禁包含 format、lint、typecheck、test、只读 schema 检查、memory privacy/lint/eval、skill lint 和纯配置检查。Windows 与 Linux CI 均使用 Bun `1.3.13` 和 frozen lockfile。
