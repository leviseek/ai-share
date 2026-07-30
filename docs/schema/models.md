# config/models.yaml Schema

## Overview

Model catalog. Each entry defines an upstream GPT-compatible model ID, provider group assignment, capabilities, cost, token limits, temperature, optional parameters, and a fallback chain. `config/global.yaml` references one model by key.

## Fields

Each top-level key is a model ID. Model IDs must be unique and kebab-case. Cost values use this repository's convention: USD per 1K tokens.

| Field                                   | Type     | Default | Required | Description                                                                                           |
| --------------------------------------- | -------- | ------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `<model_id>`                            | object   | —       | yes      | Model ID; alphanumeric kebab-case, must be unique                                                     |
| `<model_id>.provider_group`             | string   | —       | yes      | Provider group name: `gpt`; resolved at generation time to a concrete provider                        |
| `<model_id>.model_name`                 | string   | —       | yes      | Upstream model name sent in API requests                                                              |
| `<model_id>.capabilities`               | string[] | `[]`    | no       | Model capability tags, for example `reasoning`, `planning`, `long_context`, `coding`, `cheap`, `fast` |
| `<model_id>.cost.input`                 | number   | —       | yes      | Cost per 1K input tokens in USD                                                                       |
| `<model_id>.cost.output`                | number   | —       | yes      | Cost per 1K output tokens in USD                                                                      |
| `<model_id>.limits.context_window`      | number   | —       | yes      | Max context window in tokens                                                                          |
| `<model_id>.limits.max_output`          | number   | —       | yes      | Max output tokens per response                                                                        |
| `<model_id>.temperature`                | number   | `0.2`   | no       | Sampling temperature                                                                                  |
| `<model_id>.parameters.reasoningEffort` | string   | —       | no       | GPT reasoning effort level used by generated Codex config: `low`, `medium`, `high`                    |
| `<model_id>.fallback`                   | string[] | `[]`    | no       | Ordered fallback model IDs (must exist in this file)                                                  |
| `<model_id>.provider`                   | string   | —       | no       | Internal resolved provider ID after `provider_group` selection; do not author it in source YAML       |

## Valid Values

- **provider_group**: `gpt`
- **capabilities**: Free-form tags such as `reasoning`, `planning`, `long_context`, `coding`, `cheap`, `fast`, `general`, `flagship`, `balanced`, `premium`
- **parameters.reasoningEffort**: `low`, `medium`, `high`
- **temperature**: 0.0–2.0 (common range: 0.1–0.7)
- **cost**: Positive numbers in USD per 1K tokens
- **context_window**: 4000–1000000
- **max_output**: 1024–128000

## Examples

### Minimal model entry

```yaml
gpt-5.6-luna:
  provider_group: gpt
  model_name: gpt-5.6-luna
  cost:
    input: 0.001
    output: 0.006
  limits:
    context_window: 1000000
    max_output: 128000
  temperature: 0.2
```

### Full model entry with fallback chain

```yaml
gpt-5.6-coding:
  provider_group: gpt
  model_name: gpt-5.6-sol
  capabilities:
    - coding
    - reasoning
    - planning
    - long_context
  cost:
    input: 0.005
    output: 0.03
  limits:
    context_window: 1000000
    max_output: 128000
  temperature: 0.1
  parameters:
    reasoningEffort: high
  fallback:
    - gpt-5.6-sol
    - gpt-5.5
```

## Model Catalog

| Model ID         | Provider Group | Context Window | Cost (Input/Output per 1K) | Thinking |
| ---------------- | -------------- | -------------- | -------------------------- | -------- |
| `gpt-5.6-sol`    | gpt            | 1M             | $0.005 / $0.03             | high     |
| `gpt-5.6-terra`  | gpt            | 1M             | $0.0025 / $0.015           | medium   |
| `gpt-5.6-luna`   | gpt            | 1M             | $0.001 / $0.006            | low      |
| `gpt-5.5-pro`    | gpt            | 200K           | $0.03 / $0.18              | high     |
| `gpt-5.5`        | gpt            | 400K           | $0.005 / $0.03             | medium   |
| `gpt-5.6-coding` | gpt            | 1M             | $0.005 / $0.03             | high     |
| `gpt-5.5-coding` | gpt            | 400K           | $0.005 / $0.03             | high     |

## Cross-File References

- **global.yaml**: `model` references a model ID from this file.
- **provider.yaml**: `provider_group` is resolved to a concrete provider at generation time.
- **Generated Codex config**: The selected model resolves to upstream model name and provider ID.
