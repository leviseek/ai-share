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
~/.config/opencode/strategy.json
~/.config/opencode/strategy.lite.json
~/.config/opencode/strategy.cheap.json
~/.config/opencode/strategy.balanced.json
~/.config/opencode/strategy.coding.json
~/.config/opencode/strategy.research.json
~/.config/opencode/strategy.writing.json
~/.config/opencode/strategy.max.json
~/.config/opencode/.omo-profiles.json
~/.config/opencode/plugins/omo-agent-monitor/package.json
~/.config/opencode/plugins/omo-agent-monitor/server.js
~/.config/opencode/plugins/omo-agent-monitor/tui.js
~/.config/opencode/skills/git-master/SKILL.md
```

同时会安装启动命令到用户级 bin 目录：

```text
~/.local/bin/aiomo
~/.local/bin/aioc
~/.local/bin/aiomo-monitor
```

Windows 下对应为：

```text
%USERPROFILE%\.local\bin\aiomo.cmd
%USERPROFILE%\.local\bin\aiomo.ps1
%USERPROFILE%\.local\bin\aioc.cmd
%USERPROFILE%\.local\bin\aioc.ps1
%USERPROFILE%\.local\bin\aiomo-monitor.cmd
%USERPROFILE%\.local\bin\aiomo-monitor.ps1
```

Windows 会自动把该目录加入用户级 PATH。已经打开的终端可能需要重启后才能直接使用 `aiomo` / `aioc` / `aiomo-monitor`。

macOS/Linux 不会自动修改 shell 配置；请确认 `~/.local/bin` 已在 PATH 中。

生成脚本只会把 API Key 写成 `{env:变量名}` 引用，不会把真实密钥写入配置文件。

通用 AI 协作规范在 `AI_GUIDELINES.md`，生成的 OpenCode 配置会加载该文件。

生成的 oh-my-openagent 配置会禁用 `auto-slash-command` hook，避免 native skills（例如 `/git-master`）被插件二次展开并在 TUI 中显示完整内部提示词。

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
bin/aiomo-monitor -> Windows 桌面独立监控浮窗
bin/aiomo.cmd  -> opencode，并可选择 OMO 编排级别
bin/aiomo.ps1  -> aiomo.cmd 使用的 PowerShell 启动逻辑
bin/aioc.cmd   -> opencode --pure
bin/aioc.ps1   -> PowerShell 原生 opencode --pure 启动逻辑
bin/aiomo-monitor.cmd -> aiomo-monitor.ps1 启动包装器
bin/aiomo-monitor.ps1 -> 桌面独立浮窗逻辑（置顶/拖拽/折叠）
```

macOS/Linux shell PATH 示例：

```sh
export PATH="$HOME/.local/bin:$PATH"
```

如果不想修改 PATH，也可以直接使用完整路径：

```sh
~/.local/bin/aiomo
~/.local/bin/aioc
~/.local/bin/aiomo-monitor
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

# 桌面独立监控浮窗（Windows）
aiomo-monitor
```

### Gitignore Doctor

`aiomo doctor gitignore` 可以在当前 Git 仓库检查常见本地状态、密钥文件、依赖目录和构建产物是否已写入 `.gitignore`。默认只输出建议，不修改文件：

```sh
aiomo doctor gitignore
```

确认要自动追加缺失规则时使用：

```sh
aiomo doctor gitignore --apply
```

它会按当前项目特征补充规则，例如 `.opencode/`、`.opencode-rescue/`、`.env`、`node_modules/`、`dist/`、`coverage/`、Python 缓存、Rust `target/`、Go/JVM 常见输出目录等。

`aioc` 不切换 OMO 编排级别，会直接使用当前生效的 `opencode.json`；如果之前运行过 `aiomo lite` / `aiomo max` 等命令，`aioc` 会沿用最后一次切换后的 OpenCode 基础配置和 compaction 策略。

## OMO 状态监控

生成配置后，`aiomo` 会加载一个极简 OMO agents 状态监控插件：

```text
~/.config/opencode/plugins/omo-agent-monitor/
```

在 OpenCode TUI 中打开命令面板，执行 `OMO agents monitor (WebUI)`，或输入 slash 命令：

```text
/omo-monitor
```

命令会在浏览器打开本地 WebUI 浮窗（默认 `127.0.0.1` 随机端口）。

如果你希望使用桌面独立窗口（始终置顶、可拖拽、可折叠），可直接执行：

```sh
aiomo-monitor
```

该命令会读取 `~/.config/opencode/omo-agent-monitor-state.json` 并每秒刷新显示。

监控浮窗会显示：

- 规划任务总数、完成进度、进行中任务和待处理任务。
- 总消耗 token。
- 已执行时长与空闲持续时长（以进度条和文本同时展示）。
- 当前进行中的规划任务内容。
- agents 列表，按运行中、重试、异常、空闲、未知排序。
- 每个 agent 的状态、已执行任务数、平均每任务执行周期。
- 支持拖拽浮窗位置，并支持折叠为仅显示基础信息条。

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

当前内置 8 个 OMO 编排级别，每个级别固定使用 3 个模型角色：

```text
lite：primary=gpt-5.4，reasoning=deepseek-v4-flash-think，fast=gpt-5.4-mini
economy：primary=deepseek-v4-flash，reasoning=deepseek-v4-flash-think，fast=deepseek-v4-flash
cheap：primary=gpt-5.4-mini，reasoning=deepseek-v4-flash-think，fast=gpt-5.4-mini
balanced：primary=gpt-5.5，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
coding：primary=gpt-5.3-codex，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
research：primary=gpt-5.5，reasoning=deepseek-v4-pro-think-max，fast=gpt-5.4-mini
writing：primary=gpt-5.5，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
max：primary=gpt-5.5，reasoning=deepseek-v4-pro-think-max，fast=gpt-5.4
```

