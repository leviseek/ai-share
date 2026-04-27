# ai-share

这个仓库用于集中管理多台电脑、多个项目共用的 OpenCode 与 oh-my-openagent 配置。

主要目标：

- 以 `config/*.yaml` 作为唯一权威配置源，统一维护模型提供商、模型列表、默认模型和 agents/categories。
- 从 YAML 生成用户级 OpenCode 配置，避免在多个静态 JSON/JSONC 文件之间手工同步。
- 统一维护通用 AI 协作规范和 Git 提交规范。
- 通过 Git 在不同电脑之间同步配置源。
- API Key 不写入仓库，只通过环境变量引用。

## 使用

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

生成 OpenCode 与 oh-my-openagent 用户级配置，并安装全局启动命令：

```sh
bun run ai:gen
```

如果目标文件已存在并确认要覆盖：

```sh
bun run ai:gen -- --force
```

默认模型组提供商为 `gpt=codexapis`、`deepseek=deepseek`；如需切换 GPT 模型组到 Packy API：

```sh
bun run ai:gen -- --gpt-provider packyapi
bun run ai:gen -- --gpt-provider packyapi --force
```

也可以用通用模型组参数指定一个或多个分组：

```sh
bun run ai:gen -- --provider-group gpt=packyapi --provider-group deepseek=packyapi --force
```

也可以使用环境变量指定：

```sh
AI_SHARE_GPT_PROVIDER=packyapi bun run ai:gen -- --force
AI_SHARE_DEEPSEEK_PROVIDER=packyapi bun run ai:gen -- --force
```

生成结果位于当前用户的 OpenCode 配置目录：

```text
~/.config/opencode/opencode.json
~/.config/opencode/tui.json
~/.config/opencode/opencode.lite.json
~/.config/opencode/opencode.cheap.json
~/.config/opencode/opencode.balanced.json
~/.config/opencode/opencode.coding.json
~/.config/opencode/opencode.research.json
~/.config/opencode/opencode.writing.json
~/.config/opencode/opencode.max.json
~/.config/opencode/oh-my-openagent.json
~/.config/opencode/oh-my-openagent.lite.json
~/.config/opencode/oh-my-openagent.cheap.json
~/.config/opencode/oh-my-openagent.balanced.json
~/.config/opencode/oh-my-openagent.coding.json
~/.config/opencode/oh-my-openagent.research.json
~/.config/opencode/oh-my-openagent.writing.json
~/.config/opencode/oh-my-openagent.max.json
~/.config/opencode/.omo-profiles.json
~/.config/opencode/plugins/omo-agent-monitor/package.json
~/.config/opencode/plugins/omo-agent-monitor/server.js
~/.config/opencode/plugins/omo-agent-monitor/tui.js
```

同时会安装启动命令到用户级 bin 目录：

```text
~/.local/bin/aiomo
~/.local/bin/aioc
```

Windows 下对应为：

```text
%USERPROFILE%\.local\bin\aiomo.cmd
%USERPROFILE%\.local\bin\aiomo.ps1
%USERPROFILE%\.local\bin\aioc.cmd
%USERPROFILE%\.local\bin\aioc.ps1
```

Windows 会自动把该目录加入用户级 PATH。已经打开的终端可能需要重启后才能直接使用 `aiomo` / `aioc`。

macOS/Linux 不会自动修改 shell 配置；请确认 `~/.local/bin` 已在 PATH 中。

生成脚本只会把 API Key 写成 `{env:变量名}` 引用，不会把真实密钥写入配置文件。

通用 AI 协作规范在 `AI_GUIDELINES.md`，生成的 OpenCode 配置会加载该文件。

Git 提交规范在 `GIT_COMMIT_GUIDELINES.md`，提交信息使用 `option: 中文描述` 格式。

## 启动 OpenCode

本仓库不通过 `bun run start` 启动 agent。执行 `bun run ai:gen` 后，切换到其他项目也可以直接使用全局启动命令。

当前推荐把启动方式分成两类：

