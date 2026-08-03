# config/models.yaml Schema

`models.yaml` 是唯一模型目录。每个 top-level key 是合法配置 ID，并只允许以下字段：

| Field                         | Type             | Required | Description                  |
| ----------------------------- | ---------------- | -------- | ---------------------------- |
| `<model_id>.model_name`       | non-empty string | yes      | 发送给上游 Provider 的模型名 |
| `<model_id>.reasoning_effort` | enum             | no       | `low`、`medium` 或 `high`    |

不保存 Provider 归属、成本、上下文窗口、capabilities、temperature、parameters 或 fallback。Provider 与
model id 的关联及 Provider 默认模型由 `provider.yaml` 声明；生成和在线检查只解析当前 Provider 关联的
model id，并按去重后的 `model_name` 访问上游。

```yaml
example-model:
  model_name: upstream-example-model
  reasoning_effort: medium
```
