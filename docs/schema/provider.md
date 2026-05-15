# config/provider.yaml Schema

## Overview

Defines model providers (API gateways) used by OpenCode. Each provider specifies a base URL, API key environment variable, npm package, and timeout settings. Secrets are always env-only — never written as plain text.

## Fields

### Top-level

| Field       | Type   | Default | Required | Description                                 |
| ----------- | ------ | ------- | -------- | ------------------------------------------- |
| `providers` | object | —       | yes      | Map of provider IDs to provider definitions |

### Per-provider (`providers.<id>`)

| Field          | Type   | Default  | Required | Description                                                                    |
| -------------- | ------ | -------- | -------- | ------------------------------------------------------------------------------ |
| `name`         | string | —        | yes      | Human-readable provider display name                                           |
| `short_name`   | string | —        | no       | Short display suffix for model names                                           |
| `npm`          | string | —        | yes      | OpenCode provider npm package: `@ai-sdk/openai` or `@ai-sdk/openai-compatible` |
| `base_url`     | string | —        | yes      | API base URL                                                                   |
| `api_key`      | string | —        | yes      | Env variable reference in `${VAR_NAME}` format                                 |
| `timeout`      | number | `600000` | no       | Request timeout in milliseconds                                                |
| `chunkTimeout` | number | `30000`  | no       | Stream chunk timeout in milliseconds                                           |

## Valid Values

- **npm**: `@ai-sdk/openai` (for OpenAI-compatible APIs), `@ai-sdk/openai-compatible` (for other OpenAI-compatible APIs)
- **api_key**: Must use `${ENV_VAR_NAME}` syntax — never a literal key
- **timeout**: Recommended range `30000`–`600000` (30s–10min)
- **chunkTimeout**: Recommended range `10000`–`60000` (10s–60s)

## Examples

### Minimal

```yaml
providers:
  myprovider:
    name: My Provider
    base_url: https://api.example.com/v1
    api_key: ${MY_API_KEY}
```

### Full

```yaml
providers:
  codexapis:
    name: Codex APIs
    short_name: CodexAPI
    npm: "@ai-sdk/openai-compatible"
    base_url: https://www.codexapis.com/v1
    api_key: ${CODEXAPIS_API_KEY}
    timeout: 600000
    chunkTimeout: 30000

  deepseek:
    name: DeepSeek
    short_name: DeepSeek
    npm: "@ai-sdk/openai-compatible"
    base_url: https://api.deepseek.com
    api_key: ${DEEPSEEK_API_KEY}
    timeout: 600000
    chunkTimeout: 30000
```

## Current Providers

| Provider ID | Base URL                       | Env Var             | npm                         |
| ----------- | ------------------------------ | ------------------- | --------------------------- |
| `codexapis` | `https://www.codexapis.com/v1` | `CODEXAPIS_API_KEY` | `@ai-sdk/openai-compatible` |
| `packyapi`  | `https://www.packyapi.com/v1`  | `PACKYAPI_API_KEY`  | `@ai-sdk/openai`            |
| `axasapi`   | `https://api.asxs.top/v1`      | `AXASAPI_API_KEY`   | `@ai-sdk/openai`            |
| `deepseek`  | `https://api.deepseek.com`     | `DEEPSEEK_API_KEY`  | `@ai-sdk/openai-compatible` |

## Cross-File References

- **models.yaml**: Each model references a `provider_group` (e.g., `gpt` or `deepseek`) that maps to a provider at generation time via CLI `--gpt-provider` / `--deepseek-provider` flags or `AI_SHARE_GPT_PROVIDER` / `AI_SHARE_DEEPSEEK_PROVIDER` env vars
- **Generated OpenCode config**: Provider definitions are materialized into `provider` blocks in `opencode.json` with resolved API key env references
- **global.yaml**: `runtime.timeout_ms` and `proxy.*` settings affect provider request behavior
- **profiles.yaml**: Profile model roles map to model IDs from `models.yaml`, which in turn use providers
- **agents.yaml**: `runtime_fallback` timeout settings relate to provider timeout configuration
