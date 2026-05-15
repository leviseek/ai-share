# config/agents.yaml Schema

## Overview

oh-my-openagent (OMO) agent and category definitions. Controls agent-to-model role mapping, shared prompts, runtime fallback behavior, background task concurrency limits, DCP/checkpoint/memory strategy defaults, and tmux integration. Model fields reference role names (`primary`, `reasoning`, `fast`) resolved through the active profile.

## Fields

| Field                                    | Type     | Default                                      | Required | Description                                                                            |
| ---------------------------------------- | -------- | -------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `model_fallback`                         | boolean  | `true`                                       | no       | Enable automatic model fallback on provider errors                                     |
| `shared_prompt.append`                   | string   | —                                            | no       | System prompt appended to all agents                                                   |
| `agents`                                 | object   | `{}`                                         | no       | Named agent definitions (see Agents section)                                           |
| `categories`                             | object   | `{}`                                         | no       | Task category definitions (see Categories section)                                     |
| `runtime_fallback.enabled`               | boolean  | `true`                                       | no       | Enable runtime fallback mechanism                                                      |
| `runtime_fallback.retry_on_errors`       | number[] | `[429, 503, 529]`                            | no       | HTTP status codes that trigger fallback/retry                                          |
| `runtime_fallback.max_fallback_attempts` | number   | `1`                                          | no       | Max consecutive fallback attempts across fallback chain                                |
| `runtime_fallback.cooldown_seconds`      | number   | `60`                                         | no       | Wait time in seconds before retry after fallback                                       |
| `runtime_fallback.timeout_seconds`       | number   | `30`                                         | no       | Per-request timeout in seconds for fallback attempts                                   |
| `runtime_fallback.notify_on_fallback`    | boolean  | `true`                                       | no       | Notify user when fallback is triggered                                                 |
| `runtime_fallback.model_whitelist`       | string[] | `[primary, reasoning, fast]`                 | no       | Roles allowed for fallback targets                                                     |
| `background_task.providerConcurrency`    | object   | —                                            | no       | Max concurrent requests per provider group (e.g., `gpt: 3`, `deepseek: 1`)             |
| `background_task.modelConcurrency`       | object   | —                                            | no       | Max concurrent requests per model role (e.g., `primary: 2`, `reasoning: 1`, `fast: 6`) |
| `dcp.enabled`                            | boolean  | `true`                                       | no       | Enable DCP for OMO mode                                                                |
| `dcp.mode`                               | string   | `shared`                                     | no       | DCP sharing mode                                                                       |
| `dcp.handoff_policy`                     | string   | `summarize-before-delegate`                  | no       | Policy for context handoff during delegation                                           |
| `dcp.context_budget_tokens`              | number   | `24000`                                      | no       | Token budget for DCP context                                                           |
| `dcp.share`                              | object   | —                                            | no       | DCP share settings for plans, decisions, verification, secrets                         |
| `dcp.required_sections`                  | string[] | _(see file)_                                 | no       | Sections required in task context during delegation                                    |
| `checkpoint.enabled`                     | boolean  | `true`                                       | no       | Enable checkpoint for OMO mode                                                         |
| `checkpoint.mode`                        | string   | `agent-session`                              | no       | Checkpoint scope: `shared`, `agent-session`, etc.                                      |
| `checkpoint.trigger`                     | string   | `before-edit-and-before-delegation`          | no       | When to create checkpoints                                                             |
| `checkpoint.max_entries`                 | number   | `20`                                         | no       | Max checkpoint snapshots                                                               |
| `checkpoint.require_verification_note`   | boolean  | `true`                                       | no       | Require verification notes in checkpoints                                              |
| `checkpoint.restore_policy`              | string   | `manual-only`                                | no       | Restore behavior: `manual-only`                                                        |
| `memory.enabled`                         | boolean  | `true`                                       | no       | Enable memory for OMO mode                                                             |
| `memory.mode`                            | string   | `shared`                                     | no       | Memory scope                                                                           |
| `memory.scope`                           | string   | `project`                                    | no       | Project scope for memory                                                               |
| `memory.strategy`                        | string   | `verified-summary`                           | no       | Memory extraction strategy                                                             |
| `memory.write_policy`                    | string   | `facts-decisions-and-runbooks-only`          | no       | What content is written to memory                                                      |
| `memory.read_policy`                     | string   | `load-before-plan`                           | no       | When memory is loaded                                                                  |
| `memory.redact`                          | string[] | `[api_key, token, password, secret, cookie]` | no       | Patterns to redact from memory                                                         |
| `tmux.enabled`                           | boolean  | `true`                                       | no       | Enable tmux integration for background tasks                                           |

