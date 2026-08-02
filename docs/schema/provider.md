# config/provider.yaml Schema

`provider.yaml` 定义 OpenAI-compatible Provider；生成时只物化当前选中的一个。

| Field                     | Type             | Required | Description                          |
| ------------------------- | ---------------- | -------- | ------------------------------------ |
| `providers`               | object           | yes      | 以合法配置 ID 为 key 的 Provider map |
| `providers.<id>.name`     | non-empty string | no       | 显示名称                             |
| `providers.<id>.base_url` | HTTPS URL        | yes      | OpenAI-compatible API base URL       |
| `providers.<id>.api_key`  | `${ENV_NAME}`    | yes      | API Key 环境变量引用                 |

输出使用 `@ai-sdk/openai-compatible`，并将引用转换为 OpenCode `{env:ENV_NAME}`。真实凭据不得写入 YAML。
