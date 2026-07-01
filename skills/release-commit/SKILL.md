---
name: release-commit
description: Use when preparing a change batch, changelog notes, verification evidence, or a commit plan.
---

# Release Commit

Use this skill when preparing final change batches, changelog notes, verification evidence, or commit plans.

## Checklist

- Confirm `git status --short` and inspect the diff.
- Group changes by purpose and avoid mixing unrelated work.
- Run the validation commands appropriate to the touched files.
- Summarize behavior changes, validation evidence, residual risks, and rollback path.
- Commit only when explicitly requested by the user.

## Commit Message

Use the repository's commit style from `GIT_COMMIT_GUIDELINES.md`.

## Trigger Examples

- "整理这批改动的提交计划。"
- "生成最终验证证据摘要。"
- "准备 changelog notes 和风险说明。"

## Anti Examples

- "修改默认模型配置。"
- "分析新项目入口。"
- "把 native skills 迁移到源目录。"
