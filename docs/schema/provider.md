# config/provider.yaml Schema

`provider.yaml` 定义 Provider、关联模型及 Provider 默认模型；生成时只物化当前选中的一个。

| Field                          | Type             | Required | Description                                   |
| ------------------------------ | ---------------- | -------- | --------------------------------------------- |
| `providers`                    | object           | yes      | 以合法配置 ID 为 key 的 Provider map          |
| `providers.<id>.name`          | non-empty string | no       | 显示名称                                      |
| `providers.<id>.base_url`      | HTTPS URL        | yes      | Provider API base URL                         |
| `providers.<id>.api_key`       | `${ENV_NAME}`    | yes      | API Key 环境变量引用                          |
| `providers.<id>.models`        | string ID[]      | yes      | 该 Provider 关联的非空、无重复 model id 列表  |
| `providers.<id>.default_model` | string ID        | yes      | `models` 中选择该 Provider 时使用的默认 model |
| `providers.<id>.native`        | boolean          | no       | 是否使用 OpenCode 原生 Provider 配置          |

`models` 和 `default_model` 必须引用 `models.yaml`，且 `default_model` 必须属于同一 Provider 的 `models`。
选中 Provider 后，生成和在线检查都只处理其关联模型；非默认 Provider 使用自己的 `default_model`。未设置
`native` 时输出使用 `@ai-sdk/openai-compatible`，设置 `native: true` 时输出 OpenCode 原生 Provider 的
`whitelist` 和 transport options。API Key 引用转换为 `{env:ENV_NAME}`，真实凭据不得写入 YAML。
