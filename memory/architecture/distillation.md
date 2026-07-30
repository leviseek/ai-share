# 记忆蒸馏流程

记忆蒸馏把已验证、可复用且会改变未来 AI 行为的事实整理为普通仓库 patch。核心规则是：**AI 提案，人工确认，Git 可审查**。

## 工具边界

- `memory-curator`：分层、去重、冲突检查和长期事实 patch。
- `failure-distiller`：把调试失败、事故和错误修复提炼为可复用模式 patch。
- 不存在 runtime memory compiler、proposal executor、后台索引或自动写回服务。
- `ai-share` generator 只选择文件路径并生成 `AGENTS.md`，不会解析后重写 memory。

## 目标层

| Layer                                         | 内容                             | 确认要求                   |
| --------------------------------------------- | -------------------------------- | -------------------------- |
| `memory/stable/`                              | 用户画像、工作流、设备等长期事实 | 用户明确确认               |
| `memory/distilled/`                           | 根因、错误修复、检测和预防模式   | `confirmed_by_user: true`  |
| `memory/inferred/`                            | 尚未确认的候选                   | 不作为稳定事实，不自动注入 |
| `memory/architecture/`、`stack/`、`policies/` | 可共享架构、技术栈与治理说明     | 普通代码审查               |

## Workflow

1. 从任务或故障中提取会影响未来决策的最小事实。
2. 搜索等价规则，优先合并或引用，避免重复。
3. 选择正确层并给出目标路径、理由、来源和必要 metadata。
4. 生成普通 Markdown/YAML patch，不写 `.bak`、临时 manifest 或隐藏状态。
5. 用户审查并明确确认 stable/distilled 变更后才应用。
6. 运行 `bun run memory:lint`、`bun run memory:check` 和 `bun run memory:eval`。

## Distilled Metadata

```yaml
source: session-distilled
confirmed_by_user: true
created_at: YYYY-MM-DD
review_after: YYYY-MM-DD
scope: global
confidence: high
```

蒸馏内容应说明 root cause、错误修复、正确修复、检测方式和预防措施；不要保存完整会话或大段日志。

## Anti-patterns

- 未获确认就写入 stable/distilled。
- 不得保存 API Key、token、cookie、私钥或未脱敏生产数据。
- 把短期任务状态、一次性命令或聊天记录当长期记忆。
- 依赖已删除的 compiler/proposal 模块或声称自动写回。
- 不得为同步记忆自动 commit、push 或改写 Git 历史。
