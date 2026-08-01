# config/agents.yaml Schema

`agents.yaml` 声明由 ai-share 安装到 `CODEX_HOME/agents/` 的用户级 Codex custom agents。

| Field                                      | Type             | Required | Description                           |
| ------------------------------------------ | ---------------- | -------- | ------------------------------------- |
| `agents.<agent_id>.description`            | non-empty string | yes      | Codex 选择 agent 时使用的人类可读说明 |
| `agents.<agent_id>.model`                  | model id         | no       | 引用 `models.yaml` 并解析为上游模型名 |
| `agents.<agent_id>.reasoning_effort`       | enum             | no       | `low`、`medium` 或 `high`             |
| `agents.<agent_id>.developer_instructions` | non-empty string | yes      | agent 的核心行为和安全边界            |

agent id 同时生成官方 `name` 字段和 `<agent_id>.toml` 文件名。未声明 model 或 reasoning effort 时，Codex 按自定义 agent 的继承规则使用父会话配置。

```yaml
agents:
  commit:
    description: Git commit specialist
    model: gpt-5.5
    reasoning_effort: low
    developer_instructions: Create only the explicitly requested commit.
```
