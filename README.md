# ai-share

这个仓库用于集中管理多台电脑、多个项目共用的 OpenCode 配置。

主要目标：

- 统一维护 OpenCode 的模型提供商、模型列表和默认模型。
- 统一维护通用 AI 协作规范。
- 统一维护 Git 提交规范。
- 通过 Git 在不同电脑之间同步配置。
- 每个具体项目仍可用自己的 `opencode.jsonc` 覆盖少量项目级配置。
- API Key 不写入仓库，只通过环境变量引用。

## 使用

安装依赖：

```sh
bun install
```

检查当前 AI 配置：

```sh
bun run check:ai -- --check
```

交互式修改模型提供商、`baseURL`、API Key 环境变量名、API Key 环境变量值、默认模型、模型列表：

```sh
bun run check:ai
```

`check:ai` 不会把真实 API Key 写入 `opencode.jsonc`，配置文件只保存 `{env:变量名}` 引用。

通用 AI 协作规范在 `AI_GUIDELINES.md`，已由 `opencode.jsonc` 自动加载。

Git 提交规范在 `GIT_COMMIT_GUIDELINES.md`，提交信息使用 `option: 中文描述` 格式。

把本仓库的 `opencode.jsonc` 共享到当前电脑的 OpenCode 全局配置：

```sh
bun run share
```

如果需要覆盖已有全局配置：

```sh
bun run share -- --force
```

如果不想创建符号链接，只想复制配置：

```sh
bun run share -- --copy --force
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

如果某个项目需要不同默认模型，在该项目根目录添加自己的 `opencode.jsonc` 即可：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek/deepseek-v4-pro-think-max",
}
```

OpenCode 会合并全局配置和项目配置，项目配置优先。
