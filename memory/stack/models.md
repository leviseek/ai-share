# 模型使用知识

## 提供商与模型组

当前项目仅支持 Codex + GPT 兼容模型组：

- **gpt**：默认 codexapis，可选 packyapi、axasapi、lingsuan。系列包括 gpt-5.5、gpt-5.4、gpt-5.4-mini、gpt-5.5-coding。

API Key 通过环境变量引用，不写入仓库。

## 默认模型

Codex CLI 生成单套 `config.toml`，默认模型由 `config/global.yaml` 的 `model` 字段选择。当前默认是 `gpt-5.5`。

## 模型选择策略

- 日常编码、bug 修复、小功能：`gpt-5.5`。
- 纯代码实施、大量代码生成：可把 `config/global.yaml` 的 `model` 临时改为 `gpt-5.5-coding` 后重新生成。
- 简单问答、扫描、格式化：可切换到 `gpt-5.4-mini` 节省成本。
- 需要较大上下文但不需要 coding 专精：`gpt-5.4` 或 `gpt-5.5`。

## 模型能力速览

| 模型           | 上下文 | 成本（$/1K input） | 特点                                              |
| -------------- | ------ | ------------------ | ------------------------------------------------- |
| gpt-5.5        | 200K   | 0.01               | 全能，带 reasoning、planning、long_context        |
| gpt-5.4        | 160K   | 0.008              | gpt-5.5 降级备选                                  |
| gpt-5.4-mini   | 128K   | 0.0012             | 极低成本，cheap/economy/fast/general              |
| gpt-5.5-coding | 200K   | 0.01               | 映射上游 gpt-5.5，编码专精，低 temperature（0.1） |

## Cost 意识

- gpt-5.4-mini 是成本最低的 GPT 模型（$0.0012/$0.0024），适合低复杂度任务。
- provider 可在 codexapis、packyapi、axasapi、lingsuan 间切换。
- 模型 provider 本身不写入仓库密钥，只引用环境变量名。

## Fallback 链

- gpt-5.5 → gpt-5.4 → gpt-5.4-mini
- gpt-5.5-coding → gpt-5.5 → gpt-5.4

模型 YAML 保留 fallback 链用于生成器和后续工具消费；具体请求重试由 Codex 运行时处理。

## 已知模型行为

- gpt-5.5-coding：上游模型名为 gpt-5.5，temperature=0.1，输出更确定，适合代码生成但不适合创意任务。
- gpt-5.4-mini：128K 上下文但 max_output 只有 4K，不适合需要超长输出的任务。
