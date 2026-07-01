# config/global.yaml Schema

## Overview

Global generator settings. `model` selects the single Codex model used by generated `config.toml`.

## Fields

| Field               | Type   | Required | Description                                     |
| ------------------- | ------ | -------- | ----------------------------------------------- |
| `model`             | string | yes      | Model ID; must match a key in `models.yaml`     |
| `codex_min_version` | string | no       | Minimum Codex CLI version checked by `ai:check` |

## Cross-File References

- **models.yaml**: `model` must match a top-level model ID.
- **Generated Codex config**: `model` resolves to the upstream model name and selected provider.
