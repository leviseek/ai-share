# config/global.yaml Schema

## Overview

Global defaults for the ai-share Codex generator. This file is intentionally small: it only contains values directly consumed by generation or `ai:check`.

## Fields

| Field               | Type   | Required | Description                                               |
| ------------------- | ------ | -------- | --------------------------------------------------------- |
| `default_profile`   | string | yes      | Default profile name; must match a key in `profiles.yaml` |
| `codex_min_version` | string | no       | Minimum Codex CLI version checked by `ai:check`           |
| `codex_min_version` | string | no       | Minimum Codex CLI version checked by `ai:check`           |

## Rules

- Do not add metadata-only fields here. If a key is not consumed by generation or validation, keep it in docs or memory instead of YAML source.
- Profile-specific model and compaction behavior belongs in `profiles.yaml`.
- Provider and API key references belong in `provider.yaml`.

## Cross-File References

- **profiles.yaml**: `default_profile` must match a top-level key.
- **generate-user-config.ts**: Version requirements and default profile are consumed during generation/check.
