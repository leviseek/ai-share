# config/global.yaml Schema

`global.yaml` 选择唯一默认模型和 Provider。

| Field                  | Type      | Required | Description                          |
| ---------------------- | --------- | -------- | ------------------------------------ |
| `model`                | string ID | yes      | 引用 `models.yaml` 的 key            |
| `provider`             | string ID | yes      | 引用 `provider.yaml` 的 key          |
| `opencode_min_version` | semver    | no       | `ai:doctor` 检查的 OpenCode 最低版本 |

固定对象拒绝未知字段。临时 Provider 选择优先级为 `--provider > AI_SHARE_PROVIDER > global.provider`。
