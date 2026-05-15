# config/global.yaml Schema

## Overview

Global runtime defaults for the ai-share generator. Controls default profile selection, proxy settings, OpenCode/TUI plugins, workspace ignore lists, context budget, DCP/checkpoint/memory strategy defaults, context guard thresholds, and DingTalk notifier configuration. Every generated output references at least one field from this file.

## Fields

| Field                                          | Type     | Default                                    | Required | Description                                                    |
| ---------------------------------------------- | -------- | ------------------------------------------ | -------- | -------------------------------------------------------------- |
| `default_profile`                              | string   | `balanced`                                 | yes      | Default OMO profile name; must match a key in `profiles.yaml`  |
| `env.mode`                                     | string   | `dev`                                      | no       | Environment mode: `dev`, `staging`, or `prod`                  |
| `env.log_level`                                | string   | `info`                                     | no       | Log level: `debug`, `info`, `warn`, or `error`                 |
| `features.auto_router`                         | boolean  | `true`                                     | no       | Enable automatic model routing                                 |
| `features.memory`                              | boolean  | `true`                                     | no       | Enable memory system                                           |
| `features.fallback`                            | boolean  | `true`                                     | no       | Enable model fallback on errors                                |
| `features.cost_tracking`                       | boolean  | `true`                                     | no       | Track token cost per session                                   |
| `runtime.timeout_ms`                           | number   | `120000`                                   | no       | Global request timeout in milliseconds                         |
| `runtime.max_retries`                          | number   | `2`                                        | no       | Max retries on transient failures                              |
| `proxy.enabled`                                | boolean  | `true`                                     | no       | Enable shared proxy for launcher scripts                       |
| `proxy.host`                                   | string   | `127.0.0.1`                                | no       | Proxy host address                                             |
| `proxy.port`                                   | number   | `7897`                                     | no       | Proxy port                                                     |
| `proxy.protocol`                               | string   | `http`                                     | no       | Proxy protocol: `http`, `https`, or `socks5`                   |
| `proxy.no_proxy`                               | string[] | `[localhost, 127.0.0.1, ::1]`              | no       | Hosts excluded from proxy                                      |
| `opencode.plugins`                             | string[] | `[]`                                       | no       | OpenCode plugins to install (npm packages or local paths)      |
| `opencode.aioc_excluded_plugins`               | string[] | `[]`                                       | no       | Plugins excluded when running in native aioc mode              |
| `opencode.optional_plugins`                    | string[] | `[]`                                       | no       | Optional plugins not enabled by default                        |
| `tui.plugins`                                  | string[] | `[]`                                       | no       | TUI plugins to load                                            |
| `models.default`                               | string   | `gpt-5.5`                                  | no       | Default model ID from `models.yaml`                            |
| `models.small`                                 | string   | `gpt-5.4-mini`                             | no       | Small/fast model ID from `models.yaml`                         |
| `context.max_tokens`                           | number   | `120000`                                   | no       | Max context tokens for agent                                   |
| `context.strategy`                             | string   | `truncate`                                 | no       | Context overflow strategy: `truncate`, `summarize`, or `split` |
| `context.cache_enabled`                        | boolean  | `true`                                     | no       | Enable DCP/checkpoint/memory caching strategies                |
| `workspace.ignore`                             | string[] | _(see file)_                               | no       | Glob patterns for files to ignore in workspace                 |
| `compaction.enabled`                           | boolean  | `true`                                     | no       | Enable automatic context compaction                            |
| `compaction.threshold`                         | number   | `65000`                                    | no       | Token threshold to trigger compaction                          |
| `compaction.model`                             | string   | —                                          | no       | Model role or ID for compaction agent                          |
| `compaction.max_input_tokens`                  | number   | —                                          | no       | Max input tokens for context guard                             |
| `dcp`                                          | object   | —                                          | no       | Default DCP strategy; see StrategySource type                  |
| `checkpoint`                                   | object   | —                                          | no       | Default checkpoint strategy; see StrategySource type           |
| `memory`                                       | object   | —                                          | no       | Default memory strategy; see StrategySource type               |
| `context_guard.enabled`                        | boolean  | `true`                                     | no       | Enable session context guard                                   |
| `context_guard.warn_ratio`                     | number   | `0.6`                                      | no       | Ratio of max_input_tokens that triggers warning                |
| `context_guard.danger_ratio`                   | number   | `0.8`                                      | no       | Ratio that triggers danger level                               |
| `context_guard.block_ratio`                    | number   | `0.95`                                     | no       | Ratio that blocks session recovery                             |
| `context_guard.absolute_block_tokens`          | number   | `250000`                                   | no       | Absolute token ceiling that blocks recovery                    |
| `context_guard.rescue_dir`                     | string   | `.opencode-rescue`                         | no       | Directory for rescue summary files                             |
| `context_guard.diagnostics`                    | boolean  | `true`                                     | no       | Enable diagnostic logging                                      |
| `context_guard.watch_interval_ms`              | number   | `5000`                                     | no       | Watch interval in milliseconds                                 |
| `context_guard.zero_output_limit`              | number   | `3`                                        | no       | Consecutive zero-output alerts before action                   |
| `context_guard.watch_action`                   | string   | `stop`                                     | no       | Action on threshold breach: `alert` or `stop`                  |
| `context_guard.alert_file`                     | string   | `.opencode/context-guard-watch/alert.json` | no       | Path to alert JSON file                                        |
| `context_guard.history_dir`                    | string   | `.opencode/context-guard-watch/history`    | no       | Directory for alert history snapshots                          |
| `dingtalk_notifier.enabled`                    | boolean  | `true`                                     | no       | Enable DingTalk notification plugin                            |
| `dingtalk_notifier.webhook_env`                | string   | `AI_SHARE_DINGTALK_WEBHOOK`                | no       | Env var name for DingTalk webhook URL                          |
| `dingtalk_notifier.secret_env`                 | string   | `AI_SHARE_DINGTALK_SECRET`                 | no       | Env var name for DingTalk signing secret                       |
| `dingtalk_notifier.keyword_env`                | string   | `AI_SHARE_DINGTALK_KEYWORD`                | no       | Env var name for DingTalk keyword                              |
| `dingtalk_notifier.message_type`               | string   | `markdown`                                 | no       | Message format: `text` or `markdown`                           |
| `dingtalk_notifier.events`                     | string[] | `[session.idle]`                           | no       | Events that trigger notification                               |
| `dingtalk_notifier.require_review_before_send` | boolean  | `true`                                     | no       | Require AI to review before sending                            |
| `dingtalk_notifier.review_items`               | string[] | _(see file)_                               | no       | Items to include in review confirmation                        |
| `dingtalk_notifier.min_interval_ms`            | number   | `60000`                                    | no       | Minimum interval between notifications                         |
| `dingtalk_notifier.timeout_ms`                 | number   | `10000`                                    | no       | HTTP request timeout for DingTalk API                          |
| `telemetry.enabled`                            | boolean  | —                                          | no       | (commented out) Enable telemetry                               |
| `telemetry.endpoint`                           | string   | —                                          | no       | (commented out) Telemetry endpoint URL                         |

