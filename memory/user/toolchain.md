# 开发工具链

## 摘要

- 主力语言：TypeScript strict
- 首选运行时和包管理器：Bun
- 主力 AI Coding 入口：Codex CLI，通过 `codex` 命令启动
- 版本控制与多设备同步：Git

## 代码质量

- 项目格式化、lint、类型检查规则以仓库配置为准
- 常用检查：Prettier、ESLint、TypeScript、Bun test

## 项目结构

- 配置源在 `config/*.yaml`
- 生成器在 `src/`
- 用户级记忆在 `memory/`
- Codex 原生 skills 由生成器安装到 `~/.codex/skills/`
