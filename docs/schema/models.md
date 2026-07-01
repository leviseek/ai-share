# config/models.yaml Schema

## Overview

Model catalog. Each entry defines an upstream GPT-compatible model ID, provider group assignment, capabilities, cost, token limits, temperature, optional parameters, and a fallback chain. Models are referenced by key from `profiles.yaml`.

## Fields

Each top-level key is a model ID. Model IDs must be unique and kebab-case.

| Field                                   | Type     | Default | Required | Description                                                                                          |
| --------------------------------------- | -------- | ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `<model_id>`                            | object   | —       | yes      | Model ID; alphanumeric kebab-case, must be unique                                                    |
| `<model_id>.provider_group`             | string   | —       | yes      | Provider group name: `gpt`; resolved at generation time to a concrete provider                       |
| `<model_id>.model_name`                 | string   | —       | yes      | Upstream model name sent in API requests                                                             |
| `<model_id>.capabilities`               | string[] | `[]`    | no       | Model capability tags: `reasoning`, `planning`, `long_context`, `coding`, `cheap`, `fast`, `general` |
| `<model_id>.cost.input`                 | number   | —       | yes      | Cost per 1K input tokens in USD                                                                      |
| `<model_id>.cost.output`                | number   | —       | yes      | Cost per 1K output tokens in USD                                                                     |
| `<model_id>.limits.context_window`      | number   | —       | yes      | Max context window in tokens                                                                         |
| `<model_id>.limits.max_output`          | number   | —       | yes      | Max output tokens per response                                                                       |
| `<model_id>.temperature`                | number   | `0.2`   | no       | Sampling temperature                                                                                 |
| `<model_id>.parameters.reasoningEffort` | string   | —       | no       | GPT reasoning effort level: `low`, `medium`, `high`                                                  |
| `<model_id>.fallback`                   | string[] | `[]`    | no       | Ordered fallback model IDs (must exist in this file)                                                 |
| `<model_id>.provider`                   | string   | —       | no       | Internal resolved provider ID after `provider_group` selection; do not author it in source YAML      |

## Valid Values

- **provider_group**: `gpt`
- **capabilities**: `reasoning`, `planning`, `long_context`, `coding`, `cheap`, `fast`, `general`
- **parameters.reasoningEffort**: `low`, `medium`, `high`
- **temperature**: 0.0–2.0 (common range: 0.1–0.7)
- **cost**: Positive numbers in USD per 1K tokens
- **context_window**: 4000–200000
- **max_output**: 1024–8192

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

### Full model entry with fallback chain

```yaml
gpt-5.5-coding:
  provider_group: gpt
  model_name: gpt-5.5
  capabilities:
    - coding
    - reasoning
    - planning
    - long_context
  cost:
    input: 0.01
    output: 0.03
  limits:
    context_window: 200000
    max_output: 8192
  temperature: 0.1
  parameters:
    reasoningEffort: high
  fallback:
    - gpt-5.5
    - gpt-5.4
```

## Model Catalog

| Model ID         | Provider Group | Context Window | Cost (Input/Output per 1K) | Thinking |
| ---------------- | -------------- | -------------- | -------------------------- | -------- |
| `gpt-5.5`        | gpt            | 200K           | $0.01 / $0.03              | —        |
| `gpt-5.4`        | gpt            | 160K           | $0.008 / $0.025            | —        |
| `gpt-5.4-mini`   | gpt            | 128K           | $0.0012 / $0.0024          | —        |
| `gpt-5.5-coding` | gpt            | 200K           | $0.01 / $0.03              | —        |

## Cross-File References

- **profiles.yaml**: Profile `models.primary`, `models.reasoning`, `models.fast` reference model IDs from this file
- **profiles.yaml**: `compaction.model` can be a model ID from this file or a role name (`primary`, `reasoning`, `fast`)
- **provider.yaml**: The `provider_group` field is resolved to a concrete provider at generation time
- **Generated Codex config**: Profile roles resolve to upstream model names and provider IDs
