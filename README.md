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
bun run ai:help
bun run ai:explain -- --json
bun run ai:gen -- --dry-run
bun run ai:gen
bun run ai:config -- --dry-run --non-interactive
```

`ai:check` 会检查仓库配置，并检测受管工具及其配置状态；`ai:help` 会根据相同的检测结果输出已安装工具的使用提示。`ai:bootstrap` 会安装依赖、检查配置并生成 OpenCode 输出：

```sh
bun run ai:bootstrap
bun run ai:bootstrap -- --skip-install
```

`ai:config` 独立生成 WezTerm 配置，不属于 `ai:bootstrap`。默认在 stdin 和 stdout 均为 TTY 时逐项选择配置；非 TTY 或显式使用 `--non-interactive` 时直接使用 `config/wezterm.yaml`。交互选择只对本次运行生效，不会修改 YAML。预览和写入示例：

```sh
bun run ai:config -- --dry-run
bun run ai:config -- --non-interactive
bun run ai:config -- --non-interactive --force
```

命令只接受 `--dry-run`、`--non-interactive` 和 `--force`。`--dry-run` 只输出配置摘要和计划，不写入文件；`--non-interactive` 跳过交互向导；`--force` 只在目标是未受管普通文件时显式接管，不能绕过 YAML 校验，也不能接管目录、符号链接或其他阻塞路径。

输出目标固定为当前用户目录下的 `~/.config/wezterm/wezterm.lua`（Windows 使用 `HOME` 或 `USERPROFILE` 解析用户目录）。目标缺失时创建，带有 ai-share managed header 的目标可更新，内容相同时保留；未受管文件默认报告 collision 且不写入。WezTerm 会自动重载已加载的配置文件。

在 Windows 或 macOS 上，可检测 AI 开发环境中的受管工具：

```sh
bun run ai:check
bun run ai:help
```

检测部分只检查受管工具是否已安装，不会下载、升级或修改配置，也不会在 Linux 上运行。缺失工具会显示对应平台的 `pnpm`、Scoop 或 Homebrew 安装指令；缺少 Windows 桌面工具时还会提示 Scoop `extras` bucket 的前置指令。

Superpowers 尚未配置时，请执行 `bun run ai:gen`，并在可选插件配置步骤中选择 Superpowers。选择结果写入用户级 OpenCode 配置，不会修改当前仓库配置。

当 OpenCode CLI 和 OpenSpec 均已安装、但当前项目尚未初始化 OpenSpec 时，检测结果会提示执行 `openspec init`。如果 OpenSpec 尚未安装但 OpenCode CLI 已安装，检测结果会同时给出 OpenSpec 安装指令和安装完成后的 `openspec init` 配置指令。
如果 Superpowers 和 OpenSpec 均已安装，但 OpenSpec 配置文件中尚未包含 `superpowers`，检测结果会提示在 OpenSpec 配置中启用 Superpowers 集成。

生成完成后使用 `aioc` 启动；直接运行 `opencode` 也可使用相同配置，但不会加载 ai-share managed `.env` 中的代理变量。

## 配置源

| 文件                   | 用途                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| `config/global.yaml`   | 默认 `model`、`provider` 与 OpenCode 最低版本                      |
| `config/provider.yaml` | Provider endpoint、API Key 引用、关联模型、默认模型与原生模式      |
| `config/models.yaml`   | 上游 `model_name` 与可选 `reasoning_effort`                        |
| `config/mcp.yaml`      | stdio 或 HTTP MCP server                                           |
| `config/env.yaml`      | `aioc` 注入的共享非密钥环境变量                                    |
| `config/agents.yaml`   | OpenCode custom agent、模型、mode、prompt 与 reasoning 覆盖        |
| `config/plugins.yaml`  | OpenCode plugins；基础配置为空数组，可由本机 overlay 整体替换      |
| `config/wezterm.yaml`  | `ai:config` 的 shell、主题、字体、透明度、启动窗口与滚动回溯默认值 |

固定对象拒绝未知字段。API Key 只能写成 `${ENV_NAME}` 引用；生成的 OpenCode 配置会转换为 `{env:ENV_NAME}`，不会读取或持久化真实值。

插件仅接受 npm package spec 或 `package-name@git+https://...`；拒绝 URL 凭据、query/hash、`file://`、本机路径和明文 secret。`ai:explain` 只展示 package ID，生成配置保留完整且已验证的 spec。

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

交互终端未传 `--provider` 时显示 Provider 菜单。生成配置只物化当前选中的 Provider，并且只注册和检查该
Provider 在 `provider.yaml` 中关联的模型。选择 `global.provider` 时使用 `global.model`；选择其他 Provider
时使用其 `default_model`。

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

JSON 接口当前为 `schema_version: 4`。报告只包含来源、env 名称、启用的插件 ID、memory 决策和 plan metadata，不包含 env 值、生成内容或凭据。未受管 collision 返回 `1`；`--force` 仅模拟显式接管。

## Custom agent

`config/agents.yaml` 中的 agents 直接生成到 `opencode.jsonc` 的 `agent` 对象。默认 `ai-share-commit-operator` 是 `subagent`，使用 opencode 内置免费模型 `opencode/deepseek-v4-flash-free`；只有用户明确要求提交、推送或提交并推送时才应委派给它。agent 的 `model` 可引用 `models.yaml` 的 model id（输出为 `provider/model`），也可直接写完整的 `provider/model` 引用（如内置模型）。

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

WezTerm 配置字段、可选值和默认值见 [`docs/schema/wezterm.md`](docs/schema/wezterm.md)。

## 诊断与质量门禁

```sh
bun run ai:check
bun run ai:check -- --online
bun run ai:check -- --canary --json
bun run ai:help
bun run provider:check -- --provider codexapis
bun run check
```

`ai:check` 默认检查 OpenCode 版本、配置漂移、managed env、`aioc`、本地代理、memory 和 API Key env 是否存在；只有 `--online`/`--canary` 访问 Provider。`ai:help` 只输出当前已安装工具的使用提示。完整 `check` 包含 format、lint、typecheck、tests、schema、memory、skill 和配置检查。
