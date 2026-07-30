# config/mcp.yaml Schema

根字段 `servers` 必填；无 MCP 时写 `servers: {}`。每个 server ID 必须是合法配置 ID。

## stdio

`transport` 可写 `stdio`，`command` 必填；可选 `args`、`env`。不得出现 `url`、`bearer_token_env_var` 或 OAuth 字段。敏感 env 值必须使用 `${ENV_NAME}` 引用。

## HTTP

`transport: http` 时 `url` 必填；可选 `bearer_token_env_var`、`oauth_client_id`、`oauth_resource`。不得出现 `command`、`args` 或 `env`。URL 查询参数不得携带 token、key、cookie 等敏感值。

固定 server 对象拒绝未知字段。
