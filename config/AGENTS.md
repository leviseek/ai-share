# config/

## OVERVIEW

严格 YAML 配置源。主配置与可选 `config/local/` overlay 合并后，必须经过同一套 schema、跨文件引用、transport 和 secret 校验。

## WHERE TO LOOK

| Need                                        | File            | Notes                                                                            |
| ------------------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| Default model/provider and OpenCode version | `global.yaml`   | `model`、`provider` 必填                                                         |
| Provider endpoint, models, and default      | `provider.yaml` | 关联模型、默认模型与可选原生模式                                                 |
| Upstream model names                        | `models.yaml`   | 仅 `model_name`，可选 `reasoning_effort`、`attachment`、`modalities`             |
| OpenCode MCP servers                        | `mcp.yaml`      | stdio/HTTP 条件字段严格互斥                                                      |
| Shared `aioc` environment values            | `env.yaml`      | 非密钥；默认 `variables: {}`                                                     |
| Custom agents and model overrides           | `agents.yaml`   | 内联到 `opencode.jsonc` 的 `agent` 对象                                          |
| OpenCode plugins                            | `plugins.yaml`  | 安全 npm spec；默认 `plugins: []`                                                |
| Global AI coding tools                      | `tools.yaml`    | 全局工具唯一声明源；定义 package、executable、版本与平台 manager                 |
| Archify external skill                      | `archify.yaml`  | 固定 repo/ref；由 `ai:archify` 获取到 `~/.agents/skills`，生成器只管理 ownership |
| Machine-local overrides                     | `local/`        | Git ignored，合并后仍严格校验                                                    |

## CONVENTIONS

- YAML 是唯一权威源；不要手改生成的 JSONC、managed `.env`、launcher 或 skill 作为长期修复。
- `global.provider` 是默认 Provider 的唯一权威源。
- Provider 只生成和检查 `models` 中关联的模型；非默认 Provider 使用自己的 `default_model`。
- 固定结构拒绝未知字段；字段规格只在 `../src/config/schema-spec.ts` 定义。
- Provider URL 必须是有效 HTTPS URL，`api_key` 必须是 `${ENV_NAME}` 引用。
- `env.yaml` 及 overlay 不得包含 API key、token、cookie、`HOME`、`USERPROFILE`、`PATH`、`AI_SHARE_*` 或 `OPENCODE_*`。
- Plugin 仅允许 npm package spec 或 `package-name@git+https://...`；拒绝 URL userinfo/query/hash、`file://`、本机路径和 secret literal。
- 本机代理属于 ignored `config/local/env.yaml`，可从 `../templates/personal-overlay/env.local.example.yaml` 复制。
- `tools.yaml` 是全局 AI coding 工具的唯一声明源；`package` 用于当前全局包检测和安装，`executable` 仅记录安装后的命令 basename，二者可以不同。当前流程不通过 `executable` 探测命令。平台安装 manager 只允许 `bun`、`scoop` 或 `brew`；TypeScript 与 TypeScript Language Server 通过 Bun 全局安装。
- `config/local/tools.yaml` 的 `tools` 数组整体替换 base 数组，不追加也不逐项合并。当前平台没有后端映射的工具不会进入检测缺失项或安装提示。
- `archify.yaml` 的 `ref` 必须固定到 commit 或安全 ref；网络获取只由 `ai:archify` 执行，普通 `ai:gen` 不下载外部内容。
- 空集合显式写成 `{}`。

## VALIDATION

```sh
bun run ai:check
bun run schema:check
bun run ai:gen -- --dry-run
```

## ANTI-PATTERNS

- 不恢复 Provider group、fallback、cost、capabilities、limits、parameters 或其他无消费者字段。
- 不把真实密钥或私有凭据写入 YAML、模板、测试或文档。
- `--force` 只接管未受管输出，不能绕过任何配置或 secret 校验。
