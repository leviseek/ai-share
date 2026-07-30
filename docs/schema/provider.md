# config/provider.yaml Schema

`provider.yaml` 定义可选 Provider；生成时只把当前选中的一个写入 Codex `model_providers`。

| Field                     | Type             | Required | Description                          |
| ------------------------- | ---------------- | -------- | ------------------------------------ |
| `providers`               | object           | yes      | 以合法配置 ID 为 key 的 Provider map |
| `providers.<id>.name`     | non-empty string | no       | 显示名称                             |
| `providers.<id>.base_url` | HTTPS URL        | yes      | OpenAI-compatible API base URL       |
| `providers.<id>.api_key`  | `${ENV_NAME}`    | yes      | API Key 环境变量引用                 |

固定 Provider 对象拒绝未知字段。真实 key、token、cookie 或凭据不得写入 YAML。