`config/agents.yaml` 中的 agents/categories 引用 `primary`、`reasoning`、`fast` 这 3 个中间层角色；具体模型由 `config/profiles.yaml` 决定。

`aiomo` 切换 profile 时，OpenCode 原生 `build` / `plan` / `general` agent 会使用当前 profile 的 `primary`，`explore` / `title` / `summary` 会使用当前 profile 的 `fast`；oh-my-openagent 插件 agents/categories 也使用同一套角色映射。这样原生模式和 OMO 插件模式在同一 profile 下保持模型分工一致。

`config/profiles.yaml` 中的每个 OMO 编排级别也可以覆盖 `compaction`，用于按模式调节 OpenCode 自动压缩与启动前上下文守卫预算：

```yaml
balanced:
  compaction:
    enabled: true
    threshold: 80000
    model: fast
    max_input_tokens: 120000
```

生成到 OpenCode 顶层 `compaction` 时会使用当前 schema 支持的 `auto` / `prune` / `reserved` 字段；`threshold` 会换算为 `reserved = max_input_tokens - threshold`，`max_input_tokens` 会生成到 `context-guard.<profile>.json` 供 `aiomo` 恢复旧 session 前判断风险。`model` 会生成到 `agent.compaction.model`，可以直接写模型 ID，也可以写 `primary`、`reasoning`、`fast` 这类 profile 模型角色。未在 profile 中声明的字段会回退到 `config/global.yaml` 的 `compaction` 默认值。

同一个 profile 也可以通过 `strategies` 覆盖共享策略。OpenCode 和 oh-my-openagent 的主配置会遵循各自
schema；DCP / checkpoint / memory 这类共享策略会生成到独立的 `strategy.<profile>.json` sidecar，避免向
`opencode.json` 写入未知顶层字段。生成 `strategy.<profile>.json` 时会合并 `config/global.yaml` 的
`dcp` / `checkpoint` / `memory` 默认策略与 `profiles.<profile>.strategies.opencode`，并合并
`config/agents.yaml` 的默认策略与 `profiles.<profile>.strategies.oh_my_openagent`：

```yaml
max:
  strategies:
    opencode:
      dcp:
        context_budget_tokens: 56000
      checkpoint:
        max_entries: 48
      memory:
        strategy: detailed-summary
    oh_my_openagent:
      dcp:
        context_budget_tokens: 56000
      checkpoint:
        max_entries: 48
      memory:
        strategy: detailed-summary
```

这样 `aiomo lite` / `aiomo balanced` / `aiomo max` 切换编排级别时，会同步把对应的
`strategy.<profile>.json` 复制为当前生效的 `strategy.json`，切换 DCP 上下文预算、checkpoint 保留数量和 memory 摘要粒度。

### 上下文守卫

生成配置时会额外写入用户级 `context-guard.json`，并安装 `opencode-context-guard.mjs`。`aiomo` 在恢复旧 session 前会读取 OpenCode SQLite 记录，按 `input_tokens / max_input_tokens` 做风险分级；`aioc` 是一步一操作的原生模式，不做上下文过长熔断检测。

```yaml
context_guard:
  enabled: true
  warn_ratio: 0.5
  danger_ratio: 0.75
  block_ratio: 0.9
  absolute_block_tokens: 180000
  rescue_dir: .opencode-rescue
  diagnostics: true
  alert_file: .opencode/context-guard-alert.json
  history_dir: .opencode/context-guard-history
```

超过阻断线时，启动器默认不会直接恢复旧 session，避免还没来得及 `/compact` 就卡住。推荐先生成本地救援摘要：

```sh
aiomo rescue ses_xxx
```

`watch` 会把最近一次风险事件写入 `.opencode/context-guard-alert.json`，其中包含 `session_id` 和建议的 `continue_command`。同时，每次新的风险事件都会在 `.opencode/context-guard-history/` 下追加一组同名 `.md` / `.json` 快照，文件名包含时间、原因和 session id，便于熔断后按会话历史辨认应该从哪个 session 接力。

救援摘要会写入当前目录的 `.opencode-rescue/<session-id>.md`，只做本地规则提取，不调用模型。确认要强制恢复时，可以显式传入 `--force`：

```sh
aiomo -s ses_xxx --force
```

### 可选 OpenCode 插件

`config/global.yaml` 支持 `opencode.optional_plugins`。它会和 `opencode.plugins` 合并后写入用户级 `opencode.json`。未知来源的插件默认不启用；例如 `Opencode-DCP` 需要先确认准确包名或本地路径后，再加入：

```yaml
opencode:
  optional_plugins:
    - <confirmed-opencode-dcp-package-or-path>
```

## 配置源

当前保留 YAML 生成路线：

```text
config/global.yaml    -> 全局运行、OpenCode/TUI 插件、默认 profile、默认/小模型、compaction 和 context guard 策略
config/provider.yaml  -> 模型提供商、baseURL、API Key 环境变量名
config/models.yaml    -> 模型列表、provider/provider_group、上游模型名、参数、fallback
config/profiles.yaml  -> OMO 编排级别、模型角色映射和 profile 级策略覆盖；默认级别由 global.yaml 的 default_profile 指定
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
