# OpenCode 使用知识

## 配置机制

- 用户级配置通过 `instructions` 数组注入系统提示
- 每个 profile 可以有独立的 model/compaction/plugin 配置
- aioc 配置是 opencode 的子集，排除 OMO 相关插件
- 项目级 `opencode.jsonc` 可以覆盖全局配置

## Agent 类型

- **build**：主要编码 agent，primary 模型
- **plan**：只读规划 agent，`{ edit: deny, bash: ask }` 权限
- **explore**：代码搜索 agent，fast 模型，无编辑权限
- **general**：通用子 agent，subagent 模式
- **compaction**：自动压缩 agent
- **title/summary**：标题和摘要 agent

## compaction 策略

- `auto`：是否启用自动压缩
- `prune`：是否启用裁剪
- `reserved`：保留 token 数（预留空间）
- threshold 决定触发压缩的阈值
