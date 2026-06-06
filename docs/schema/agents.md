# config/agents.yaml Schema

## Overview

Defines Codex agent runtime settings, OMX agent policy, role mapping, and prompt append rules. Agent model fields and OMX model slots reference `primary`, `reasoning`, and `fast`, resolved through the active profile in `config/profiles.yaml`.

## Fields

| Field                  | Type   | Required | Description                                       |
| ---------------------- | ------ | -------- | ------------------------------------------------- |
| `shared_prompt.append` | string | no       | Prompt appended to all generated Codex agents     |
| `codex.agents`         | object | yes      | Codex CLI `[agents]` concurrency/runtime settings |
| `omx.model_slots`      | object | yes      | OMX model slot to profile-role mapping            |
| `omx.agent_reasoning`  | object | yes      | OMX agent reasoning effort by agent ID            |
| `agents`               | object | yes      | Named Codex agent definitions                     |

### Codex Runtime (`codex.agents`)

| Field                                  | Type   | Required | Description                  |
| -------------------------------------- | ------ | -------- | ---------------------------- |
| `codex.agents.max_threads`             | number | yes      | Codex max concurrent threads |
| `codex.agents.max_depth`               | number | yes      | Codex max agent depth        |
| `codex.agents.job_max_runtime_seconds` | number | yes      | Codex max agent job runtime  |

All values must be positive integers.

### OMX Runtime (`omx`)

| Field                                 | Type   | Required | Description                                    |
| ------------------------------------- | ------ | -------- | ---------------------------------------------- |
| `omx.model_slots.default`             | string | yes      | Role used for OMX `models.default`             |
| `omx.model_slots.team`                | string | yes      | Role used for OMX `models.team`                |
| `omx.model_slots.autopilot`           | string | yes      | Role used for OMX `models.autopilot`           |
| `omx.model_slots.ralph`               | string | yes      | Role used for OMX `models.ralph`               |
| `omx.model_slots.team_low_complexity` | string | yes      | Role used for OMX `models.team_low_complexity` |
| `omx.agent_reasoning.<agent>`         | string | no       | Reasoning effort: `low`, `medium`, or `high`   |

`omx.model_slots.*` values must be `primary`, `reasoning`, or `fast`. Additional slot keys are allowed and are emitted into generated OMX JSON. `omx.agent_reasoning` keys must reference agents defined in `agents`.

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
- **Codex profile TOML**: `codex.agents` generates the `[agents]` block.
- **OMX profile JSON**: `omx.model_slots` and `omx.agent_reasoning` generate `models` and `agentReasoning`.