## Valid Values

- **env.mode**: `dev`, `staging`, `prod`
- **env.log_level**: `debug`, `info`, `warn`, `error`
- **proxy.protocol**: `http`, `https`, `socks5`
- **context.strategy**: `truncate`, `summarize`, `split`
- **context_guard.watch_action**: `alert`, `stop`
- **dingtalk_notifier.message_type**: `text`, `markdown`

## Examples

### Minimal

```yaml
default_profile: balanced
```

### Full

See `config/global.yaml` in the repository for the complete reference configuration with all defaults.

## Cross-File References

- **profiles.yaml**: `default_profile` must match a top-level key in `profiles.yaml`
- **models.yaml**: `models.default` and `models.small` must match keys in `models.yaml`
- **provider.yaml**: Proxy settings affect how launcher scripts configure provider access
- **agents.yaml**: `compaction` & `context_guard` defaults feed into generated OMO config
- **Generated outputs**: Every generated JSON under `~/.config/opencode/` references at least one field from this file
- **strategy.\<profile\>.json**: `dcp`, `checkpoint`, `memory` have defaults here that are merged with per-profile overrides
- **context-guard.\<profile\>.json**: `compaction.max_input_tokens` and `context_guard.*` are materialized into context guard profiles
- **proxy.json**: Generated directly from `proxy.*` fields
- **dingtalk-notifier.json**: Generated directly from `dingtalk_notifier.*` fields
- **tui.json**: Generated from `tui.plugins`
