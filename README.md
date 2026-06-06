# ai-share

这个仓库用于集中管理多台电脑、多个项目共用的 Codex/OMX 配置、MCP、native skills、提示词和用户级记忆。

当前架构已经收敛为 **Codex + OMX only**。仓库不再生成或安装其他 AI 运行时的兼容配置。

主要目标：

- 以 `config/*.yaml` 作为唯一权威配置源，统一维护模型提供商、模型列表、profile 和 Codex agents。
- 从 YAML 生成用户级 Codex CLI 配置、OMX 配置、Codex agent 配置、AGENTS.md 和运行时清单。
- 同步用户级 MCP、native skills、prompts 和持久化 memory。
- API Key 不写入仓库，只通过环境变量引用。
- 通过 Git 在不同电脑之间同步配置源。

## 使用

新电脑从零同步后，推荐在仓库根目录直接执行 bootstrap。它会安装依赖、检查配置、生成并安装用户级 Codex/OMX 配置，然后验证 `aiomx` 启动入口：

```sh
bun run ai:bootstrap
```

如果只是想跳过 `bun install`：

```sh
bun run ai:bootstrap -- --skip-install
```

bootstrap 要求本机已安装 Bun、Codex CLI、OMX，并且已在环境变量中设置所需 API Key。缺失时会在检查阶段输出具体变量名，不会写入真实密钥。

安装依赖：

```sh
bun install
```

检查 YAML 配置和生成逻辑，不写入文件、不安装启动命令：

```sh
bun run ai:check
```

预览将生成的用户级配置内容：

```sh
bun run ai:gen -- --dry-run
```

生成用户级 Codex/OMX 配置，并安装全局启动命令：

```sh
bun run ai:gen
```

如果目标文件已存在并确认要覆盖：

```sh
bun run ai:gen -- --force
```

## Provider 选择

默认模型组提供商为 `gpt=codexapis`、`deepseek=deepseek`。切换 GPT 模型组到 Packy API：

```sh
bun run ai:gen -- --gpt-provider packyapi
bun run ai:gen -- --gpt-provider packyapi --force
```

也可以用通用模型组参数指定一个或多个分组：

```sh
bun run ai:gen -- --provider-group gpt=packyapi --provider-group deepseek=packyapi --force
```

环境变量也支持同样的 provider 选择：

```sh
AI_SHARE_GPT_PROVIDER=packyapi bun run ai:gen -- --force
AI_SHARE_DEEPSEEK_PROVIDER=packyapi bun run ai:gen -- --force
```

## 生成输出

Codex 目录优先读取 `CODEX_HOME`，未设置时使用 `~/.codex`。

```text
~/.codex/config.toml
~/.codex/.env
~/.codex/lite.config.toml
~/.codex/economy.config.toml
~/.codex/cheap.config.toml
~/.codex/balanced.config.toml
~/.codex/coding.config.toml
~/.codex/research.config.toml
~/.codex/writing.config.toml
~/.codex/max.config.toml
~/.codex/ds-max.config.toml
~/.codex/lite.omx-config.json
~/.codex/economy.omx-config.json
~/.codex/cheap.omx-config.json
~/.codex/balanced.omx-config.json
~/.codex/coding.omx-config.json
~/.codex/research.omx-config.json
~/.codex/writing.omx-config.json
~/.codex/max.omx-config.json
~/.codex/ds-max.omx-config.json
~/.codex/ai-share.runtime.json
~/.codex/AGENTS.md
~/.codex/lite.AGENTS.md
~/.codex/economy.AGENTS.md
~/.codex/cheap.AGENTS.md
~/.codex/balanced.AGENTS.md
~/.codex/coding.AGENTS.md
~/.codex/research.AGENTS.md
~/.codex/writing.AGENTS.md
~/.codex/max.AGENTS.md
~/.codex/ds-max.AGENTS.md
~/.codex/agents/sisyphus.toml
~/.codex/agents/hephaestus.toml
~/.codex/agents/prometheus.toml
~/.codex/agents/oracle.toml
~/.codex/agents/momus.toml
~/.codex/agents/metis.toml
~/.codex/agents/atlas.toml
~/.codex/agents/sisyphus-junior.toml
~/.codex/agents/explorer.toml
~/.codex/agents/librarian.toml
~/.codex/agents/multimodal-looker.toml
~/.codex/.omx-config.json
~/.codex/skills/<native-skill>/SKILL.md
```

