# 开发工具链

## 语言与运行时

- **TypeScript**（主力语言，strict 模式）
- **Bun**（首选运行时和包管理器）
- Node.js（备选，用于特定场景）

## 核心工具

- **OpenCode**：AI Coding agent，支持 Build/Plan 原生模式和 OMO 编排
- **oh-my-openagent**：多 agent 编排框架，用于复杂任务分解
- **Git**：版本控制和多设备同步

## 代码质量

- **Prettier**：格式检查（双引号、分号、尾逗号、LF、printWidth 120）
- **ESLint**：TypeScript lint
- **TypeScript**：严格类型检查
- **Playwright**：浏览器自动化（测试/截图/爬取）

## 项目结构

- 配置源在 `config/*.yaml`
- 生成器在 `src/`
- 启动器在 `bin/`
- 插件在 `plugins/`
- 用户级记忆在 `memory/`
