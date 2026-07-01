# 模型使用知识

## 提供商与模型组

当前项目仅支持 Codex + GPT 兼容模型组：

- **gpt**：默认 codexapis，可选 packyapi、axasapi。系列包括 gpt-5.5、gpt-5.4、gpt-5.4-mini、gpt-5.5-coding。

API Key 通过环境变量引用，不写入仓库。

## 三角色模型映射

Codex CLI 使用 profile 中的三角色模型映射：

| 角色        | 用途                                | 典型模型                 |
| ----------- | ----------------------------------- | ------------------------ |
| `primary`   | 主编码/执行 agent                   | gpt-5.5 / gpt-5.5-coding |
| `reasoning` | 深度推理/规划 agent                 | gpt-5.5 / gpt-5.5-coding |
| `fast`      | 轻量/搜索/低复杂度任务和 compaction | gpt-5.4-mini             |

## Profile 模型对照表

| Profile  | primary        | reasoning      | fast         |
| -------- | -------------- | -------------- | ------------ |
| lite     | gpt-5.4        | gpt-5.4        | gpt-5.4-mini |
| economy  | gpt-5.4-mini   | gpt-5.4        | gpt-5.4-mini |
| cheap    | gpt-5.4-mini   | gpt-5.4        | gpt-5.4-mini |
| balanced | gpt-5.5        | gpt-5.5        | gpt-5.4-mini |
| coding   | gpt-5.5-coding | gpt-5.5-coding | gpt-5.4-mini |
| research | gpt-5.5        | gpt-5.5        | gpt-5.4-mini |
| writing  | gpt-5.5        | gpt-5.5        | gpt-5.4-mini |
| max      | gpt-5.5        | gpt-5.5        | gpt-5.4      |

## 模型选择策略

### 日常编码

默认 balanced 模式。primary/reasoning 都使用 gpt-5.5，fast 使用 gpt-5.4-mini，保持单 profile 内同一 provider_group。

### 纯代码实施

coding 模式。primary/reasoning 均换为 gpt-5.5-coding，编码能力更强，temperature 更低（0.1）。适合大量代码生成的场景。

### 深度推理/研究

research 或 max 模式使用 GPT 同族强力编排，reasoning 与 primary 保持 gpt-5.5。

### 轻量/低成本

cheap、economy 或 lite 模式。primary 用 gpt-5.4-mini 或 gpt-5.4，适合简单问答、快速脚本、代码搜索。

economy 保留低成本语义，但不再切换到非 GPT 模型。

### 写作/润色

writing 模式。模型与 balanced 一致，但 compaction 使用 reasoning 模型，适合文档和文章处理。

## 模型能力速览

| 模型           | 上下文 | 成本（$/1K input） | 特点                                              |
| -------------- | ------ | ------------------ | ------------------------------------------------- |
| gpt-5.5        | 200K   | 0.01               | 全能，带 reasoning、planning、long_context        |
| gpt-5.4        | 160K   | 0.008              | gpt-5.5 降级备选                                  |
| gpt-5.4-mini   | 128K   | 0.0012             | 极低成本，cheap/economy/fast/general              |
| gpt-5.5-coding | 200K   | 0.01               | 映射上游 gpt-5.5，编码专精，低 temperature（0.1） |

## Cost 意识

- gpt-5.4-mini 是成本最低的 GPT 模型（$0.0012/$0.0024），用作 fast 角色和低成本 profile。
- GPT profiles 保持 gpt provider_group 内编排；provider 可在 codexapis、packyapi、axasapi 间切换。
- Codex profile 中 agent 并发由生成的 Codex 配置控制；模型 provider 本身不写入仓库密钥。

## Compaction 策略

自动压缩默认使用 fast 角色模型。threshold 决定触发压缩的上下文长度：

| Profile  | threshold | max_input_tokens | compaction model |
| -------- | --------- | ---------------- | ---------------- |
| lite     | 40K       | 80K              | fast             |
| economy  | 40K       | 80K              | fast             |
| cheap    | 40K       | 80K              | fast             |
| balanced | 65K       | 120K             | fast             |
| coding   | 65K       | 120K             | fast             |
| research | 100K      | 180K             | reasoning        |
| writing  | 65K       | 120K             | reasoning        |
| max      | 140K      | 250K             | reasoning        |

research/writing/max 使用 reasoning 模型做 compaction，压缩质量更高但成本也高；所有 profile 均保持 GPT 同族模型。

## Fallback 链

- gpt-5.5 → gpt-5.4 → gpt-5.4-mini
- gpt-5.5-coding → gpt-5.5 → gpt-5.4

模型 YAML 保留 fallback 链用于生成器和后续工具消费；具体请求重试由 Codex 运行时处理。

## 已知模型行为

- gpt-5.5-coding：上游模型名为 gpt-5.5，temperature=0.1，输出更确定，适合代码生成但不适合创意任务。
- gpt-5.4-mini：128K 上下文但 max_output 只有 4K，不适合需要超长输出的任务。
