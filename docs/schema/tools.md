# config/tools.yaml Schema

`tools.yaml` 是全局 AI coding 工具的唯一声明源。当前 base 配置包含 OpenCode CLI、OpenCode Desktop、OpenSpec、CodeGraph、TypeScript 和 TypeScript Language Server。每个条目只声明工具身份、package、安装后命令 basename、版本、必选性和平台安装 manager，不包含命令、脚本、路径、环境变量或凭据。

| Field                                  | Type                                            | Required | Description                                  |
| -------------------------------------- | ----------------------------------------------- | -------- | -------------------------------------------- |
| `tools`                                | array                                           | yes      | 工具来源列表；数组元素的 `id` 必须唯一       |
| `tools[].id`                           | config id                                       | yes      | 稳定工具标识                                 |
| `tools[].label`                        | non-empty string                                | yes      | 人类可读名称                                 |
| `tools[].package`                      | safe npm package id                             | yes      | 裸 package 或 scoped package ID              |
| `tools[].executable`                   | non-empty string                                | yes      | 安装后的命令 basename；当前流程不通过它探测  |
| `tools[].required`                     | boolean                                         | yes      | 是否为全局环境必需工具                       |
| `tools[].version`                      | `latest`, exact semver, `^semver`, or `~semver` | yes      | 受控版本形式                                 |
| `tools[].platforms`                    | object                                          | yes      | 至少一个 `win32`、`darwin`、`linux` 平台配置 |
| `tools[].platforms.<platform>.manager` | `bun`, `scoop`, or `brew`                       | yes      | 安装后端；当前平台缺失映射时跳过该工具       |

JSON Schema 负责字段形状、枚举、非空字符串和安全 package/version pattern；运行时 validator 补充工具 ID 唯一性和 secret token 防护。完整规则以 [generated schema](json/tools.schema.json)、[`schema-spec.ts`](../../src/config/schema-spec.ts) 和 [`tools.ts` validator](../../src/config/validators/tools.ts) 为准，本文不复制会漂移的 JSON Schema pattern。

## 安装推导

- `package` 是当前全局包检测和安装使用的标识，`executable` 仅记录安装后的命令 basename；当前流程不通过 `executable` 探测命令。二者不要求相同，例如 `typescript` 对应 `tsc`，`opencode-ai` 对应 `opencode`。
- `manager: bun` 推导为 `bun install --global <package>@<version>`。
- `manager: scoop` 推导为 `scoop install <package>`；升级时使用 `scoop update <package>`，必要时保留已检测到的 `--global` 状态。Windows 首次使用 Scoop extras 工具时可能先提示 `scoop bucket add extras`。
- `manager: brew` 推导为 `brew install --cask <package>`；升级时使用 `brew upgrade --cask <package>`。
- 只处理当前平台存在的映射。没有当前平台映射的工具不会展示为缺失，也不会生成安装 hint。

## 边界与安全

全局工具由 `ai:check` 调用 [`src/cli/ai-install.ts`](../../src/cli/ai-install.ts) 做检测并输出安装 hint，也可直接运行 `bun run ./src/cli/ai-install.ts`；当前流程只输出提示，不自动执行安装。`ai:gen` 第一轮只管理 OpenCode plugin、agents 和 native skills，不消费 `tools.yaml`，也不把 TypeScript 或 TypeScript Language Server 放入生成菜单。`plugins.yaml` 仍只表达 OpenCode plugins，Superpowers 仍由 plugin 配置和 `ai:gen` 管理。项目 `package.json` 的 `devDependencies` 与设备级全局工具可以并存，二者用途不同。

`config/local/tools.yaml` 的 `tools` 数组整体替换 base 数组，不是追加或逐项合并。工具配置不得写入 secret、token、cookie、环境变量、本机绝对路径或任意 shell 命令；修改 YAML 后应通过 `bun run schema:check` 和项目配置检查。
