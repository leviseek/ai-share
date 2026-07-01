# profile-eval.yaml

Profile evaluation task-set source. `bun run profile:eval` uses this file when no custom `--task` is supplied.

## Top-Level Fields

| Field      | Type   | Required | Notes                                      |
| ---------- | ------ | -------- | ------------------------------------------ |
| `task_set` | string | no       | Human-readable task-set id, default style. |
| `tasks`    | object | no       | Map of task id to task definition.         |
| `scoring`  | object | no       | Manual scoring threshold and dimensions.   |

## Task Fields

| Field              | Type     | Required | Notes                                |
| ------------------ | -------- | -------- | ------------------------------------ |
| `prompt`           | string   | yes      | Prompt executed by `codex`.          |
| `title`            | string   | no       | Human-readable task title.           |
| `category`         | string   | no       | Category used for comparison.        |
| `weight`           | number   | no       | Positive weight for aggregate score. |
| `success_criteria` | string[] | no       | Manual scoring checklist.            |

## Runtime Behavior

- `bun run profile:eval` defaults to every task in this file.
- `--tasks id1,id2` selects a fixed subset.
- `--task "..."` runs one custom task and does not use the fixed task catalog.
- Reports use `ai-share/profile-eval/v2` and include per-run manual score fields plus profile-level weighted summaries.
