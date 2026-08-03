# config/global.yaml Schema

`global.yaml` 选择默认 Provider 及其默认模型。

| Field                  | Type      | Required | Description                         |
| ---------------------- | --------- | -------- | ----------------------------------- |
| `model`                | string ID | yes      | 引用 `models.yaml` 的 key           |
| `provider`             | string ID | yes      | 引用 `provider.yaml` 的 key         |
| `opencode_min_version` | semver    | no       | `ai:check` 检查的 OpenCode 最低版本 |

固定对象拒绝未知字段。临时 Provider 选择优先级为 `--provider > AI_SHARE_PROVIDER > global.provider`。选择
`global.provider` 时使用 `global.model`；选择其他 Provider 时使用其 `default_model`。
