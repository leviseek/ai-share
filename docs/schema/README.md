# Schema

机器可执行的 YAML 规格由 `src/config/schema-spec.ts` 单点定义：

- `bun run schema:gen` 同步 `docs/schema/json/*.schema.json` 并删除废弃 schema。
- `bun run schema:check` 只读比较应生成文件集合和内容，缺失、漂移、额外文件均失败。
- `src/config/validators/schema-shape.ts` 从同一份规格执行运行时 shape 校验。
- Markdown 只解释行为，不复制易漂移的模型成本、上下文或 Provider group 表格。

各配置源的字段说明：[`global.md`](global.md)、[`provider.md`](provider.md)、[`models.md`](models.md)、[`mcp.md`](mcp.md)、[`agents.md`](agents.md)、[`plugins.md`](plugins.md)、[`tools.md`](tools.md)、[`env.md`](env.md)、[`wezterm.md`](wezterm.md)。
