# config/profiles.yaml Schema

## Overview

OMO orchestration level definitions. Each profile maps three model roles (`primary`, `reasoning`, `fast`) to concrete model IDs from `models.yaml`, and optionally overrides compaction settings and DCP/checkpoint/memory strategies. Profiles are used to switch between different cost-performance tradeoffs.

## Fields

Each top-level key is a profile ID. Profile IDs must be unique and match the pattern used in `global.yaml`'s `default_profile`.

| Field                                                               | Type     | Default | Required | Description                                                                                 |
| ------------------------------------------------------------------- | -------- | ------- | -------- | ------------------------------------------------------------------------------------------- |
| `<profile_id>`                                                      | object   | —       | yes      | Profile ID; lowercase alphanumeric                                                          |
| `<profile_id>.name`                                                 | string   | —       | no       | Human-readable profile description                                                          |
| `<profile_id>.models.primary`                                       | string   | —       | yes      | Model ID for primary (main agent) role; must match a key in `models.yaml`                   |
| `<profile_id>.models.reasoning`                                     | string   | —       | yes      | Model ID for reasoning (deep analysis, planning) role; must match a key in `models.yaml`    |
| `<profile_id>.models.fast`                                          | string   | —       | yes      | Model ID for fast (lightweight, search, compaction) role; must match a key in `models.yaml` |
| `<profile_id>.compaction.enabled`                                   | boolean  | `true`  | no       | Enable automatic compaction for this profile                                                |
| `<profile_id>.compaction.threshold`                                 | number   | `65000` | no       | Token threshold before triggering compaction                                                |
| `<profile_id>.compaction.model`                                     | string   | —       | no       | Model ID or role name (`primary`, `reasoning`, `fast`) for compaction agent                 |
| `<profile_id>.compaction.max_input_tokens`                          | number   | —       | no       | Max input tokens for context guard; used to compute `reserved` in OpenCode compaction       |
| `<profile_id>.strategies.opencode.dcp`                              | object   | —       | no       | DCP strategy overrides for native OpenCode mode                                             |
| `<profile_id>.strategies.opencode.dcp.context_budget_tokens`        | number   | —       | no       | Budget tokens for DCP context compression                                                   |
| `<profile_id>.strategies.opencode.checkpoint`                       | object   | —       | no       | Checkpoint strategy overrides for OpenCode                                                  |
| `<profile_id>.strategies.opencode.checkpoint.max_entries`           | number   | —       | no       | Max checkpoint entries                                                                      |
| `<profile_id>.strategies.opencode.checkpoint.trigger`               | string   | —       | no       | Trigger condition for checkpoint creation                                                   |
| `<profile_id>.strategies.opencode.memory`                           | object   | —       | no       | Memory strategy overrides for OpenCode                                                      |
| `<profile_id>.strategies.opencode.memory.retention`                 | string   | —       | no       | Memory retention scope: `session`, `project`                                                |
| `<profile_id>.strategies.opencode.memory.strategy`                  | string   | —       | no       | Memory extraction strategy                                                                  |
| `<profile_id>.strategies.opencode.memory.include`                   | string[] | —       | no       | File patterns to include in memory                                                          |
| `<profile_id>.strategies.opencode.memory.read_policy`               | string   | —       | no       | Memory read policy                                                                          |
| `<profile_id>.strategies.oh_my_openagent.dcp`                       | object   | —       | no       | DCP strategy overrides for OMO mode                                                         |
| `<profile_id>.strategies.oh_my_openagent.dcp.context_budget_tokens` | number   | —       | no       | Budget tokens for OMO DCP                                                                   |
| `<profile_id>.strategies.oh_my_openagent.dcp.share`                 | object   | —       | no       | DCP share configuration (e.g., `research_notes`, `verification_artifacts`)                  |
| `<profile_id>.strategies.oh_my_openagent.checkpoint`                | object   | —       | no       | Checkpoint strategy overrides for OMO                                                       |
| `<profile_id>.strategies.oh_my_openagent.checkpoint.max_entries`    | number   | —       | no       | Max checkpoint entries for OMO                                                              |
| `<profile_id>.strategies.oh_my_openagent.checkpoint.trigger`        | string   | —       | no       | Checkpoint trigger for OMO                                                                  |
| `<profile_id>.strategies.oh_my_openagent.memory`                    | object   | —       | no       | Memory strategy overrides for OMO                                                           |
| `<profile_id>.strategies.oh_my_openagent.memory.strategy`           | string   | —       | no       | Memory strategy for OMO                                                                     |
| `<profile_id>.strategies.oh_my_openagent.memory.read_policy`        | string   | —       | no       | Memory read policy for OMO                                                                  |

