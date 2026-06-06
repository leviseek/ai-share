# Memory Privacy Layers

`memory/` 同时服务个人使用和未来团队化。默认按隐私层处理：

| Layer     | Paths                                                                           | Git                        | Use                                  |
| --------- | ------------------------------------------------------------------------------- | -------------------------- | ------------------------------------ |
| shareable | `memory/architecture/`, `memory/stack/`, `memory/profiles/`, `memory/policies/` | committed                  | 团队可共享知识、技术栈、profile 说明 |
| personal  | `memory/user/`, `memory/stable/`                                                | committed in personal repo | 个人偏好、设备摘要、长期工作流       |
| local     | `memory/local/`, `memory/private/`                                              | ignored                    | 本机路径、私有上下文、不可共享信息   |
| project   | `memory/project/`                                                               | ignored                    | 当前项目临时或局部记忆               |

## Rules

- 真实 API key、token、cookie、私有凭据永远不写入任何 memory。
- 团队导出默认只包含 shareable layer。
- personal layer 可以保留在个人私有仓库，但不进入模板包。
- local/project layer 默认由 `.gitignore` 排除。
- `AI_GUIDELINES.md` 和 generated `AGENTS.md` 不自动加载 ignored privacy layers。

## Current Loader Behavior

当前 `buildInstructionsPaths` 只加载明确列出的 `memory/user/`、`memory/architecture/`、`memory/stack/`、profile memory 和 stable memory。`memory/local/`、`memory/private/`、`memory/project/` 不会被自动注入。
