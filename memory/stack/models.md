# 模型使用知识

## 提供商与模型组

当前项目仅支持 Codex + GPT 兼容模型组：

- **gpt**：默认 codexapis，可选 packyapi、axasapi、lingsuan。系列包括 gpt-5.6-sol、gpt-5.6-terra、gpt-5.6-luna、gpt-5.5，以及本地 Codex 预设 gpt-5.6-coding、gpt-5.5-coding。

API Key 通过环境变量引用，不写入仓库。

## 默认模型

Codex CLI 生成单套 `config.toml`，默认模型由 `config/global.yaml` 的 `model` 字段选择。当前默认是 `gpt-5.5`。

## 模型选择策略

- 日常编码、bug 修复、小功能：当前默认仍是 `gpt-5.5`。
- 高复杂度推理、长上下文和大量代码生成：可把 `config/global.yaml` 的 `model` 临时改为 `gpt-5.6-coding` 或 `gpt-5.6-sol` 后重新生成。
- 成本/延迟均衡：可切换到 `gpt-5.6-terra` 或 `gpt-5.5`。
- 简单问答、扫描、格式化：可切换到 `gpt-5.6-luna` 节省成本。

## 模型能力速览

| 模型           | 上下文 | 成本（$/1K input） | 特点                                                  |
| -------------- | ------ | ------------------ | ----------------------------------------------------- |
| gpt-5.6-sol    | 1M     | 0.005              | 最新旗舰，适合复杂推理、长上下文和 coding             |
| gpt-5.6-terra  | 1M     | 0.0025             | 质量/成本均衡，适合通用推理和规划                     |
| gpt-5.6-luna   | 1M     | 0.001              | 快速低价，适合一般任务和长上下文                      |
| gpt-5.5-pro    | 200K   | 0.03               | 高价 premium 档，作为特定高质量备选                   |
| gpt-5.5        | 400K   | 0.005              | 当前默认模型，带 coding、reasoning、planning          |
| gpt-5.6-coding | 1M     | 0.005              | 本地预设，映射上游 gpt-5.6-sol，低 temperature（0.1） |
| gpt-5.5-coding | 400K   | 0.005              | 本地预设，映射上游 gpt-5.5，低 temperature（0.1）     |

## Cost 意识

- `gpt-5.6-luna` 是当前模型目录中 input 成本最低的 GPT 模型，适合低复杂度任务。
- provider 可在 codexapis、packyapi、axasapi、lingsuan 间切换。
- 模型 provider 本身不写入仓库密钥，只引用环境变量名。

## Fallback 链

- gpt-5.6-sol → gpt-5.6-terra → gpt-5.6-luna
- gpt-5.6-terra → gpt-5.6-luna → gpt-5.5
- gpt-5.6-coding → gpt-5.6-sol → gpt-5.5

模型 YAML 保留 fallback 链用于生成器和后续工具消费；具体请求重试由 Codex 运行时处理。

## 已知模型行为

- `gpt-5.6-coding` 和 `gpt-5.5-coding` 是本地 Codex 预设别名，不是额外上游模型名。
- 成本字段是 OpenAI 官方 per-1M token 价格换算为仓库约定的 per-1K token 值。
