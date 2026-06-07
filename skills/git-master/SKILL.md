---
name: git-master
description: Use for git status, diff, staging, commit, push, pull, branch, merge, rebase, blame, bisect, or history search.
---

# Git Master

Use this skill for git operations and repository history analysis.

## Rules

- Inspect repository state before changing git state: run `git status --short --branch` and review relevant diffs.
- Never overwrite or revert user changes unless explicitly requested.
- Never run destructive commands such as `git reset --hard`, `git clean -fd`, or force push without explicit approval.
- Do not amend commits unless explicitly requested.
- Do not skip hooks with `--no-verify` unless explicitly requested.
- Do not commit secrets, local env files, credentials, tokens, dependency caches, generated artifacts, or unrelated changes.
- Prefer atomic commits that group one coherent reason for change.

## Workflow

1. Gather context with `git status --short --branch`, `git diff`, `git diff --cached`, and recent `git log --oneline -5`.
2. Stage only files related to the requested change.
3. Write a concise commit message matching repository style.
4. Run the commit normally and inspect post-commit status.
5. Push only when the user explicitly asks for push.

## Trigger Examples

- "查看当前 git 状态和未提交 diff。"
- "把这批相关改动提交成一个 commit。"
- "检查最近几次提交历史。"

## Anti Examples

- "实现这个 TypeScript 功能。"
- "解释这个配置字段含义。"
- "生成一张界面 mockup。"
