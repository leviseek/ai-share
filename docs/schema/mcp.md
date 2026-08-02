# config/mcp.yaml Schema

根字段 `servers` 必填；无 MCP 时写 `servers: {}`。每个 server ID 必须是合法配置 ID。

## stdio

`transport: stdio` 时 `command` 必填，可选 `args`、`env`。输出为 OpenCode `{ type: "local", command: [...] }`。敏感 env 值必须使用 `${ENV_NAME}`。

## HTTP

`transport: http` 时 `url` 必填，可选 `bearer_token_env_var`、`oauth_client_id`。输出为 OpenCode remote MCP；Bearer token 使用 `Authorization: Bearer {env:ENV_NAME}`，OAuth client ID 写入 `oauth.clientId`。不得配置 `command`、`args` 或 `env`，URL 不得包含敏感查询参数。

固定 server 对象拒绝未知字段。
