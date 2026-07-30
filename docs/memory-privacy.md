# Memory Privacy Layers

| Layer     | Paths                                                       | Git                        | Use                        |
| --------- | ----------------------------------------------------------- | -------------------------- | -------------------------- |
| shareable | `memory/architecture/`, `memory/stack/`, `memory/policies/` | committed                  | 架构、技术栈与治理策略     |
| personal  | `memory/stable/`, `memory/distilled/`                       | committed in personal repo | 已确认长期事实与可复用模式 |
| candidate | `memory/inferred/`                                          | committed only when useful | 未确认候选，不自动注入     |
| local     | `memory/local/`, `memory/private/`                          | ignored                    | 本机或私有上下文           |
| project   | `memory/project/`                                           | ignored                    | 项目局部记忆               |

## Rules

- 真实 API key、token、cookie、私钥和未脱敏生产数据永远不写入 memory。
- 团队导出默认只包含 shareable layer；personal/distilled 需要单独审查。
- local/project layer 必须由 `.gitignore` 排除。
- `bun run memory:check` 检查 ignore 规则、共享层本机路径和疑似 secret。
- 确认是示例误报时，可在同一行使用带原因的 allow 指令；真实 secret 不得 allow。

## Loader Behavior

固定注入只有 execution contract、memory lifecycle 与三个 stable 文件。任务检索仅覆盖 architecture、stack、非固定 policies 和 `confirmed_by_user: true` 的 distilled 文件；`TEMPLATE.md`、inferred、local、private、project 和未确认 distilled 不会自动注入。