同时会安装启动命令到用户级 bin 目录：

```text
~/.local/bin/aiomx
```

Windows 下对应为：

```text
%USERPROFILE%\.local\bin\aiomx.cmd
%USERPROFILE%\.local\bin\aiomx.ps1
%USERPROFILE%\.local\bin\aiomx.ts
```

Windows 会自动把该目录加入用户级 PATH。已经打开的终端可能需要重启后才能直接使用 `aiomx`。macOS/Linux 请确认 `~/.local/bin` 已在 PATH 中。

## Native Skills

当前安装到 `~/.codex/skills/` 的 native skills：

- `git-master`：安全 Git 操作、原子提交、历史搜索。
- `ai-share-generator`：修改 `config/*.yaml`、生成器和安装输出时的工作流。
- `config-profile-tuning`：调整模型角色、profile、compaction metadata 和上下文预算。
- `context-compiler`：把长 session、issue、日志、PR、网页资料编译成可审计上下文摘要。
- `prompt-lint`：检查提示词、agent、skill 和 instruction memory 的冲突、冗余与不可验证规则。
- `release-commit`：整理变更批次、验证证据、风险和提交计划。

## Profile

当前内置 9 个 profile，每个 profile 固定使用 3 个模型角色：

```text
lite：primary=gpt-5.4，reasoning=deepseek-v4-flash-think，fast=gpt-5.4-mini
economy：primary=deepseek-v4-flash，reasoning=deepseek-v4-flash-think，fast=deepseek-v4-flash
cheap：primary=gpt-5.4-mini，reasoning=deepseek-v4-flash-think，fast=gpt-5.4-mini
balanced：primary=gpt-5.5，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
coding：primary=gpt-5.5-coding，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
research：primary=gpt-5.5，reasoning=deepseek-v4-pro-think-max，fast=gpt-5.4-mini
writing：primary=gpt-5.5，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
max：primary=gpt-5.5，reasoning=deepseek-v4-pro-think-max，fast=gpt-5.4
ds-max：primary=deepseek-v4-pro-think，reasoning=deepseek-v4-pro-think-max，fast=deepseek-v4-flash
```

默认 profile 由 `config/global.yaml` 的 `default_profile` 控制，当前是 `balanced`。启动时可直接选择：

```sh
aiomx
aiomx coding
aiomx max exec "请分析当前项目"
aiomx --profile research
```

`config/agents.yaml` 中的 agents 引用 `primary`、`reasoning`、`fast` 这 3 个中间层角色；具体模型由 `config/profiles.yaml` 决定。

## 配置源

```text
config/global.yaml    -> 默认 profile 和 Codex/OMX 最低版本要求
config/provider.yaml  -> 模型提供商、baseURL、API Key 环境变量名
config/models.yaml    -> 模型列表、provider/provider_group、上游模型名、参数、fallback
config/profiles.yaml  -> Codex/OMX profile、模型角色映射和 compaction metadata
config/agents.yaml    -> Codex agent 运行时参数、OMX slot/reasoning 映射和 prompt append
config/mcp.yaml       -> 用户级 Codex MCP servers
config/env.yaml       -> 写入 CODEX_HOME/.env 的非密钥 Codex 运行时环境变量
config/profile-eval.yaml -> profile evaluation 固定任务集和手工评分维度
```

`config/mcp.yaml` 不允许写入明文 token/cookie/API key。`bun run ai:check` 会阻止 HTTP MCP URL 中的敏感查询参数，也会阻止 stdio MCP 的敏感 env 写成明文。

## 环境变量

当前配置使用这些环境变量读取 API Key：

```text
CODEXAPIS_API_KEY
PACKYAPI_API_KEY
AXASAPI_API_KEY
DEEPSEEK_API_KEY
```

Windows PowerShell 示例：

