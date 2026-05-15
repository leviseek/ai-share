# config/models.yaml Schema

## Overview

Model catalog. Each entry defines an upstream model ID, provider group assignment, capabilities, cost, token limits, temperature, optional parameters (thinking/reasoning), and a fallback chain. Models are referenced by key from `profiles.yaml` and `agents.yaml`.

## Fields

Each top-level key is a model ID. Model IDs must be unique and kebab-case.

| Field                                    | Type     | Default | Required | Description                                                                                          |
| ---------------------------------------- | -------- | ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `<model_id>`                             | object   | —       | yes      | Model ID; alphanumeric kebab-case, must be unique                                                    |
| `<model_id>.provider_group`              | string   | —       | yes      | Provider group name: `gpt` or `deepseek`; resolved at generation time to a concrete provider         |
| `<model_id>.model_name`                  | string   | —       | yes      | Upstream model name sent in API requests                                                             |
| `<model_id>.capabilities`                | string[] | `[]`    | no       | Model capability tags: `reasoning`, `planning`, `long_context`, `coding`, `cheap`, `fast`, `general` |
| `<model_id>.cost.input`                  | number   | —       | yes      | Cost per 1K input tokens in USD                                                                      |
| `<model_id>.cost.output`                 | number   | —       | yes      | Cost per 1K output tokens in USD                                                                     |
| `<model_id>.limits.context_window`       | number   | —       | yes      | Max context window in tokens                                                                         |
| `<model_id>.limits.max_output`           | number   | —       | yes      | Max output tokens per response                                                                       |
| `<model_id>.temperature`                 | number   | `0.2`   | no       | Sampling temperature                                                                                 |
| `<model_id>.parameters.thinking.type`    | string   | —       | no       | Set to `enabled` to enable thinking mode (DeepSeek models)                                           |
| `<model_id>.parameters.reasoning_effort` | string   | —       | no       | Reasoning effort level: `high`, `max`; only for thinking-enabled models                              |
| `<model_id>.fallback`                    | string[] | `[]`    | no       | Ordered fallback model IDs (must exist in this file)                                                 |
| `<model_id>.provider`                    | string   | —       | no       | _(legacy)_ Direct provider ID override (use `provider_group` instead)                                |

## Valid Values

- **provider_group**: `gpt`, `deepseek`
- **capabilities**: `reasoning`, `planning`, `long_context`, `coding`, `cheap`, `fast`, `general`
- **parameters.thinking.type**: `enabled` (absent = no thinking)
- **parameters.reasoning_effort**: `high`, `max` (only meaningful when thinking is enabled)
- **temperature**: 0.0–2.0 (common range: 0.1–0.7)
- **cost**: Positive numbers in USD per 1K tokens
- **context_window**: 4000–256000
- **max_output**: 1024–16384

## Examples

### Minimal model entry

```yaml
gpt-5.4-mini:
  provider_group: gpt
  model_name: gpt-5.4-mini
  cost:
    input: 0.0012
    output: 0.0024
  limits:
    context_window: 128000
    max_output: 4096
  temperature: 0.2
```

### Full model entry with thinking and fallback chain

```yaml
deepseek-v4-pro-think-max:
  provider_group: deepseek
  model_name: deepseek-v4-pro
  capabilities:
    - reasoning
    - planning
    - long_context
    - coding
  cost:
    input: 0.005
    output: 0.012
  limits:
    context_window: 256000
    max_output: 16384
  temperature: 0.1
  parameters:
    thinking:
      type: enabled
    reasoning_effort: max
  fallback:
    - deepseek-v4-pro-think
    - deepseek-v4-flash-think
```

## Model Catalog

| Model ID                    | Provider Group | Context Window | Cost (Input/Output per 1K) | Thinking              |
| --------------------------- | -------------- | -------------- | -------------------------- | --------------------- |
| `gpt-5.5`                   | gpt            | 200K           | $0.01 / $0.03              | —                     |
| `gpt-5.4`                   | gpt            | 160K           | $0.008 / $0.025            | —                     |
| `gpt-5.4-mini`              | gpt            | 128K           | $0.0012 / $0.0024          | —                     |
| `gpt-5.3-codex`             | gpt            | 128K           | $0.007 / $0.021            | —                     |
| `deepseek-v4-pro-think-max` | deepseek       | 256K           | $0.005 / $0.012            | enabled (effort=max)  |
| `deepseek-v4-pro-think`     | deepseek       | 128K           | $0.003 / $0.006            | enabled (effort=high) |
| `deepseek-v4-flash-think`   | deepseek       | 128K           | $0.003 / $0.006            | enabled (effort=high) |
| `deepseek-v4-flash`         | deepseek       | 64K            | $0.0008 / $0.0016          | —                     |

## Cross-File References

- **profiles.yaml**: Profile `models.primary`, `models.reasoning`, `models.fast` reference model IDs from this file
- **profiles.yaml**: `compaction.model` can be a model ID from this file or a role name (`primary`, `reasoning`, `fast`)
- **agents.yaml**: Agent `model` fields reference role names resolved through profile model maps
- **global.yaml**: `models.default` and `models.small` reference model IDs from this file
- **provider.yaml**: The `provider_group` field is resolved to a concrete provider at generation time
- **Generated OpenCode config**: Models are materialized into `provider.<group>.models` blocks
- **Generated OMO config**: Model roles are resolved to concrete model IDs with provider prefixes
