# config/plugins.yaml Schema

`plugins.yaml` 声明写入 OpenCode `opencode.jsonc` 的插件安装 spec。

| Field       | Type                   | Required | Description                                      |
| ----------- | ---------------------- | -------- | ------------------------------------------------ |
| `plugins`   | array                  | yes      | 有序插件列表；空列表不会生成 OpenCode `plugin`   |
| `plugins[]` | safe npm package spec  | no       | package ID，可带安全 dist-tag 或受限 semver      |
| `plugins[]` | named `git+https` spec | no       | `package-name@git+https://...`，仅允许 HTTPS URL |

```yaml
plugins:
  - opencode-example@1.2.3
  - "@scope/opencode-example@next"
  - superpowers@git+https://github.com/obra/superpowers.git
```

JSON Schema 的 item `pattern` 只允许裸 package ID、字母开头的 dist-tag、精确 `x.y.z`（可带合法 prerelease）、`^x.y.z`、`~x.y.z` 和 named `git+https`。不支持空白、比较运算符、`||` 或其他通用 semver range。该 pattern 同时拒绝 URL userinfo、query、hash、`file://` 和本机路径。URL 解析和全字符串 secret token 扫描属于运行时语义校验，因为 JSON Schema 正则不负责完整表达这些安全判断。

`ai:explain` 只显示 package ID，不显示 version、git URL 或路径；生成的 OpenCode 配置保留完整且已验证的 spec。
