# config/global.yaml Schema

## Overview

Global generator settings. `model` selects the single Codex model used by generated `config.toml`.

## Fields

| Field                            | Type    | Required | Description                                                     |
| -------------------------------- | ------- | -------- | --------------------------------------------------------------- |
| `model`                          | string  | yes      | Model ID; must match a key in `models.yaml`                     |
| `codex_min_version`              | string  | no       | Minimum Codex CLI version checked by `ai:check`                 |
| `codex_allow_login_shell`        | boolean | no       | Whether generated Codex config allows login shells              |
| `codex_windows.sandbox`          | enum    | no       | Windows sandbox backend: `elevated` or `unelevated`             |
| `codex_shell_environment_policy` | object  | no       | Codex shell environment policy passed through to generated TOML |

## Cross-File References

- **models.yaml**: `model` must match a top-level model ID.
- **Generated Codex config**: `model` resolves to the upstream model name and selected provider.
