# ai-share

这个仓库用于集中管理多台电脑、多个项目共用的 Codex 配置、MCP、native skills、提示词和用户级记忆。

当前架构已经收敛为 **Codex only**，并且只生成一套默认 Codex 配置；不再生成 profile、agent 或多任务编排角色配置。

主要目标：

- 以 `config/*.yaml` 作为唯一权威配置源，统一维护模型提供商、默认模型和 MCP。
- 同步用户级 MCP、native skills、prompts 和持久化 memory。
- API Key 不写入仓库，只通过环境变量引用。
- 通过 Git 在不同电脑之间同步配置源。

## 使用

新电脑从零同步后，推荐在仓库根目录直接执行 bootstrap。它会安装依赖、检查配置，并生成用户级 Codex 配置：

```sh
bun run ai:bootstrap
```

如果只是想跳过 `bun install`：

```sh
bun run ai:bootstrap -- --skip-install
```

bootstrap 要求本机已安装 Bun 和 Codex CLI，并且已在环境变量中设置所需 API Key。缺失时会在检查阶段输出具体变量名，不会写入真实密钥。

安装依赖：

```sh
bun install
```

检查 YAML 配置和生成逻辑，不写入文件：

```sh
bun run ai:check
```

预览将生成的用户级配置内容：

```sh
bun run ai:gen -- --dry-run
```

生成用户级 Codex 配置：

```sh
bun run ai:gen
```

如果目标文件已存在并确认要覆盖：

```sh
bun run ai:gen -- --force
```

## Provider 选择

当前项目仅支持 Codex + GPT 兼容模型组，默认 provider 为 `gpt=codexapis`。可选 provider 来自
`config/provider.yaml`：`codexapis`、`packyapi`、`axasapi`、`lingsuan`。

在交互式终端直接运行 `bun run ai:gen` 且未通过参数或环境变量指定 provider 时，生成器会列出
`config/provider.yaml` 中所有已配置 provider。选择某个 provider 后会把它应用到 GPT 模型组。可用 ↑/↓、数字键、Enter 或支持 SGR mouse 的终端鼠标点击选择。
非交互环境、`bun run ai:check`、以及已显式指定 provider 的命令不会进入选择界面。

如果希望指定 GPT provider，可使用以下任一方式：

```sh
bun run ai:gen -- --provider packyapi --force
bun run ai:gen -- --gpt-provider packyapi --force
bun run ai:gen -- --provider-group gpt=packyapi --force
bun run ai:gen -- --provider lingsuan --force
```

环境变量也支持同样的 provider 选择：

```sh
AI_SHARE_PROVIDER=packyapi bun run ai:gen -- --force
AI_SHARE_GPT_PROVIDER=packyapi bun run ai:gen -- --force
AI_SHARE_PROVIDER=lingsuan bun run ai:gen -- --force
```

## 生成输出

Codex 目录优先读取 `CODEX_HOME`，未设置时使用 `~/.codex`。

```text
~/.codex/config.toml
~/.codex/.env
~/.codex/ai-share.runtime.json
~/.codex/AGENTS.md
~/.codex/skills/<native-skill>/SKILL.md
```

ai-share 不再维护仓库内 `bin/` 目录，也不安装独立启动器；`codex` 命令由本机安装的 Codex CLI 提供。

## Native Skills

当前安装到 `~/.codex/skills/` 的 native skills 来自 `src/cli/native-skills.ts` 和 `skills/` 源目录，例如：

- `git-master`：安全 Git 操作、原子提交、历史搜索。
- `ai-share-generator`：修改 `config/*.yaml`、生成器和安装输出时的工作流。
- `config-model-tuning`：调整默认模型、provider group、模型 metadata 和 fallback。
- `context-compiler`：把长 session、issue、日志、PR、网页资料编译成可审计上下文摘要。
- `prompt-lint`：检查提示词、skill 和 instruction memory 的冲突、冗余与不可验证规则。
- `release-commit`：整理变更批次、验证证据、风险和提交计划。

## 模型

当前只生成一套 Codex 默认配置。默认模型由 `config/global.yaml` 的 `model` 控制，当前是 `gpt-5.5`。

切换模型时修改 YAML 源后重新生成：

```yaml
model: gpt-5.5-coding
```

```sh
bun run ai:gen -- --force
```

启动命令：

```sh
codex
codex exec "请分析当前项目"
```

## 配置源

```text
config/global.yaml    -> 默认模型和 Codex 最低版本要求
config/provider.yaml  -> 模型提供商、baseURL、API Key 环境变量名
config/models.yaml    -> 模型列表、provider/provider_group、上游模型名、参数、fallback
config/mcp.yaml       -> 用户级 Codex MCP servers
config/env.yaml       -> 写入 CODEX_HOME/.env 的非密钥 Codex 运行时环境变量
```