```sh
# oh-my-openagent 多 agents 编排模式，加载插件
opencode

# OpenCode 原生 Build / Plan 模式，不加载外部插件
opencode --pure
```

为了减少记忆成本，同时避免和常见开发工具命名重合，不建议使用 `oc`（OpenShift 常用）、`code`（VS Code）、`op`（1Password）这类短名。本仓库会安装 `aiomo` / `aioc` 启动包装器：

```text
bin/aiomo      -> opencode，并可选择 OMO 编排级别
bin/aioc       -> opencode --pure
bin/aiomo.cmd  -> opencode，并可选择 OMO 编排级别
bin/aiomo.ps1  -> aiomo.cmd 使用的 PowerShell 启动逻辑
bin/aioc.cmd   -> opencode --pure
bin/aioc.ps1   -> PowerShell 原生 opencode --pure 启动逻辑
```

macOS/Linux shell PATH 示例：

```sh
export PATH="$HOME/.local/bin:$PATH"
```

如果不想修改 PATH，也可以直接使用完整路径：

```sh
~/.local/bin/aiomo
~/.local/bin/aioc
```

之后可以在任意项目目录使用：

```sh
# OMO 编排模式：Tab 通常切换 Sisyphus / Hephaestus / Prometheus / Atlas
aiomo

# 查看 OMO 启动器帮助、默认级别和可用级别
aiomo -h

# 选择 OMO 编排级别；默认等价于 aiomo balanced
aiomo lite
aiomo cheap
aiomo balanced
aiomo coding
aiomo research
aiomo writing
aiomo max

# 也支持显式参数形式，后续参数继续透传给 opencode
aiomo --omo-profile=max run "请分析当前项目"

# 原生模式：Tab 切换 OpenCode 原生 Build / Plan
aioc

# 原生 CLI 指定 agent
aioc run --agent plan "请只输出计划，不要修改文件"
aioc run --agent build "请说明当前项目结构"
```

`aioc` 不切换 OMO 编排级别，会直接使用当前生效的 `opencode.json`；如果之前运行过 `aiomo lite` / `aiomo max` 等命令，`aioc` 会沿用最后一次切换后的 OpenCode 基础配置和 compaction 策略。

## OMO 状态监控

生成配置后，`aiomo` 会加载一个极简 OMO agents 状态监控插件：

```text
~/.config/opencode/plugins/omo-agent-monitor/
```

在 OpenCode TUI 中打开命令面板，执行 `OMO agents monitor`，或输入 slash 命令：

```text
/omo-monitor
```

监控浮窗使用紧凑玻璃风面板展示，并提供辅助命令用于折叠区块和滑动 agent 列表：

```text
/omo-monitor-toggle-todos
/omo-monitor-toggle-agents
/omo-monitor-prev
/omo-monitor-next
```

监控浮窗会显示：

- 规划任务总数、完成进度、进行中任务和待处理任务。
- 当前进行中的规划任务内容。
- agents 列表，按运行中、重试、异常、空闲、未知排序。
- 每个 agent 的状态、已执行任务数、平均执行时长和总执行时长。

指标由本地插件基于 OpenCode `tool.execute.before/after` 与 `todo.updated` 事件统计：同一个插件通过 `opencode.json` 提供采集器，通过 `tui.json` 提供浮窗入口。状态缓存写入当前用户配置目录的 `omo-agent-monitor-state.json`，不会写入仓库，也不会包含 API Key。

如果不想配置函数，也可以直接使用原始命令：

```sh
opencode
opencode --pure
```

OpenCode 原生 agent 模式由生成的 `opencode.json` 中的 `agent` 配置决定。

oh-my-openagent 多 agents 编排模式通过生成的 `opencode.json` 中的插件配置启用，插件列表来自 `config/global.yaml` 的 `opencode.plugins`：

```yaml
opencode:
  plugins:
    - oh-my-openagent@3.17.5
```

升级 OMO 插件时，只需要修改这里的版本号，然后重新运行 `bun run ai:gen -- --force`。

