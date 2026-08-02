# 模型配置知识

模型与 Provider 的事实来源仅为当前仓库配置：

- `config/global.yaml`：唯一默认 model/provider。
- `config/models.yaml`：model alias 到上游 `model_name` 的映射，以及可选 reasoning effort。
- `config/provider.yaml`：Provider 显示名、HTTPS endpoint 和 API Key 环境变量引用。

生成器只物化当前选中的 OpenCode Provider，并在该 Provider 下注册全部模型别名。交互终端未传 `--provider` 时显示 Provider 菜单；非交互选择优先级为 `--provider > AI_SHARE_PROVIDER > global.provider`。

本层不复制价格、上下文窗口、capabilities 或 fallback。需要模型事实时读取 `config/models.yaml`；需要外部最新事实时重新查证官方来源。