`config/mcp.yaml` 不允许写入明文 token/cookie/API key。`bun run ai:check` 会阻止 HTTP MCP URL 中的敏感查询参数，也会阻止 stdio MCP 的敏感 env 写成明文。

## 环境变量

当前配置使用这些环境变量读取 API Key：

```text
CODEXAPIS_API_KEY
PACKYAPI_API_KEY
AXASAPI_API_KEY
LINGSUAN_API_KEY
```

Windows PowerShell 示例：

```powershell
[Environment]::SetEnvironmentVariable("CODEXAPIS_API_KEY", "your-key", "User")
[Environment]::SetEnvironmentVariable("PACKYAPI_API_KEY", "your-key", "User")
[Environment]::SetEnvironmentVariable("AXASAPI_API_KEY", "your-key", "User")
[Environment]::SetEnvironmentVariable("LINGSUAN_API_KEY", "your-key", "User")
```

macOS/Linux 示例：

```sh
export CODEXAPIS_API_KEY="your-key"
export PACKYAPI_API_KEY="your-key"
export AXASAPI_API_KEY="your-key"
export LINGSUAN_API_KEY="your-key"
```

## Codex .env

Codex CLI 会读取 `CODEX_HOME/.env`。`config/env.yaml` 管理适合写入该文件的非密钥运行时变量，当前默认写入本地代理：

```dotenv
HTTP_PROXY=http://127.0.0.1:7897
HTTPS_PROXY=http://127.0.0.1:7897
ALL_PROXY=socks5://127.0.0.1:7897
NO_PROXY=localhost,127.0.0.1,::1
http_proxy=http://127.0.0.1:7897
https_proxy=http://127.0.0.1:7897
all_proxy=socks5://127.0.0.1:7897
no_proxy=localhost,127.0.0.1,::1
```

`bun run ai:gen` 只更新 `CODEX_HOME/.env` 中的 ai-share managed block，并保留 block 外的用户手写内容：

```dotenv
# BEGIN ai-share managed env
# Non-secret Codex runtime environment only. Keep API keys and tokens outside this file.
...
# END ai-share managed env
```

不要把 API key、token、cookie、password、`CODEX_HOME`、`PATH`、`AI_SHARE_*` 或 `CODEX_*` 写入 `config/env.yaml`。

## Schema / Doctor

生成 JSON Schema：

```sh
bun run schema:gen
```

JSON Schema 输出到 `docs/schema/json/`。字段类型、必填项、枚举、pattern 和正数约束的单一规格源是
`src/config/schema-spec.ts`；`src/config/schema.ts` 从它生成 JSON Schema，
`src/config/validators/schema-shape.ts` 从同一份规格执行运行时 shape 校验。其他 validator 只保留跨文件引用、
MCP 条件规则和 secret 策略。

检查 provider 是否真实暴露了当前配置中的上游模型名：

```sh
bun run provider:check
bun run provider:check -- --canary
bun run provider:check -- --canary --json
```

聚合运行态诊断：

```sh
bun run ai:doctor
bun run ai:doctor -- --json
bun run ai:doctor -- --output .sisyphus/evidence/doctor/report.json
```

## Templates / Privacy

`templates/shareable/config/` 提供可共享最小配置模板；`templates/personal-overlay/` 描述个人 overlay 边界。生成器会先读取共享
`config/*.yaml`，再按同名文件合并可选的 `config/local/*.yaml`。`config/local/` 默认被 `.gitignore` 忽略，适合个人 provider
选择、路径和实验性模型覆盖；最终合并结果仍会走同一套 schema/一致性校验。

memory 隐私分层见 `docs/memory-privacy.md`：shareable、personal、local、project。`memory/local/`、`memory/private/`、`memory/project/` 默认不进入 Git。

自动检查 memory 分层和疑似 secret：

```sh
bun run memory:check
```

`bun run check` 已包含 `memory:check`。

## Memory

`memory/` 提供持久化用户级记忆。生成的 Codex `AGENTS.md` 会加载：

- `AI_GUIDELINES.md`
- `memory/user/*`
- `memory/architecture/*`
- `memory/stack/*`
- `memory/stable/*`

任务相关 memory 可通过 `AI_SHARE_TASK` 触发本地关键词检索，相关度最高的 memory 文件会插入到结构化 memory 前：

```sh
AI_SHARE_TASK="代理配置" bun run ai:gen -- --dry-run
```

## 验证

常用验证命令：

```sh
bun run format:check
bun run lint
bun run typecheck
bun test
bun run ai:check
```

跨模块生成器改动后建议运行：

```sh
bun run check
bun run ai:gen -- --dry-run
```
