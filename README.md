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
~/.config/opencode/profiles/opencode/lite.json
~/.config/opencode/profiles/aioc/lite.json
~/.config/opencode/profiles/opencode/cheap.json
~/.config/opencode/profiles/aioc/cheap.json
~/.config/opencode/profiles/opencode/balanced.json
~/.config/opencode/profiles/aioc/balanced.json
~/.config/opencode/profiles/opencode/coding.json
~/.config/opencode/profiles/aioc/coding.json
~/.config/opencode/profiles/opencode/research.json
~/.config/opencode/profiles/aioc/research.json
~/.config/opencode/profiles/opencode/writing.json
~/.config/opencode/profiles/aioc/writing.json
~/.config/opencode/profiles/opencode/max.json
~/.config/opencode/profiles/aioc/max.json
~/.config/opencode/oh-my-openagent.json
~/.config/opencode/profiles/oh-my-openagent/lite.json
~/.config/opencode/profiles/oh-my-openagent/cheap.json
~/.config/opencode/profiles/oh-my-openagent/balanced.json
~/.config/opencode/profiles/oh-my-openagent/coding.json
~/.config/opencode/profiles/oh-my-openagent/research.json
~/.config/opencode/profiles/oh-my-openagent/writing.json
~/.config/opencode/profiles/oh-my-openagent/max.json
~/.config/opencode/strategy.json
~/.config/opencode/profiles/strategy/lite.json
~/.config/opencode/profiles/strategy/cheap.json
~/.config/opencode/profiles/strategy/balanced.json
~/.config/opencode/profiles/strategy/coding.json
~/.config/opencode/profiles/strategy/research.json
~/.config/opencode/profiles/strategy/writing.json
~/.config/opencode/profiles/strategy/max.json
~/.config/opencode/profiles/context-guard/lite.json
~/.config/opencode/profiles/context-guard/cheap.json
~/.config/opencode/profiles/context-guard/balanced.json
~/.config/opencode/profiles/context-guard/coding.json
~/.config/opencode/profiles/context-guard/research.json
~/.config/opencode/profiles/context-guard/writing.json
~/.config/opencode/profiles/context-guard/max.json
~/.config/opencode/dingtalk-notifier.json
~/.config/opencode/proxy.json
~/.config/opencode/.omo-profiles.json
~/.config/opencode/plugins/omo-agent-monitor/package.json
~/.config/opencode/plugins/omo-agent-monitor/server.js
~/.config/opencode/plugins/omo-agent-monitor/tui.js
~/.config/opencode/plugins/dingtalk-notifier/package.json
~/.config/opencode/plugins/dingtalk-notifier/server.js
~/.config/opencode/plugins/dingtalk-notifier/tui.js
~/.config/opencode/skills/git-master/SKILL.md
~/.config/opencode/skills/context-guard/SKILL.md
~/.config/opencode/skills/ai-share-generator/SKILL.md
~/.config/opencode/skills/install-doctor/SKILL.md
~/.config/opencode/skills/config-profile-tuning/SKILL.md
~/.config/opencode/skills/release-commit/SKILL.md
~/.config/opencode/skills/plugin-vetting/SKILL.md
~/.config/opencode/skills/skill-creator/SKILL.md
~/.config/opencode/skills/find-skills/SKILL.md
~/.config/opencode/skills/frontend-design/SKILL.md
```

本仓库会安装一组本地 native skills，供 `aiomo` 和 `aioc` 共享使用：

- `git-master`：安全 Git 操作、原子提交、历史搜索。
- `context-guard`：上下文守卫、watch/rescue/handoff 和熔断历史排查。
- `ai-share-generator`：修改 `config/*.yaml`、生成器和安装输出时的工作流。
- `install-doctor`：诊断 `aiomo doctor install` / `aioc doctor install` 输出。
- `config-profile-tuning`：调整模型角色、profile、compaction 和上下文预算。
- `release-commit`：按批次组织提交、发布式摘要和推送前验证。
- `plugin-vetting`：新增共享插件或可选插件前的来源、权限和作用域审查。
- `skill-creator`：新增、维护和审查本仓库本地 native skills 的流程。
- `find-skills`：列出并选择当前任务最相关的本地 native skill。
- `frontend-design`：前端 UI/UX、CSS、布局、可访问性和视觉实现。

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

`opencode-install-doctor.ts` 与 `opencode-context-guard.ts` 也会安装到同一目录，作为 `aiomo` / `aioc` 内部使用的检查和上下文守卫脚本；它们需要启动器通过 Bun 传入参数，不作为普通启动命令直接使用。上下文守卫实现源代码位于 `src/context-guard/`，安装时复制为用户 bin 下的 `opencode-context-guard.ts` 和 `context-guard/*.ts`。

Windows 会自动把该目录加入用户级 PATH。已经打开的终端可能需要重启后才能直接使用 `aiomo` / `aioc` / `aiomo-monitor`。

macOS/Linux 不会自动修改 shell 配置；请确认 `~/.local/bin` 已在 PATH 中。

生成脚本只会把 API Key 写成 `{env:变量名}` 引用，不会把真实密钥写入配置文件。

默认会安装一个共享钉钉机器人通知插件 `./plugins/dingtalk-notifier`，并生成 `dingtalk-notifier.json`。插件默认从用户环境变量读取钉钉机器人配置，不会把真实 webhook 或签名写入仓库或生成配置：

```text
AI_SHARE_DINGTALK_WEBHOOK # 完整钉钉机器人 webhook 地址，包含 access_token
AI_SHARE_DINGTALK_SECRET  # 可选；机器人启用“加签”时填写 SEC... 签名密钥
AI_SHARE_DINGTALK_KEYWORD # 可选；机器人启用关键词安全策略时用于自动放入通知标题
```

Windows PowerShell 示例：

```powershell
[Environment]::SetEnvironmentVariable("AI_SHARE_DINGTALK_WEBHOOK", "https://oapi.dingtalk.com/robot/send?access_token=your-token", "User")
[Environment]::SetEnvironmentVariable("AI_SHARE_DINGTALK_SECRET", "SECxxxxxxxx", "User")
[Environment]::SetEnvironmentVariable("AI_SHARE_DINGTALK_KEYWORD", "ai-share", "User")
```

macOS/Linux 示例：

```sh
export AI_SHARE_DINGTALK_WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=your-token"
export AI_SHARE_DINGTALK_SECRET="SECxxxxxxxx"
export AI_SHARE_DINGTALK_KEYWORD="ai-share"
```

插件配置源在 `config/global.yaml` 的 `dingtalk_notifier`，可配置 `webhook_env`、`secret_env`、`keyword_env`、`message_type`、`events`、`require_review_before_send`、`review_items`、`min_interval_ms` 和 `timeout_ms`。默认监听 `session.idle`，并启用 `require_review_before_send`：任务完成后先由 AI 在当前会话中整理并确认会话内容摘要、任务结果、验证结论和剩余风险等可通知信息，确认前插件不会自动外发钉钉通知；确认后 AI 会在当前会话输出优化后的通知内容，只有用户明确要求外发时才执行外部通知发送。未设置 webhook 环境变量时插件会静默跳过发送。

另外还会安装一个本地 TUI 插件 `./plugins/live2d-pet`，它会在 OpenCode TUI 中提供 `Live2D pet` 命令与 `/live2d-pet` slash 入口，优先通过 Tauri 打开本地独立透明置顶窗口并加载白猫 `Tororo`。如果本机还没有可用的 Tauri 二进制，会回退到浏览器 app 窗口；模型资源只通过公开 CDN 读取，不会把第三方模型文件打包进仓库或生成配置。

如果你想直接以桌面独立方式打开它，也可以运行 `live2d-pet`。首次使用 Tauri 前，可以在仓库根目录运行 `bun run live2d-pet:build`，它会通过 `@tauri-apps/cli` 构建 `plugins/live2d-pet/src-tauri` 并生成 `plugins/live2d-pet/src-tauri/target/release/live2d-pet`（Windows 下为 `live2d-pet.exe`）。随后运行 `bun run ai:gen -- --force` 时，安装器会在用户插件目录保留 `src-tauri/` 源码、排除构建缓存，并在检测到发布二进制时复制该可执行文件。未构建时仍会使用原来的 Chromium/Edge/Chrome 回退窗口。`aiomo` / `aioc` 启动时会自动拉起同一套本地独立窗口，退出时会一并关闭。

Linux 上构建 Tauri 还需要系统依赖 `pkg-config` 和 `libdbus-1-dev`。如果本机没有这些包，`cargo check` / `cargo tauri build` 会先在 `libdbus-sys` 阶段失败。

默认会额外生成 `proxy.json`，并让 `aiomo` / `aioc` 启动器在启动 OpenCode 前自动设置标准代理环境变量。默认代理为 `http://127.0.0.1:7897`，会写入 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` 及对应小写变量，`NO_PROXY` 默认包含 `localhost,127.0.0.1,::1`。如果当前 shell 已经设置了这些标准变量，启动器不会覆盖；如需临时关闭共享代理，可设置 `AI_SHARE_PROXY=0`；如需临时改端口或完整地址，可设置 `AI_SHARE_PROXY_PORT=7890` 或 `AI_SHARE_PROXY_URL=http://127.0.0.1:7890`。

通用 AI 协作规范在 `AI_GUIDELINES.md`，生成的 OpenCode 配置会加载该文件。

生成的 oh-my-openagent 配置会禁用 `auto-slash-command` hook，避免 native skills（例如 `/git-master`）被插件二次展开并在 TUI 中显示完整内部提示词。

Git 提交规范在 `GIT_COMMIT_GUIDELINES.md`，提交信息使用 `option: 中文描述` 格式。

## 启动 OpenCode

本仓库不通过 `bun run start` 启动 agent。执行 `bun run ai:gen` 后，切换到其他项目也可以直接使用全局启动命令。

当前推荐把启动方式分成两类：

```sh
# oh-my-openagent 多 agents 编排模式，加载完整共享插件
aiomo

# OpenCode 原生 Build / Plan 模式，排除 OMO 相关插件
aioc
```

为了减少记忆成本，同时避免和常见开发工具命名重合，不建议使用 `oc`（OpenShift 常用）、`code`（VS Code）、`op`（1Password）这类短名。本仓库会安装 `aiomo` / `aioc` 启动包装器：

```text
bin/aiomo      -> opencode，并可选择 OMO 编排级别
bin/aioc       -> opencode，并切换到过滤 OMO 插件后的 aioc 配置
bin/aiomo-monitor -> Windows 桌面独立监控浮窗
bin/aiomo.cmd  -> opencode，并可选择 OMO 编排级别
bin/aiomo.ps1  -> aiomo.cmd 使用的 PowerShell 启动逻辑
bin/aioc.cmd   -> opencode，并切换到过滤 OMO 插件后的 aioc 配置
bin/aioc.ps1   -> PowerShell 原生 aioc 配置切换启动逻辑
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

# 原生模式：Tab 切换 OpenCode 原生 Build / Plan，默认使用 balanced
aioc

# 原生模式也支持选择级别，插件会按 opencode.aioc.<profile>.json 生效
aioc coding
aioc --profile=max

# 检查共享配置、插件、skills、TUI 插件配置和安装文件是否存在，并核对当前模式的插件配置
aiomo doctor install
aioc doctor install

# 原生 CLI 指定 agent
aioc run --agent plan "请只输出计划，不要修改文件"
aioc run --agent build "请说明当前项目结构"

# 桌面独立监控浮窗（Windows）
aiomo-monitor
```

`doctor install` 输出 `OK` / `WARN` / `FAIL`：`OK` 表示该项已安装或配置符合当前模式；`WARN` 表示可能可用但需要关注，例如当前终端 PATH 尚未刷新；`FAIL` 表示缺失或配置不一致，需要重新运行 `bun run ai:gen -- --force` 或修复环境。该检查为轻量级静态/版本探测，不会启动 OpenCode TUI，也不验证插件运行时渲染。

首次安装时需要网络访问以便 OpenCode 拉取 OMO 插件包。若 `doctor install` 报告插件缺失，请在网络可用时重新运行 `bun run ai:gen -- --force`。

### Gitignore Doctor

`aiomo doctor gitignore` 可以在当前 Git 仓库检查常见本地状态、密钥文件、依赖目录和构建产物是否已写入 `.gitignore`。默认只输出建议，不修改文件：

```sh
aiomo doctor gitignore
```

确认要自动追加缺失规则时使用：

```sh
aiomo doctor gitignore --apply
```

它会按当前项目特征补充规则，例如 `.opencode/context-guard-watch/`、`.opencode/handoff/`、`.opencode-rescue/`、`.env`、`node_modules/`、`dist/`、`coverage/`、Python 缓存、Rust `target/`、Go/JVM 常见输出目录等。不会忽略整个 `.opencode/`，以便项目级 OpenCode 配置可以入库。

`aioc` 启动时会为本次进程准备独立的活动配置目录，并通过 `OPENCODE_CONFIG` / `OPENCODE_CONFIG_DIR` 指向对应的 aioc profile；它不会覆盖共享的 `~/.config/opencode/opencode.json`。它不使用 `--pure`，默认通过 `config/global.yaml` 的 `opencode.aioc_excluded_plugins` 排除 `oh-my-openagent` 和 OMO 监控插件。

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
    - ./plugins/dingtalk-notifier
```

升级 OMO 插件时，只需要修改这里的版本号，然后重新运行 `bun run ai:gen -- --force`。

对应的 agents/categories/fallback/background task 等配置来自生成的 `oh-my-openagent.json`。`aiomo` 启动时会先读取 `.omo-profiles.json` 中的默认级别和可用级别清单，再为本次进程准备独立的活动配置目录，并通过 `OPENCODE_CONFIG` / `OPENCODE_CONFIG_DIR` 指向所选级别的 OpenCode 与 OMO 配置快照。因此同时运行 `aioc` / `aiomo` 或切换 profile 时，不会互相覆盖共享配置入口。

`aiomo run "..."` 适合做非交互 smoke test，通常会由默认的 Sisyphus / `primary` 模型执行。OMO category 路由和并行 agent 委派依赖运行时 `task()` / background task 调用，建议在交互式 `aiomo` 会话中验证，或在 prompt 中明确要求委派；不要仅凭一次 `aiomo run` 是否使用 `quick` / `deep` 模型判断编排配置是否失效。

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

默认 `config/global.yaml` 使用 `context.cache_enabled: true` 开启这类 AI 上下文缓存策略；生成器会把
OpenCode 和 OMO 的 `dcp` / `checkpoint` / `memory` 写入 `strategy.<profile>.json`。如果需要关闭，可显式改为
`context.cache_enabled: false`，此时生成器会把这些策略都写成 `enabled: false`。

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
`strategy.<profile>.json` 复制为当前生效的 `strategy.json`，并随 profile 切换 DCP 上下文预算、checkpoint 保留数量和 memory 摘要粒度。

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
  alert_file: .opencode/context-guard-watch/alert.json
  history_dir: .opencode/context-guard-watch/history
```

超过阻断线时，启动器默认不会直接恢复旧 session，避免还没来得及 `/compact` 就卡住。推荐先生成本地救援摘要：

```sh
aiomo rescue ses_xxx
```

`watch` 会把日志产物统一收纳到 `.opencode/context-guard-watch/`。最近一次风险事件写入 `.opencode/context-guard-watch/alert.json`，其中包含 `session_id` 和建议的 `continue_command`。同时，每次新的风险事件都会在 `.opencode/context-guard-watch/history/` 下追加一个 `.jsonc` 快照，文件名使用 `UTC时间-本地时间_原因_session` 格式，例如 `20260430181408-20260501021408_context-warning_ses_xxx.jsonc`，便于熔断后按会话历史辨认应该从哪个 session 接力；JSONC 内容会优先显示本地时间，并用注释标出继续命令。watch 进程自身的 stdout/stderr 日志会写入用户配置目录下的 `context-guard-watch/logs/`，避免散落在配置根目录。

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

`config/global.yaml` 也支持 `opencode.aioc_excluded_plugins`。生成 `opencode.aioc.<profile>.json` 时会从共享插件列表中移除这些插件，用于让 `aioc` 保持 OpenCode 原生 Build / Plan 体验：

```yaml
opencode:
  aioc_excluded_plugins:
    - oh-my-openagent@3.17.5
    - ./plugins/omo-agent-monitor
```

`live2d-pet` 只挂在 `tui.plugins`，不会进入 `opencode.plugins`，因此不会影响 `aioc` 的原生 Build / Plan 插件列表。

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

共享代理也可以通过环境变量临时覆盖，不需要修改仓库配置：

```text
AI_SHARE_PROXY=0                         # 关闭启动器自动代理注入
AI_SHARE_PROXY_URL=http://127.0.0.1:7890 # 覆盖完整代理地址
AI_SHARE_PROXY_PROTOCOL=http             # 覆盖协议，默认 http
AI_SHARE_PROXY_HOST=127.0.0.1            # 覆盖主机，默认 127.0.0.1
AI_SHARE_PROXY_PORT=7890                 # 只覆盖默认端口
AI_SHARE_NO_PROXY=localhost,127.0.0.1    # 覆盖 NO_PROXY
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