对应的 agents/categories/fallback/background task 等配置来自生成的 `oh-my-openagent.json`。`aiomo` 启动时会先读取 `.omo-profiles.json` 中的默认级别和可用级别清单，再把所选级别的 `opencode.<profile>.json` 和 `oh-my-openagent.<profile>.json` 分别复制为当前生效的 `opencode.json` 与 `oh-my-openagent.json`。

默认 OMO 编排级别由 `config/global.yaml` 的 `default_profile` 控制。当前默认值为 `balanced`，因此直接运行 `aiomo` 等价于 `aiomo balanced`。如果修改 `default_profile`，需要重新运行 `bun run ai:gen -- --force` 生成 `.omo-profiles.json` 后才会影响启动器默认行为。

当前内置 7 个 OMO 编排级别，每个级别固定使用 3 个模型角色：

```text
lite：primary=gpt-5.4，reasoning=deepseek-v4-flash-think，fast=gpt-5.4-mini
cheap：primary=gpt-5.4-mini，reasoning=deepseek-v4-flash-think，fast=gpt-5.4-mini
balanced：primary=gpt-5.5，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
coding：primary=gpt-5.3-codex，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
research：primary=gpt-5.5，reasoning=deepseek-v4-pro-think-max，fast=gpt-5.4-mini
writing：primary=gpt-5.5，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
max：primary=gpt-5.5，reasoning=deepseek-v4-pro-think-max，fast=gpt-5.4
```

`config/agents.yaml` 中的 agents/categories 引用 `primary`、`reasoning`、`fast` 这 3 个中间层角色；具体模型由 `config/profiles.yaml` 决定。

`config/profiles.yaml` 中的每个 OMO 编排级别也可以覆盖 OpenCode `compaction`，用于按模式调节上下文智能压缩策略：

```yaml
balanced:
  compaction:
    enabled: true
    threshold: 80000
    model: fast
    max_input_tokens: 120000
```

其中 `model` 可以直接写模型 ID，也可以写 `primary`、`reasoning`、`fast` 这类 profile 模型角色。未在 profile 中声明的字段会回退到 `config/global.yaml` 的 `compaction` 默认值。

## 配置源

当前保留 YAML 生成路线：

```text
config/global.yaml    -> 全局运行、OpenCode/TUI 插件、默认 profile、默认/小模型和 compaction 策略
config/provider.yaml  -> 模型提供商、baseURL、API Key 环境变量名
config/models.yaml    -> 模型列表、provider/provider_group、上游模型名、参数、fallback
config/profiles.yaml  -> OMO 编排级别和模型角色映射；默认级别由 global.yaml 的 default_profile 指定
config/agents.yaml    -> oh-my-openagent agents/categories/runtime_fallback/background_task
```

修改这些 YAML 后，运行：

```sh
bun run ai:gen -- --dry-run
bun run ai:gen -- --force
```

## 环境变量

当前配置使用这些环境变量读取 API Key：

```text
CODEXAPIS_API_KEY
PACKYAPI_API_KEY
DEEPSEEK_API_KEY
```

Windows PowerShell 示例：

```powershell
[Environment]::SetEnvironmentVariable("CODEXAPIS_API_KEY", "your-key", "User")
[Environment]::SetEnvironmentVariable("PACKYAPI_API_KEY", "your-key", "User")
[Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "your-key", "User")
```

macOS/Linux 示例：

```sh
export CODEXAPIS_API_KEY="your-key"
export PACKYAPI_API_KEY="your-key"
export DEEPSEEK_API_KEY="your-key"
```

## 项目级覆盖

如果某个项目需要不同默认模型，可以在该项目根目录添加自己的 `opencode.jsonc` 或 `opencode.json` 做少量覆盖：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek/deepseek-v4-pro-think-max",
}
```

OpenCode 会合并全局配置和项目配置，项目配置优先。

oh-my-openagent 的项目级覆盖文件可放在 `.opencode/oh-my-openagent.jsonc` 或 `.opencode/oh-my-openagent.json`，它会覆盖全局插件配置。
