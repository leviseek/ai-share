# config/profiles.yaml Schema

## Overview

Codex profile definitions. Each profile maps three model roles (`primary`, `reasoning`, `fast`) to concrete model IDs from `models.yaml`, with optional compaction metadata.

## Fields

Each top-level key is a profile ID.

| Field                                      | Type    | Required | Description                                                                 |
| ------------------------------------------ | ------- | -------- | --------------------------------------------------------------------------- |
| `<profile_id>.name`                        | string  | no       | Human-readable profile description                                          |
| `<profile_id>.models.primary`              | string  | yes      | Model ID for primary role; must match a key in `models.yaml`                |
| `<profile_id>.models.reasoning`            | string  | yes      | Model ID for reasoning role; must match a key in `models.yaml`              |
| `<profile_id>.models.fast`                 | string  | yes      | Model ID for fast role; must match a key in `models.yaml`                   |
| `<profile_id>.compaction.enabled`          | boolean | no       | Compaction metadata                                                         |
| `<profile_id>.compaction.threshold`        | number  | no       | Token threshold metadata                                                    |
| `<profile_id>.compaction.model`            | string  | no       | Model ID or role name (`primary`, `reasoning`, `fast`) for compaction tasks |
| `<profile_id>.compaction.max_input_tokens` | number  | no       | Max input token metadata                                                    |

## Current Profiles

| Profile ID | Primary               | Reasoning                 | Fast              |
| ---------- | --------------------- | ------------------------- | ----------------- |
| `lite`     | gpt-5.4               | gpt-5.4                   | gpt-5.4-mini      |
| `economy`  | deepseek-v4-flash     | deepseek-v4-flash-think   | deepseek-v4-flash |
| `cheap`    | gpt-5.4-mini          | gpt-5.4                   | gpt-5.4-mini      |
| `balanced` | gpt-5.5               | gpt-5.5                   | gpt-5.4-mini      |
| `coding`   | gpt-5.5-coding        | gpt-5.5-coding            | gpt-5.4-mini      |
| `research` | gpt-5.5               | gpt-5.5                   | gpt-5.4-mini      |
| `writing`  | gpt-5.5               | gpt-5.5                   | gpt-5.4-mini      |
| `max`      | gpt-5.5               | gpt-5.5                   | gpt-5.4           |
| `ds-max`   | deepseek-v4-pro-think | deepseek-v4-pro-think-max | deepseek-v4-flash |

## Cross-File References

- **models.yaml**: All `models.*` values reference model IDs defined there.
- **provider_group**: Each profile's `primary` / `reasoning` / `fast` models must resolve to the same `provider_group`, keeping Codex orchestration single-family so `ai:gen` can select one provider for that profile.
- **global.yaml**: `default_profile` must equal a profile ID from this file.
- **Codex profile TOML**: Generated under `~/.codex/<profile>.config.toml`.
- **Codex profile JSON**: Generated under `~/.codex/<profile>.codex-config.json`.
