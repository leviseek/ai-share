# config/env.yaml Schema

`env.yaml` 管理 `aioc` 使用的 OpenCode `.env` managed block。根字段 `variables` 必填；无共享变量时写 `variables: {}`。

| Field              | Type   | Required | Description                  |
| ------------------ | ------ | -------- | ---------------------------- |
| `variables`        | object | yes      | 非密钥环境变量 map           |
| `variables.<name>` | string | yes      | 一个 launcher runtime env 值 |

- `aioc` 仅补全当前进程未设置的变量，系统/Shell 环境优先。
- 本机代理放在 ignored `config/local/env.yaml`。
- 禁止 secret-like 名称、明文 secret、`HOME`、`USERPROFILE`、`PATH`、`AI_SHARE_*` 和 `OPENCODE_*`。
- `--force` 不能绕过这些规则。
