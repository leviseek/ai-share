# config/global.yaml Schema

`global.yaml` 选择唯一默认模型和 Provider。

| Field                            | Type      | Required | Description                       |
| -------------------------------- | --------- | -------- | --------------------------------- |
| `model`                          | string ID | yes      | 必须引用 `models.yaml` 的 key     |
| `provider`                       | string ID | yes      | 必须引用 `provider.yaml` 的 key   |
| `codex_min_version`              | semver    | no       | `ai:doctor` 的 Codex 最低版本提示 |
| `codex_allow_login_shell`        | boolean   | no       | Codex login shell 设置            |
| `codex_windows.sandbox`          | enum      | no       | `elevated` 或 `unelevated`        |
| `codex_shell_environment_policy` | object    | no       | Codex shell environment policy    |

固定对象拒绝未知字段。临时 Provider 选择不修改该文件，优先级为 `--provider > AI_SHARE_PROVIDER > global.provider`。
