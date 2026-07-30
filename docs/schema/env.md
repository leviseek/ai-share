# config/env.yaml Schema

`env.yaml` 管理 Codex `.env` 中的 ai-share managed block。根字段 `variables` 必填；无共享变量时写 `variables: {}`。

| Field              | Type   | Required | Description               |
| ------------------ | ------ | -------- | ------------------------- |
| `variables`        | object | yes      | 非密钥环境变量 map        |
| `variables.<name>` | string | yes      | 一个 Codex runtime env 值 |

规则：

- 生成器只更新或移除 managed block，保留 `.env` 其他内容。
- 本机代理放在 ignored `config/local/env.yaml`，不要提交到 shared config。
- 禁止 secret-like 名称或明文 secret。
- 禁止 `HOME`、`USERPROFILE`、`PATH`、`AI_SHARE_*` 和 `CODEX_*`。
- `--force` 不能绕过这些规则。
