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

预览将生成的用户级配置：

```sh
bun run ai:check
```

或直接运行生成脚本的 dry-run：

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

生成结果位于当前用户的 OpenCode 配置目录：

```text
~/.config/opencode/opencode.json
~/.config/opencode/oh-my-openagent.json
~/.config/opencode/oh-my-openagent.lite.json
~/.config/opencode/oh-my-openagent.balanced.json
~/.config/opencode/oh-my-openagent.max.json
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

# 选择 OMO 编排级别；默认等价于 aiomo balanced
aiomo lite
aiomo balanced
aiomo max

# 也支持显式参数形式，后续参数继续透传给 opencode
aiomo --omo-profile=max run "请分析当前项目"

# 原生模式：Tab 切换 OpenCode 原生 Build / Plan
aioc

# 原生 CLI 指定 agent
aioc run --agent plan "请只输出计划，不要修改文件"
aioc run --agent build "请说明当前项目结构"
```

如果不想配置函数，也可以直接使用原始命令：

```sh
opencode
opencode --pure
```

OpenCode 原生 agent 模式由生成的 `opencode.json` 中的 `agent` 配置决定。

oh-my-openagent 多 agents 编排模式通过生成的 `opencode.json` 中的插件配置启用：

```json
"plugin": ["oh-my-openagent@3.17.5"]
```

对应的 agents/categories/fallback/background task 等配置来自生成的 `oh-my-openagent.json`。`aiomo` 启动时会先把所选级别的 `oh-my-openagent.<profile>.json` 复制为当前生效的 `oh-my-openagent.json`。

当前内置 3 个 OMO 编排级别，每个级别固定使用 3 个模型角色：

```text
lite：primary=gpt-5.4，reasoning=deepseek-v4-flash-think，fast=gpt-5.4-mini
balanced：primary=gpt-5.5，reasoning=deepseek-v4-pro-think，fast=gpt-5.4-mini
max：primary=gpt-5.5，reasoning=deepseek-v4-pro-think-max，fast=gpt-5.4
```

`config/agents.yaml` 中的 agents/categories 引用 `primary`、`reasoning`、`fast` 这 3 个中间层角色；具体模型由 `profiles` 决定。

## 配置源

当前保留 YAML 生成路线：

```text
config/global.yaml    -> 全局运行和上下文参数
config/provider.yaml  -> 模型提供商、baseURL、API Key 环境变量名
config/models.yaml    -> 模型列表、上游模型名、参数、fallback
config/agents.yaml    -> oh-my-openagent profiles/agents/categories/runtime_fallback/background_task
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
DEEPSEEK_API_KEY
```

Windows PowerShell 示例：

```powershell
[Environment]::SetEnvironmentVariable("CODEXAPIS_API_KEY", "your-key", "User")
[Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "your-key", "User")
```

macOS/Linux 示例：

```sh
export CODEXAPIS_API_KEY="your-key"
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
