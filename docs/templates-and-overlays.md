# Templates And Overlays

`ai-share` 提供两类示例：

```text
templates/shareable/config/                 # 可复制的完整最小配置
templates/personal-overlay/env.local.example.yaml
config/*.yaml                               # 仓库权威源
config/local/*.yaml                         # ignored 本机 overlay
```

## Merge Contract

实际生成只读取 `config/`：

```text
config/<name>.yaml
→ deep merge config/local/<name>.yaml（若存在）
→ 同一套严格解析、schema、跨文件和 secret 校验
```

object 递归合并，数组与标量由 overlay 整体替换。overlay 不能绕过未知字段、HTTPS Provider、MCP transport 或 secret 规则。

## Shareable Template

`templates/shareable/config/` 包含 `global.yaml`、`provider.yaml`、`models.yaml`、`mcp.yaml`、`env.yaml`、`agents.yaml`、`plugins.yaml` 和 `tools.yaml`，并在测试中经过与主配置完全相同的 loader、validation 和 OpenCode builder pipeline。`tools.yaml` 是全局 AI coding 工具的可复制声明模板；它声明工具包、安装后 executable、版本、必选性和平台 manager，不声明任意命令、路径或凭据。`agents.yaml` 可使用 `agents: {}`，`plugins.yaml` 可使用 `plugins: []`，但二者仍是 pipeline 的必需输入文件。需要在本机启用插件时，可由 `config/local/plugins.yaml` 的 `plugins` 数组整体替换基础空数组。

需要为本机替换全局工具集合时，在 ignored 的 `config/local/tools.yaml` 中提供完整的 `tools` 数组。该数组会整体替换 `config/tools.yaml` 的 base 数组，不与 base 数组追加或逐项合并；overlay 仍必须通过 schema 和 secret 校验。

```yaml
tools:
  - id: typescript
    label: TypeScript
    package: typescript
    executable: tsc
    required: false
    version: latest
    platforms:
      win32: { manager: bun }
      darwin: { manager: bun }
      linux: { manager: bun }
```

```powershell
Copy-Item -Recurse templates/shareable/config config-template
```

模板和本机 overlay 示例不得包含真实 API key、token、cookie、私有 endpoint、客户名称、本机绝对路径或任意命令。工具安装只由受控的 `manager`、`package` 和 `version` 推导。

## Personal Overlay

本机代理示例复制到 ignored 路径：

```powershell
New-Item -ItemType Directory -Force config/local | Out-Null
Copy-Item templates/personal-overlay/env.local.example.yaml config/local/env.yaml
```

`config/local/` 不提交。API Key 仍由系统环境变量提供，不得写进 overlay。临时 Provider 使用 `--provider` 或 `AI_SHARE_PROVIDER`，不需要维护 Provider group。
