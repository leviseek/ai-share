# Templates And Overlays

`ai-share` 当前使用 `config/*.yaml` 作为已展开的个人配置源。为了未来团队化和跨设备复用，配置分成两类：

- **shareable base**：可以公开或团队共享的模型角色、profile 语义、schema、生成逻辑。
- **personal overlay**：个人 provider 选择、API key 环境变量名、默认 profile、私有 memory 和本机路径。

## Current Contract

```text
templates/shareable/config/    # 可复制到新环境的最小模板，不直接参与生成
templates/personal-overlay/    # 个人 overlay 说明，不提交真实本地密钥
config/*.yaml                  # 当前实际生成源，等价于 base + personal overlay 的已展开结果
config/local/                  # 未来本机 overlay，默认 git ignored
```

## Future Merge Order

后续如接入自动 merge，顺序应为：

```text
templates/shareable/config/*.yaml
  -> config/*.yaml
  -> config/local/*.yaml
```

约束：

- `models.yaml` 和 `profiles.yaml` 优先保持 shareable。
- `provider.yaml` 只能存 env-var references，不能存真实 key。
- `env.yaml` 只能存非密钥运行时变量，例如本地代理默认值；真实 token、cookie、password 不进入模板或 Git。
- `profile-eval.yaml` 可以存通用 benchmark prompts 和 scoring dimensions，不能包含私有项目、客户或本机细节。
- `global.yaml` 的 `default_profile` 属于 personal overlay。
- `memory/user/`、`memory/stable/` 属于个人上下文；团队导出时默认排除。
- `config/local/` 只允许本机覆盖，不进入 Git。

## Template Usage

新环境可以从 `templates/shareable/config/` 复制最小配置，再按个人 provider 和 profile 偏好补齐 `config/*.yaml`。

```sh
Copy-Item -Recurse templates\shareable\config config-template
```

这些模板是 onboarding 起点，不是当前生成器输入。
