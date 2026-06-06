# config/global.yaml Schema

## Overview

Global defaults for the ai-share Codex/OMX generator. Controls default profile selection, version requirements, runtime metadata, model defaults, context metadata, workspace ignores, and compaction metadata.

## Fields

| Field                         | Type     | Required | Description                                                    |
| ----------------------------- | -------- | -------- | -------------------------------------------------------------- |
| `default_profile`             | string   | yes      | Default profile name; must match a key in `profiles.yaml`      |
| `codex_min_version`           | string   | no       | Minimum Codex CLI version checked by `ai:check`                |
| `omx_min_version`             | string   | no       | Minimum OMX CLI version checked by `ai:check`                  |
| `env.mode`                    | string   | no       | Environment mode: `dev`, `staging`, or `prod`                  |
| `env.log_level`               | string   | no       | Log level: `debug`, `info`, `warn`, or `error`                 |
| `features.auto_router`        | boolean  | no       | Metadata flag for routing                                      |
| `features.memory`             | boolean  | no       | Metadata flag for memory                                       |
| `features.fallback`           | boolean  | no       | Metadata flag for fallback                                     |
| `features.cost_tracking`      | boolean  | no       | Metadata flag for cost tracking                                |
| `runtime.timeout_ms`          | number   | no       | Global request timeout metadata in milliseconds                |
| `runtime.max_retries`         | number   | no       | Max retry metadata                                             |
| `models.default`              | string   | no       | Default model ID from `models.yaml`                            |
| `models.small`                | string   | no       | Small/fast model ID from `models.yaml`                         |
| `context.max_tokens`          | number   | no       | Context metadata                                               |
| `context.strategy`            | string   | no       | Context overflow metadata: `truncate`, `summarize`, or `split` |
| `context.cache_enabled`       | boolean  | no       | Metadata flag for context caching                              |
| `workspace.ignore`            | string[] | no       | Glob patterns for files to ignore in workspace                 |
| `compaction.enabled`          | boolean  | no       | Compaction metadata                                            |
| `compaction.threshold`        | number   | no       | Token threshold metadata                                       |
| `compaction.model`            | string   | no       | Model role or ID metadata                                      |
| `compaction.max_input_tokens` | number   | no       | Max input token metadata                                       |
| `telemetry.enabled`           | boolean  | no       | Optional telemetry metadata                                    |
| `telemetry.endpoint`          | string   | no       | Optional telemetry endpoint                                    |

## Cross-File References

- **profiles.yaml**: `default_profile` must match a top-level key.
- **models.yaml**: `models.default` and `models.small` should match model IDs.
- **generate-user-config.ts**: Version requirements and default profile are consumed during generation/check.
