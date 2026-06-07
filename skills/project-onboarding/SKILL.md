---
name: project-onboarding
description: Use when analyzing a new project, finding build/test entry points, generated files, local rules, or repository risk zones before planning changes.
---

# Project Onboarding

Use this skill to build a compact repository map before planning or editing in an unfamiliar project.

## Workflow

1. Inspect local rules first: `AGENTS.md`, package metadata, config files, and project docs.
2. Identify runtime, package manager, entry points, generated files, test commands, and risk zones from repository evidence.
3. Keep the map concise and cite exact files or commands.
4. List the next files to inspect only when they materially reduce uncertainty.
5. Do not implement changes while producing the onboarding map.

## Output Template

```md
## Project Map

- Runtime:
- Package manager:
- Entry points:
- Config source of truth:
- Generated files:
- Test commands:
- Risk zones:
- Local rules:
- Next files to inspect:
```

## Trigger Examples

- "先熟悉这个新仓库再制定修改计划。"
- "找出项目的构建、测试和入口文件。"
- "分析这个项目有哪些生成文件和风险区。"

## Anti Examples

- "直接修复这个 TypeScript 报错。"
- "为已熟悉的文件做一个小格式调整。"
- "提交当前 git 改动。"
