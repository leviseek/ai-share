# 模型配置知识

模型与 Provider 的事实来源仅为当前仓库配置：

- `config/global.yaml`：唯一默认 model/provider。
- `config/models.yaml`：本地 model ID 到上游 `model_name` 的映射，以及可选 reasoning effort。
- `config/provider.yaml`：Provider 显示名、HTTPS endpoint 和 API Key 环境变量引用。

生成器只物化一套 Codex config，并只写入当前选中的 Provider。交互终端未传 `--provider` 时显示 Provider 菜单，
有效的 `AI_SHARE_PROVIDER` 优先作为初始选中项，否则使用 `global.provider`；显式 `--provider` 跳过菜单。非交互环境仍按
`--provider > AI_SHARE_PROVIDER > global.provider` 确定性选择。

本层不复制具体模型清单、价格、上下文窗口、capabilities 或 fallback。需要模型事实时读取 `config/models.yaml`；需要外部最新事实时重新查证官方来源，不能把过期表格作为决策依据。
