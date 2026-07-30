# config/models.yaml Schema

`models.yaml` 是唯一模型目录。每个 top-level key 是合法配置 ID，并只允许以下字段：

| Field                         | Type             | Required | Description                  |
| ----------------------------- | ---------------- | -------- | ---------------------------- |
| `<model_id>.model_name`       | non-empty string | yes      | 发送给上游 Provider 的模型名 |
| `<model_id>.reasoning_effort` | enum             | no       | `low`、`medium` 或 `high`    |

不保存 Provider 归属、成本、上下文窗口、capabilities、temperature、parameters 或 fallback。默认 model 由 `global.yaml` 引用；选中的 Provider 会检查本文件所有去重后的 `model_name`。

```yaml
example-model:
  model_name: upstream-example-model
  reasoning_effort: medium
```