### Agents (`agents.<name>`)

| Field           | Type   | Default | Required | Description                                              |
| --------------- | ------ | ------- | -------- | -------------------------------------------------------- |
| `model`         | string | —       | yes      | Model role: `primary`, `reasoning`, or `fast`            |
| `prompt.append` | string | —       | no       | Additional prompt appended to this agent's system prompt |
| `permission`    | object | —       | no       | Permission overrides (e.g., `edit: deny`)                |

### Categories (`categories.<name>`)

| Field           | Type   | Default | Required | Description                                   |
| --------------- | ------ | ------- | -------- | --------------------------------------------- |
| `model`         | string | —       | yes      | Model role: `primary`, `reasoning`, or `fast` |
| `prompt.append` | string | —       | no       | Additional prompt appended for this category  |
| `permission`    | object | —       | no       | Permission overrides                          |

## Valid Values

- **agents `<name>`**: `sisyphus`, `hephaestus`, `prometheus`, `oracle`, `momus`, `metis`, `atlas`, `sisyphus-junior`, `explorer`, `librarian`, `multimodal-looker`
- **categories `<name>`**: `ultrabrain`, `deep`, `quick`, `unspecified-low`, `unspecified-high`, `writing`, `visual-engineering`, `artistry`
- **model** (agent/category): `primary`, `reasoning`, `fast`
- **runtime_fallback.retry_on_errors**: HTTP status codes `429`, `503`, `529`
- **dcp.required_sections**: `task`, `expected_outcome`, `required_tools`, `must_do`, `must_not_do`, `context`
- **memory.redact**: `api_key`, `token`, `password`, `secret`, `cookie`

## Agent Role Mapping

| Agent               | Model Role | Purpose                      |
| ------------------- | ---------- | ---------------------------- |
| `sisyphus`          | primary    | Main orchestrator agent      |
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

## Category Role Mapping

| Category             | Model Role | Purpose                          |
| -------------------- | ---------- | -------------------------------- |
| `ultrabrain`         | reasoning  | Deep reasoning tasks             |
| `deep`               | reasoning  | Complex analysis tasks           |
| `quick`              | fast       | Quick/task-runner delegation     |
| `unspecified-low`    | fast       | Low-importance background tasks  |
| `unspecified-high`   | primary    | High-importance background tasks |
| `writing`            | primary    | Writing/prose tasks              |
| `visual-engineering` | primary    | Frontend/UI tasks                |
| `artistry`           | primary    | Creative/design tasks            |

## Examples

### Minimal agent definition

```yaml
agents:
  explorer:
    model: fast
    permission:
      edit: deny
```

### Full configuration

```yaml
model_fallback: true

shared_prompt:
  append: "遵循当前 OpenCode instructions 中的 AI_GUIDELINES.md..."

agents:
  sisyphus:
    model: primary
    prompt:
      append: "默认使用简体中文交流、解释和总结..."

runtime_fallback:
  enabled: true
  retry_on_errors:
    - 429
    - 503
    - 529
  max_fallback_attempts: 1
  cooldown_seconds: 60

background_task:
  providerConcurrency:
    gpt: 3
    deepseek: 1
  modelConcurrency:
    primary: 2
    reasoning: 1
    fast: 6
```

## Cross-File References

- **models.yaml**: Role names (`primary`, `reasoning`, `fast`) are resolved to concrete model IDs per active profile
- **profiles.yaml**: Each profile provides the model-to-role mapping used to resolve agent models
- **profiles.yaml**: Per-profile `strategies.oh_my_openagent` overrides merge with defaults from this file's `dcp`, `checkpoint`, `memory` sections
- **global.yaml**: Default `dcp`, `checkpoint`, `memory` strategies serve as fallbacks when neither this file nor per-profile strategies specify a value
- **Generated oh-my-openagent.json**: Materialized OMO config with resolved models and merged strategies
- **Generated strategy.\<profile\>.json**: Sidecar files merge defaults from this file with per-profile overrides
