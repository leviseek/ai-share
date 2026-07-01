# 开发工具链

## 语言与运行时

- **TypeScript**（主力语言，strict 模式）
- **Bun**（首选运行时和包管理器）
- Node.js（备选，用于特定场景）

## 核心工具

- **Codex CLI**：主力 AI Coding agent，承载 Build/Plan/Review 等本地协作模式
- **Codex CLI**：AI Coding 入口，通过 `codex` 启动
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
- Codex 原生 skills 由生成器安装到 `~/.codex/skills/`
- 用户级记忆在 `memory/`
