# config/agents.yaml Schema

`agents.yaml` 声明写入 OpenCode `opencode.jsonc` 的 custom agents。

| Field                                | Type             | Required | Description                                                                     |
| ------------------------------------ | ---------------- | -------- | ------------------------------------------------------------------------------- |
| `agents.<agent_id>.description`      | non-empty string | yes      | agent 的人类可读说明                                                            |
| `agents.<agent_id>.model`            | string           | no       | `models.yaml` model id，或完整 `provider/model` 引用（输出为 `provider/model`） |
| `agents.<agent_id>.reasoning_effort` | enum             | no       | `low`、`medium` 或 `high`                                                       |
| `agents.<agent_id>.mode`             | enum             | yes      | `primary`、`subagent` 或 `all`                                                  |
| `agents.<agent_id>.prompt`           | non-empty string | yes      | agent 的核心行为和安全边界                                                      |

```yaml
agents:
  ai-share-commit-operator:
    description: ai-share 的提交执行官
    model: opencode/deepseek-v4-flash-free
    mode: subagent
    prompt: Create only the explicitly requested commit.
```