```powershell
[Environment]::SetEnvironmentVariable("CODEXAPIS_API_KEY", "your-key", "User")
[Environment]::SetEnvironmentVariable("PACKYAPI_API_KEY", "your-key", "User")
[Environment]::SetEnvironmentVariable("AXASAPI_API_KEY", "your-key", "User")
[Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "your-key", "User")
```

macOS/Linux 示例：

```sh
export CODEXAPIS_API_KEY="your-key"
export PACKYAPI_API_KEY="your-key"
export AXASAPI_API_KEY="your-key"
export DEEPSEEK_API_KEY="your-key"
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

如果检测到旧版 ai-share 全量生成头，会自动迁移为 managed block；未知 `.env` 文件只追加或更新 managed block。

不要把 API key、token、cookie、password、`CODEX_HOME`、`PATH`、`AI_SHARE_*` 或 `OMX_DEFAULT_*` 写入 `config/env.yaml`。

`bun run ai:check` 会轻量检查 managed block 是否缺失/漂移，以及 `config/env.yaml` 中的 loopback 代理端口是否可达；这些运行态差异只输出告警，不阻断离线验证。

## Profile 导入/导出

```sh
bun run src/cli/profile-export.ts balanced
bun run src/cli/profile-export.ts --all --output profiles.json
bun run src/cli/profile-import.ts profiles.json --dry-run
bun run src/cli/profile-import.ts profiles.json --force
```

导入时会执行 tri-role 协议格式检查、角色完整性验证和模型注册表引用检查。

## Schema / Evaluation

生成 JSON Schema：

```sh
bun run schema:gen
```

JSON Schema 输出到 `docs/schema/json/`。字段类型、必填项、枚举、pattern 和正数约束的单一规格源是
`src/config/schema-spec.ts`；`src/config/schema.ts` 从它生成 JSON Schema，
`src/config/validators/schema-shape.ts` 从同一份规格执行运行时 shape 校验。其他 validator 只保留跨文件引用、
MCP 条件规则和 secret 策略。

生成 profile 评测计划，不执行模型调用：

```sh
bun run profile:eval -- --tasks project_analysis,contract_test_patch --profiles coding,max
```

也可以继续用临时任务：

```sh
bun run profile:eval -- --task "分析当前项目" --profiles coding,max
```

实际执行评测需要显式传入 `--execute`：

```sh
bun run profile:eval -- --task "分析当前项目" --profiles coding,max --execute
```

默认报告写入 `.sisyphus/evidence/profile-eval/`，报告协议为 `ai-share/profile-eval/v2`，包含固定任务权重、成功标准、耗时、退出码、估算成本、人工成功/返工/评分字段和 profile 加权汇总。

检查 provider 是否真实暴露了当前配置中的上游模型名：

```sh
bun run provider:check
bun run provider:check -- --canary
bun run provider:check -- --canary --json
```

该命令会访问各 provider 的 `/models` 端点，需要本机已设置对应 API key。`--canary` 会进一步发起轻量 completion
验证模型可调用和参数兼容；`--json` 输出机器可读结果。它是显式网络检查，不放入默认 `bun run check`。

聚合运行态诊断：

```sh
bun run ai:doctor
bun run ai:doctor -- --json
bun run ai:doctor -- --output .sisyphus/evidence/doctor/report.json
```

`ai:doctor` 聚合 YAML 一致性、默认配置漂移、Codex/OMX 版本、`.env` managed block、本地代理、memory privacy 和 provider model 检查。provider/network 问题默认是 warning；需要阻断时使用 `--strict-provider`。

## Templates / Privacy

`templates/shareable/config/` 提供可共享最小配置模板；`templates/personal-overlay/` 描述个人 overlay 边界。生成器会先读取共享
`config/*.yaml`，再按同名文件合并可选的 `config/local/*.yaml`。`config/local/` 默认被 `.gitignore` 忽略，适合个人 provider
选择、路径和实验性 profile 覆盖；最终合并结果仍会走同一套 schema/一致性校验。
`bun run ai:check` 和 `bun run ai:doctor -- --json` 会报告当前启用的 local overlay 文件，方便排查本机差异。

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
- profile-specific memory files

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

跨模块生成器或启动器改动后建议运行：

```sh
bun run check
bun run ai:gen -- --dry-run
```
