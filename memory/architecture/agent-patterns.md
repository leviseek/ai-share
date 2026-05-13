# Agent 编排模式

## 角色分工

- **Sisyphus**：主编排 agent，负责分解任务、委托子 agent、质量控制
- **Oracle**：只读顾问，用于复杂架构决策和深度调试
- **Explore/Librarian**：代码库搜索和外部文档查询
- **Plan Agent**：复杂任务先出计划，再执行

## 委托策略

- 始终优先委托给最匹配的专业 agent
- 前端/UI 工作 → visual-engineering + frontend-ui-ux
- 复杂逻辑/架构 → ultrabrain / oracle
- 调研探索 → explore + librarian（并行发起）
- 简单改动 → quick
- 文档 → writing

## 上下文管理

- DCP 压缩用于 session 上下文
- memory 文件作为用户级长期记忆在启动时注入
- 旧 session 恢复前先 rescue 生成摘要
- 多轮调试后主动压缩工具输出，不堆积原始日志

## 质量门禁

- 任何改动后运行 `lsp_diagnostics` 确保类型正确
- 功能改动手动验证，不只依赖类型检查
- 无证据不通过—修改后必须验证功能
