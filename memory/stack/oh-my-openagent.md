# oh-my-openagent 使用知识

## 核心概念

- **categories**：任务分类，每个 category 绑定额外的 system prompt 和模型
- **agents**：命名 agent，可以被 slash command 或 API 调用
- **runtime_fallback**：兜底模型，非 primary/reasoning/fast 角色使用
- **background_task**：后台任务相关配置

## 配置入口

- 生成在 `oh-my-openagent.json` 和 `profiles/oh-my-openagent/<profile>.json`
- 通过 `opencode.json` 中的 `oh-my-openagent@3.17.5` 插件启用
- 项目级覆盖在 `.opencode/oh-my-openagent.jsonc`

## 关键特性

- 禁用 `auto-slash-command` hook，避免 native skills 被二次展开
- `shared_prompt.append` 会注入 AI_GUIDELINES.md 中的工作流期望
- category 和 agent 都通过 `primary`/`reasoning`/`fast` 角色映射模型

## 与 OpenCode 关系

- OMO 是 OpenCode 的插件层，提供多 agent 编排
- `aiomo` 命令：启动 OMO 模式（加载完整插件）
- `aioc` 命令：启动原生 OpenCode 模式（排除 OMO 插件）
- OMO 和原生模式共享同一套 profile 角色映射
