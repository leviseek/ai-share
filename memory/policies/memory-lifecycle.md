# Memory Lifecycle

本文件定义 `memory/` 中长期记忆的分层、写入、复核和过期规则。目标是让记忆可追溯、低噪音、可跨设备复现。

## Layers

- `memory/stable/`：用户确认过的长期事实和稳定偏好。写入或修改前需要人工确认。
- `memory/user/`：用户画像、沟通偏好、设备和工具链摘要。保持人类可读，避免堆砌执行细节。
- `memory/architecture/`：AI Desktop、编码哲学等可共享架构知识。
- `memory/profiles/`：按 profile 激活的任务模式约束。
- `memory/policies/`：记忆治理、安全和执行契约。
- `memory/inferred/`：AI 推断但尚未确认的候选事实，默认不作为稳定事实。
- `memory/distilled/`：从会话、调试、项目经验中人工确认后的可复用模式。
- `memory/local/`、`memory/private/`、`memory/project/`、`memory/runtime/`、`memory/sync/`：本机、项目或运行时私有层，默认不提交。

## Write Rules

- 写入 `stable/` 或 `distilled/` 前必须获得用户确认。
- `inferred/` 可保存候选结论，但必须标明来源、置信度和待审查状态。
- 不保存完整聊天记录；只保存会改变未来 AI 行为的事实、偏好、流程或模式。
- 写入前检查是否已有等价规则；重复内容应合并或改为引用。
- 不写真实密钥、token、cookie、私钥或未脱敏生产数据。

## Suggested Metadata

可在 YAML 条目或 Markdown frontmatter 中使用以下字段：

```yaml
source: "user-confirmed | session-distilled | external-doc | ai-inferred"
confirmed_by_user: true
created_at: "YYYY-MM-DD"
review_after: "YYYY-MM-DD"
expires_at: null
scope: "global | profile:<name> | project:<name> | local"
confidence: "high | medium | low"
```

## Review And Expiry

- `stable/` 中无过期时间的事实默认长期有效，但若被用户纠正，应更新或替换。
- `inferred/` 条目应设置 `review_after`；超过复核日期仍未确认时视为 stale。
- 与模型、工具、价格、法律、外部 API、路径或设备状态相关的事实应设置复核或过期日期。
- 过期事实不得作为决策依据；应重新确认后再迁移到 `stable/` 或 `distilled/`。
