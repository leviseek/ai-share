# config/

## OVERVIEW

严格 YAML 配置源。主配置与可选 `config/local/` overlay 合并后，必须经过同一套 schema、跨文件引用、transport 和 secret 校验。

## WHERE TO LOOK

| Need                                        | File            | Notes                                    |
| ------------------------------------------- | --------------- | ---------------------------------------- |
| Default model/provider and Codex settings   | `global.yaml`   | `model`、`provider` 必填                 |
| Provider endpoint and API-key env reference | `provider.yaml` | 仅 `name`、`base_url`、`api_key`         |
| Upstream model names                        | `models.yaml`   | 仅 `model_name`、可选 `reasoning_effort` |
| Codex MCP servers                           | `mcp.yaml`      | stdio/HTTP 条件字段严格互斥              |
| Shared Codex `.env` values                  | `env.yaml`      | 非密钥；默认 `variables: {}`             |
| Machine-local overrides                     | `local/`        | Git ignored，合并后仍严格校验            |

## CONVENTIONS

- YAML 是唯一权威源；不要手改生成的 TOML、AGENTS 或 skill 作为长期修复。
- `global.provider` 是默认 Provider 的唯一权威源。
- 固定结构拒绝未知字段；字段规格只在 `../src/config/schema-spec.ts` 定义。
- Provider URL 必须是有效 HTTPS URL，`api_key` 必须是 `${ENV_NAME}` 引用。
- `env.yaml` 及 overlay 不得包含 API key、token、cookie、`HOME`、`USERPROFILE`、`PATH`、`AI_SHARE_*` 或 `CODEX_*`。
- 本机代理属于 ignored `config/local/env.yaml`，可从 `../templates/personal-overlay/env.local.example.yaml` 复制。
- 空集合显式写成 `{}`。

## VALIDATION

```sh
bun run ai:check
bun run schema:check
bun run ai:gen -- --dry-run
```

## ANTI-PATTERNS

- 不恢复 Provider group、fallback、cost、capabilities、limits、parameters 或无消费者字段。
- 不把真实密钥或私有凭据写入 YAML、模板、测试或文档。
- `--force` 只接管未受管输出，不能绕过任何配置或 secret 校验。