## Compaction Model Resolution

The `compaction.model` field accepts:

- A concrete model ID from `models.yaml` (e.g., `gpt-5.4-mini`)
- A role name (`primary`, `reasoning`, `fast`) that is resolved through the profile's own model mapping

## Valid Values

- **models.primary/reasoning/fast**: Any key from `models.yaml`
- **compaction.model**: Any model ID from `models.yaml` or one of `primary`, `reasoning`, `fast`
- **memory.retention**: `session`, `project`
- **memory.strategy**: `compact-summary`, `summary-first`, `verified-summary`, `evidence-summary`, `prose-summary`, `detailed-summary`
- **memory.read_policy**: `load-before-plan`, `load-before-edit-plan`
- **checkpoint.trigger**: `before-risky-change`, `before-edit-and-before-risky-change`, `before-edit-and-before-delegation`

## Example Profile

```yaml
balanced:
  name: 均衡编排
  models:
    primary: gpt-5.5
    reasoning: deepseek-v4-pro-think
    fast: gpt-5.4-mini
  compaction:
    enabled: true
    threshold: 65000
    model: fast
    max_input_tokens: 120000
  strategies:
    opencode:
      dcp:
        context_budget_tokens: 24000
      checkpoint:
        max_entries: 20
      memory:
        retention: project
        strategy: summary-first
    oh_my_openagent:
      dcp:
        context_budget_tokens: 24000
      checkpoint:
        max_entries: 20
      memory:
        strategy: verified-summary
```

## Current Profiles

| Profile ID | Primary           | Reasoning                 | Fast              | Context Budget               |
| ---------- | ----------------- | ------------------------- | ----------------- | ---------------------------- |
| `lite`     | gpt-5.4           | deepseek-v4-flash-think   | gpt-5.4-mini      | 12K (OpenCode) / 12K (OMO)   |
| `economy`  | deepseek-v4-flash | deepseek-v4-flash-think   | deepseek-v4-flash | 100M (OpenCode) / 10M (OMO)  |
| `cheap`    | gpt-5.4-mini      | deepseek-v4-flash-think   | gpt-5.4-mini      | 8K (OpenCode) / 8K (OMO)     |
| `balanced` | gpt-5.5           | deepseek-v4-pro-think     | gpt-5.4-mini      | 24K (OpenCode) / 24K (OMO)   |
| `coding`   | gpt-5.3-codex     | deepseek-v4-pro-think     | gpt-5.4-mini      | 26K (OpenCode) / 26K (OMO)   |
| `research` | gpt-5.5           | deepseek-v4-pro-think-max | gpt-5.4-mini      | 50K (OpenCode) / 50K (OMO)   |
| `writing`  | gpt-5.5           | deepseek-v4-pro-think     | gpt-5.4-mini      | 22K (OpenCode) / 22K (OMO)   |
| `max`      | gpt-5.5           | deepseek-v4-pro-think-max | gpt-5.4           | 120K (OpenCode) / 120K (OMO) |

## Cross-File References

- **models.yaml**: All `models.*` values reference model IDs defined in `models.yaml`
- **global.yaml**: `default_profile` must equal a profile ID from this file
- **global.yaml**: `compaction` defaults apply when a profile does not override compaction fields
- **global.yaml**: `dcp`, `checkpoint`, `memory` defaults are merged with per-profile strategies
- **agents.yaml**: Agent `model` fields use role names (`primary`, `reasoning`, `fast`) that are resolved through per-profile model maps
- **Generated strategy.\<profile\>.json**: Sidecar files merge global strategy defaults with per-profile overrides
- **Generated context-guard.\<profile\>.json**: `compaction.max_input_tokens` values are extracted per profile
- **Generated .omo-profiles.json**: Lists all profile IDs and the default profile
