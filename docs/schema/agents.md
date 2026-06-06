# config/agents.yaml Schema

## Overview

Defines Codex agent role mapping and prompt append rules. Agent model fields reference `primary`, `reasoning`, and `fast`, resolved through the active profile in `config/profiles.yaml`.

## Fields

| Field                  | Type   | Required | Description                                   |
| ---------------------- | ------ | -------- | --------------------------------------------- |
| `shared_prompt.append` | string | no       | Prompt appended to all generated Codex agents |
| `agents`               | object | yes      | Named Codex agent definitions                 |

### Agents (`agents.<name>`)

| Field           | Type   | Required | Description                                               |
| --------------- | ------ | -------- | --------------------------------------------------------- |
| `model`         | string | yes      | Model role: `primary`, `reasoning`, or `fast`             |
| `prompt.append` | string | no       | Additional prompt appended to this agent's instructions   |
| `permission`    | object | no       | Permission metadata; `edit: deny` maps to read-only agent |

## Agent Role Mapping

| Agent               | Model Role | Purpose                      |
| ------------------- | ---------- | ---------------------------- |
| `sisyphus`          | primary    | Main coding/general agent    |
| `hephaestus`        | primary    | Implementation/coding agent  |
| `prometheus`        | reasoning  | Planning/strategy agent      |
| `oracle`            | reasoning  | Deep analysis/review agent   |
| `momus`             | fast       | Critique/review agent        |
| `metis`             | reasoning  | Knowledge/research agent     |
| `atlas`             | primary    | Context management agent     |
| `sisyphus-junior`   | fast       | Lightweight executor agent   |
| `explorer`          | fast       | Code exploration (read-only) |
| `librarian`         | fast       | Documentation search agent   |
| `multimodal-looker` | primary    | Visual/image analysis agent  |

## Cross-File References

- **profiles.yaml**: Each profile provides model-to-role mapping.
- **models.yaml**: Resolved model IDs must exist in the model catalog.
- **Codex agent TOML**: Generated under `~/.codex/agents/<agent>.toml`.
