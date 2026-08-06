# config/models.yaml Schema

`models.yaml` 是唯一模型目录。每个 top-level key 是合法配置 ID，并只允许以下字段：

| Field                          | Type             | Required | Description                                          |
| ------------------------------ | ---------------- | -------- | ---------------------------------------------------- |
| `<model_id>.model_name`        | non-empty string | yes      | 发送给上游 Provider 的模型名                         |
| `<model_id>.reasoning_effort`  | enum             | no       | `low`、`medium` 或 `high`                            |
| `<model_id>.attachment`        | boolean          | no       | 模型是否支持图像/文件附件（多模态）                  |
| `<model_id>.modalities`        | object           | no       | 输入/输出模态声明，至少一个键                        |
| `<model_id>.modalities.input`  | enum array       | no       | `text`、`audio`、`image`、`video` 或 `pdf`，至少一项 |
| `<model_id>.modalities.output` | enum array       | no       | `text`、`audio`、`image`、`video` 或 `pdf`，至少一项 |

`attachment` 是能力开关；`modalities` 是具体模态明细。二者可单独或同时声明。不保存 Provider 归属、
成本、上下文窗口、temperature、parameters 或 fallback；只保存有消费者的能力声明（如
`attachment`/`modalities`）。Provider 与 model id 的关联及 Provider 默认模型由 `provider.yaml` 声明；生成
和在线检查只解析当前 Provider 关联的 model id，并按去重后的 `model_name` 访问上游。

```yaml
example-model:
  model_name: upstream-example-model
  reasoning_effort: medium
  attachment: true
  modalities:
    input: [text, image, pdf]
    output: [text]
```
