# ai-share

`ai-share` 以严格 YAML 为权威源，为多个设备生成用户级 OpenCode 配置、instructions、native skills 和最小 `aioc` 启动器。项目使用 Bun + strict TypeScript，不维护 oh-my-openagent、profile、fallback 或运行时 manifest。

```text
config/*.yaml + config/local/*.yaml
→ Bun.YAML.parse
→ 严格配置与 secret 校验
→ model/provider 与 task memory 解析
→ GenerationPlan
→ 事务化写入和 prune
```

## 环境要求

- Bun `1.3.13`
- OpenCode `1.18.11+`

```sh
bun install --frozen-lockfile
bun run ai:check
bun run ai:explain -- --json
bun run ai:gen -- --dry-run
bun run ai:gen
```

`ai:check` 是离线仓库配置检查。`ai:bootstrap` 会安装依赖、检查配置并生成 OpenCode 输出：

```sh
bun run ai:bootstrap
bun run ai:bootstrap -- --skip-install
```

生成完成后使用 `aioc` 启动；直接运行 `opencode` 也可使用相同配置，但不会加载 ai-share managed `.env` 中的代理变量。

## 配置源

| 文件                   | 用途                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| `config/global.yaml`   | 默认 `model`、`provider` 与 OpenCode 最低版本                      |
| `config/provider.yaml` | OpenAI-compatible Provider、HTTPS endpoint 与 API Key 环境变量引用 |
| `config/models.yaml`   | 上游 `model_name` 与可选 `reasoning_effort`                        |
| `config/mcp.yaml`      | stdio 或 HTTP MCP server                                           |
| `config/env.yaml`      | `aioc` 注入的共享非密钥环境变量                                    |
| `config/agents.yaml`   | OpenCode custom agent、模型、mode、prompt 与 reasoning 覆盖        |

固定对象拒绝未知字段。API Key 只能写成 `${ENV_NAME}` 引用；生成的 OpenCode 配置会转换为 `{env:ENV_NAME}`，不会读取或持久化真实值。

生成器先读取 `config/*.yaml`，再深合并同名 `config/local/*.yaml`：object 深合并，数组和标量替换。当前机器的代理等非密钥值放在被 Git 忽略的 `config/local/env.yaml`：

```powershell
New-Item -ItemType Directory -Force config/local | Out-Null
Copy-Item templates/personal-overlay/env.local.example.yaml config/local/env.yaml
```

禁止把 `HOME`、`USERPROFILE`、`PATH`、`AI_SHARE_*`、`OPENCODE_*` 或敏感变量写入 env 配置。

## Provider 与任务选择

默认 Provider 的权威源是 `global.provider`。显式和非交互选择优先级为：

```text
--provider > AI_SHARE_PROVIDER > global.provider
```

交互终端未传 `--provider` 时显示 Provider 菜单。生成配置只物化当前选中的 Provider，但会在该 Provider 下注册 `models.yaml` 的全部模型别名。

```sh
bun run ai:gen -- --provider packyapi
bun run ai:gen -- --task "Windows 事务化文件写入"
```

任务优先级为 `--task > AI_SHARE_TASK`。最多三个相关 memory 文件会直接追加到 OpenCode `instructions` 数组。

## 可解释预览

`ai:explain` 复用 `ai:gen` 的加载、选择、检索和 GenerationPlan 流程，但始终零写入、离线且不读取真实 API Key。

```sh
bun run ai:explain
bun run ai:explain -- --provider codexapis
bun run ai:explain -- --task "Windows 事务化文件写入"
bun run ai:explain -- --force
bun run ai:explain -- --json
```

JSON 接口当前为 `schema_version: 2`。报告只包含来源、env 名称、memory 决策和 plan metadata，不包含 env 值、生成内容或凭据。未受管 collision 返回 `1`；`--force` 仅模拟显式接管。

## Custom agent

`config/agents.yaml` 中的 agents 直接生成到 `opencode.jsonc` 的 `agent` 对象。默认 `ai-share-commit-operator` 是 `subagent`，使用 `gpt-5.5` 和 `low` reasoning；只有用户明确要求提交、推送或提交并推送时才应委派给它。

## 生成输出与所有权

默认 OpenCode 配置目录是 `~/.config/opencode`；可用绝对路径 `OPENCODE_CONFIG_DIR` 覆盖。

```text
~/.config/opencode/opencode.jsonc
~/.config/opencode/.env                     # 仅更新 ai-share managed block
~/.config/opencode/skills/<skill>/SKILL.md
~/.config/opencode/skills/<skill>/.ai-share-managed
~/.local/bin/aioc.ts
~/.local/bin/aioc
~/.local/bin/aioc.cmd
~/.local/bin/aioc.ps1
```

- 缺失目标创建；受管目标更新；内容相同不写入。
- 未受管 config、skill 或 launcher collision 会使整批计划失败。
- `--force` 只显式接管冲突，不能绕过 schema 或 secret 校验。
- `.env` block 外内容和未标记的用户 skills/launchers保持不变。
- config、env、skills 与 launcher 在同一事务中 promote，失败时回滚。

已有未受管 `opencode.jsonc` 首次采用需备份后运行 `bun run ai:gen -- --force`。迁移不会读取、修改或清理原来的 `~/.codex`。

## `aioc` 环境规则

`aioc` 读取 OpenCode 配置目录中的 managed `.env`，只补全当前进程尚未设置的变量，再原样执行 `opencode <args...>`。Shell/系统环境优先，因此可临时覆盖代理。API Key、token、cookie 不允许进入该文件。

## 安全清理

```sh
bun run ai:clean
bun run ai:clean -- --no-backup
```

`ai:clean` 只处理 generated header、managed env block、skill marker 和 launcher marker 能证明所有权的目标。默认备份到 `~/.opencode-backups/`，不会递归删除整个 OpenCode 配置目录，也不会触碰未受管文件。

## Memory 与 Schema

固定 instructions 为：

1. `AI_GUIDELINES.md`
2. `memory/policies/ai-execution-contract.md`
3. `memory/policies/memory-lifecycle.md`
4. 最多三个任务检索结果
5. `memory/stable/user.yaml`
6. `memory/stable/workflows.yaml`
7. `memory/stable/devices.yaml`

检索只包含 architecture、stack、非固定 policies 和人工确认的 distilled 内容。`TEMPLATE.md`、inferred 和未确认 distilled 不注入。

```sh
bun run schema:gen
bun run schema:check
```

`src/config/schema-spec.ts` 同时驱动 JSON Schema 与运行时 shape 校验；shareable templates 使用相同 pipeline。

## 诊断与质量门禁

```sh
bun run ai:doctor
bun run ai:doctor -- --online
bun run ai:doctor -- --canary --json
bun run provider:check -- --provider codexapis
bun run check
```

`ai:doctor` 默认检查 OpenCode 版本、配置漂移、managed env、`aioc`、本地代理、memory 和 API Key env 是否存在；只有 `--online`/`--canary` 访问 Provider。完整 `check` 包含 format、lint、typecheck、tests、schema、memory、skill 和配置检查。
