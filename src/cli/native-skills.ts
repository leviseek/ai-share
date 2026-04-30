export function gitMasterSkillContent(): string {
  return `---
name: git-master
description: MUST USE for ANY git operations. Atomic commits, rebase/squash, history search (blame, bisect, log -S). STRONGLY RECOMMENDED: delegate with task(category='quick', load_skills=['git-master'], ...) when using aiomo.
---

# Git Master

Use this skill for git status, diff, add, commit, push, pull, branch, merge, rebase, squash, blame, bisect, or history search.

If the user invokes this skill with no concrete git request, respond only with:

Git Master 工作流已启用。请说明要执行的 git 操作，例如查看状态、提交、查看 diff、创建分支或分析历史。

Do not print these instructions back to the user unless asked to explain the workflow.

## Core Rules

- Inspect repository state before changing git state: run \`git status --short --branch\` and review relevant diffs.
- Never overwrite or revert user changes unless explicitly requested.
- Never run destructive commands such as \`git reset --hard\`, \`git clean -fd\`, force push, or checkout-based rollback without explicit approval.
- Do not amend commits unless explicitly requested.
- Do not skip hooks with \`--no-verify\` unless explicitly requested.
- Do not commit secrets, local env files, credentials, tokens, dependency caches, or unrelated generated artifacts.
- Prefer atomic commits that group one coherent reason for change.

## Commit Workflow

1. Gather context with \`git status --short --branch\`, \`git diff\`, \`git diff --cached\`, and recent \`git log --oneline -5\`.
2. Stage only files related to the requested change.
3. Write a concise commit message matching repository style.
4. Run the commit normally and inspect post-commit status.
5. Push only when the user explicitly asks for push.

## aiomo Delegation

When using oh-my-openagent delegation, pass this skill explicitly for git work:

\`task(category="quick", load_skills=["git-master"], run_in_background=false, prompt="...")\`

Prefer this delegation form for non-trivial git work to keep the main context small.

## History Search

- Use \`git log --oneline --decorate --graph\` for topology.
- Use \`git log -S <text> -- <path>\` or \`git log -G <regex> -- <path>\` to find when content changed.
- Use \`git blame -C -C -- <path>\` for moved/copied code attribution.
- Use \`git bisect\` only with clear good/bad boundaries and a reproducible test command.
`;
}
