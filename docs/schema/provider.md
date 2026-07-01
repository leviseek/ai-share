# config/provider.yaml Schema

## Overview

Defines model providers used by generated Codex CLI config. Each provider specifies display metadata, base URL, API key environment variable, and optional timeout metadata. Secrets are always env-only.

## Fields

| Field                         | Type   | Required | Description                           |
| ----------------------------- | ------ | -------- | ------------------------------------- |
| `providers`                   | object | yes      | Provider map keyed by provider ID     |
| `providers.<id>.name`         | string | no       | Human-readable provider name          |
| `providers.<id>.short_name`   | string | no       | Short display suffix                  |
| `providers.<id>.base_url`     | string | yes      | API base URL                          |
| `providers.<id>.api_key`      | string | yes      | Env reference in `${ENV_NAME}` format |
| `providers.<id>.timeout`      | number | no       | Request timeout metadata              |
| `providers.<id>.chunkTimeout` | number | no       | Streaming chunk timeout metadata      |

## Rules

- `api_key` must use `${ENV_NAME}` format.
- Real API keys, tokens, cookies, and private credentials must never be written to YAML.
- Provider IDs are referenced by `config/models.yaml` after provider-group resolution.

## Cross-File References

- **models.yaml**: Models resolve to concrete provider IDs through `provider_group`.
- **generate-user-config.ts**: Provider entries are materialized into Codex `model_providers`.
