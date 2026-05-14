# 模型使用知识

## 提供商与模型组

两个 provider group，通过 `--gpt-provider` / `--deepseek-provider` 或环境变量切换：

- **gpt**：默认 codexapis，可选 packyapi。系列包括 gpt-5.5、gpt-5.4、gpt-5.4-mini、gpt-5.3-codex。
- **deepseek**：deepseek。系列包括 deepseek-v4-pro-think-max、deepseek-v4-pro-think、deepseek-v4-flash-think、deepseek-v4-flash。

API Key 通过环境变量引用，不写入仓库。

## 三角色模型映射

OpenCode 和 OMO 共享同一套中间层角色。agents 和 categories 只引用角色名，具体模型由 profile 决定：

| 角色        | 用途                                                               | 典型模型                                          |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| `primary`   | 主编码/执行 agent（build、sisyphus、hephaestus）                   | gpt-5.5 / gpt-5.3-codex                           |
| `reasoning` | 深度推理/规划 agent（plan、oracle、prometheus）                    | deepseek-v4-pro-think / deepseek-v4-pro-think-max |
| `fast`      | 轻量/搜索 agent（explore、librarian、sisyphus-junior、compaction） | gpt-5.4-mini                                      |

## Profile 模型对照表

| Profile  | primary           | reasoning                 | fast              |
| -------- | ----------------- | ------------------------- | ----------------- |
| lite     | gpt-5.4           | deepseek-v4-flash-think   | gpt-5.4-mini      |
| economy  | deepseek-v4-flash | deepseek-v4-flash-think   | deepseek-v4-flash |
| cheap    | gpt-5.4-mini      | deepseek-v4-flash-think   | gpt-5.4-mini      |
| balanced | gpt-5.5           | deepseek-v4-pro-think     | gpt-5.4-mini      |
| coding   | gpt-5.3-codex     | deepseek-v4-pro-think     | gpt-5.4-mini      |
| research | gpt-5.5           | deepseek-v4-pro-think-max | gpt-5.4-mini      |
| writing  | gpt-5.5           | deepseek-v4-pro-think     | gpt-5.4-mini      |
| max      | gpt-5.5           | deepseek-v4-pro-think-max | gpt-5.4           |

## 模型选择策略

### 日常编码

默认 balanced 模式。primary=gpt-5.5 负责编码，reasoning=deepseek-v4-pro-think 负责规划和调试。成本和能力的均衡点。

### 纯代码实施

coding 模式。primary 换为 gpt-5.3-codex，编码能力更强，temperature 更低（0.1）。适合大量代码生成的场景。

### 深度推理/研究

research 或 max 模式。reasoning 升级为 deepseek-v4-pro-think-max，带 thinking enabled + reasoning_effort=max，context window 256K。适合架构分析、复杂调试、长上下文理解。

### 轻量/低成本

cheap 或 lite 模式。primary 用 gpt-5.4-mini 或 gpt-5.4，适合简单问答、快速脚本、代码搜索。

### 写作/润色

writing 模式。模型与 balanced 一致，但 strategy 的 memory 策略为 prose-summary，适合文档和文章处理。

### economy（激进省钱）

全 DeepSeek 方案。primary=deepseek-v4-flash，所有角色走 DeepSeek。适合预算极度敏感或对推理能力要求不高的场景。

## 模型能力速览

| 模型                      | 上下文 | 成本（$/M input） | 特点                                               |
| ------------------------- | ------ | ----------------- | -------------------------------------------------- |
| gpt-5.5                   | 200K   | 0.01              | 全能，带 reasoning、planning、long_context         |
| gpt-5.4                   | 160K   | 0.008             | gpt-5.5 降级备选                                   |
| gpt-5.4-mini              | 128K   | 0.0012            | 极低成本，cheap+fast+general                       |
| gpt-5.3-codex             | 128K   | 0.007             | 编码专精，低 temperature（0.1）                    |
| deepseek-v4-pro-think-max | 256K   | 0.005             | 最强推理，thinking enabled + reasoning_effort=max  |
| deepseek-v4-pro-think     | 128K   | 0.003             | 标准推理，thinking enabled + reasoning_effort=high |
| deepseek-v4-flash-think   | 128K   | 0.003             | 快速推理，与 pro-think 同价                        |
| deepseek-v4-flash         | 64K    | 0.0008            | 最便宜，fast+cheap+coding+general                  |

## Cost 意识

- gpt-5.4-mini 是成本最低的 GPT 模型（$0.0012/$0.0024），用作 fast 角色和 compaction。
- deepseek-v4-flash 是全局最便宜的模型（$0.0008/$0.0016），economy 模式全链路使用。
- deepseek 系比 gpt 系便宜 2-10 倍。
- max profile 虽然用 gpt-5.5 + deepseek-v4-pro-think-max，但总体成本仍可控，因为推理密集型任务走便宜的 DeepSeek。
- 后台任务并发限制：gpt=3、deepseek=1；modelConcurrency：primary=2、reasoning=1、fast=6。

## Compaction 策略

自动压缩使用 fast 角色模型（gpt-5.4-mini 或经济模式下的 deepseek-v4-flash）。threshold 决定触发压缩的上下文长度：

| Profile  | threshold          | max_input_tokens | compaction model |
| -------- | ------------------ | ---------------- | ---------------- |
| lite     | 40K                | 80K              | fast             |
| economy  | 500M（几乎不触发） | 1B               | fast             |
| cheap    | 40K                | 80K              | fast             |
| balanced | 65K                | 120K             | fast             |
| coding   | 65K                | 120K             | fast             |
| research | 100K               | 180K             | reasoning        |
| writing  | 65K                | 120K             | reasoning        |
| max      | 140K               | 250K             | reasoning        |

research/writing/max 使用 reasoning 模型做 compaction，压缩质量更高但成本也高。

## Fallback 链

- gpt-5.5 → gpt-5.4 → gpt-5.4-mini
- deepseek-v4-pro-think-max → deepseek-v4-pro-think → deepseek-v4-flash-think
- deepseek-v4-pro-think → deepseek-v4-flash-think
- deepseek-v4-flash-think → deepseek-v4-flash

配置了 `model_fallback: true` 和 runtime_fallback（429/503/529 重试）。provider 层面也做了 timeout（600s）和 chunkTimeout（30s）。

## 已知模型行为

- gpt-5.3-codex：temperature=0.1，输出更确定，适合代码生成但不适合创意任务。
- deepseek 带 thinking 的模型（pro-think、pro-think-max、flash-think）会在请求中启用 thinking 参数，响应速度比非 thinking 模型慢，但推理质量更高。
- deepseek-v4-pro-think-max：reasoning_effort=max，适合需要长链推理的架构决策和复杂调试。
- gpt-5.4-mini：128K 上下文但 max_output 只有 4K，不适合需要超长输出的任务。
- economy 模式的 compaction threshold 设为极大值，实际上禁用了自动压缩，因为 full DeepSeek 链路成本足够低。
