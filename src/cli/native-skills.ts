export type NativeSkill = {
  name: string;
  content: string;
};

export const NATIVE_SKILLS: NativeSkill[] = [
  skill(
    "git-master",
    "Use for git status, diff, staging, commit, push, pull, branch, merge, rebase, blame, bisect, or history search.",
    `# Git Master

Use this skill for git operations and repository history analysis.

## Rules

- Inspect repository state before changing git state: run \`git status --short --branch\` and review relevant diffs.
- Never overwrite or revert user changes unless explicitly requested.
- Never run destructive commands such as \`git reset --hard\`, \`git clean -fd\`, or force push without explicit approval.
- Do not amend commits unless explicitly requested.
- Do not skip hooks with \`--no-verify\` unless explicitly requested.
- Do not commit secrets, local env files, credentials, tokens, dependency caches, generated artifacts, or unrelated changes.
- Prefer atomic commits that group one coherent reason for change.

## Workflow

1. Gather context with \`git status --short --branch\`, \`git diff\`, \`git diff --cached\`, and recent \`git log --oneline -5\`.
2. Stage only files related to the requested change.
3. Write a concise commit message matching repository style.
4. Run the commit normally and inspect post-commit status.
5. Push only when the user explicitly asks for push.`,
  ),
  skill(
    "ai-share-generator",
    "Use when changing config/*.yaml, Codex/OMX builders, generated Codex config, ai:gen, or ai:check behavior.",
    `# AI Share Generator

Use this skill when modifying YAML source files, Codex/OMX config builders, generated Codex config shape, native skills, launchers, or generator CLI behavior.

## Source Of Truth

- \`config/global.yaml\`: default profile and Codex/OMX version requirements.
- \`config/provider.yaml\`: provider definitions and API key env references.
- \`config/models.yaml\`: model catalog and provider groups.
- \`config/profiles.yaml\`: profile role mapping and profile metadata.
- \`config/agents.yaml\`: Codex agent runtime settings, OMX slot/reasoning policy, role mapping, and prompt append rules.
- \`config/mcp.yaml\`: Codex MCP server definitions.
- \`config/env.yaml\`: non-secret Codex .env runtime variables such as local proxy settings.
- \`config/profile-eval.yaml\`: fixed profile evaluation tasks and manual scoring dimensions.

## Implementation Map

- Orchestration: \`src/generate-user-config.ts\`.
- Codex/OMX config: \`src/config/builders/codex.ts\`.
- Codex .env config: \`src/config/builders/env.ts\`.
- Instruction paths: \`src/config/builders/instructions.ts\`.
- Output paths: \`src/cli/paths.ts\`.
- Install behavior: \`src/cli/install.ts\` and \`bin/aiomx*\`.

## Workflow

1. Read the relevant YAML and builder before editing.
2. Make the smallest durable source change; do not patch generated user config as the fix.
3. If schema or behavior changes, update README or project knowledge.
4. Add or update focused tests near the builder/runtime when possible.
5. Run \`bun run ai:check\`, \`bun run ai:gen -- --dry-run\`, and \`bun run check\` for cross-cutting changes.
6. Run \`bun run memory:check\` when touching memory privacy layers or generated instruction sources.

## Safety

- Keep secrets as env-var names only.
- Do not add external runtime dependencies unless Bun/Node APIs cannot meet the need.
- Keep generated config reproducible from repository sources.`,
  ),
  skill(
    "config-profile-tuning",
    "Use when tuning Codex/OMX profiles, model roles, compaction metadata, fallback behavior, or profile tradeoffs.",
    `# Config Profile Tuning

Use this skill when tuning model roles, profile defaults, compaction metadata, fallback chains, or Codex/OMX profile tradeoffs.

## Core Files

- \`config/profiles.yaml\`: profile-level role mapping and profile metadata.
- \`config/models.yaml\`: model group definitions, provider selection, parameters, limits, and fallback chains.
- \`config/agents.yaml\`: agent-to-role mapping, Codex agent runtime settings, and OMX slot/reasoning policy.
- \`config/global.yaml\`: default profile and version requirements.
- \`config/profile-eval.yaml\`: fixed benchmark tasks and scoring dimensions for profile comparison.

## Tuning Principles

- Keep profiles meaningfully different: cheaper profiles should reduce cost/latency; research/max profiles can spend more on reasoning.
- Prefer role names such as \`primary\`, \`reasoning\`, and \`fast\` in agents instead of hard-coded model IDs.
- Keep provider groups explicit so \`--provider-group\` can switch concrete providers without editing profile semantics.
- Document any cost, latency, or quality tradeoff in the relevant YAML comment or README section.

## Verification

1. Run \`bun run ai:check\` after YAML changes.
2. Run \`bun run ai:gen -- --dry-run\` and inspect generated Codex/OMX files.
3. Run \`bun run profile:eval -- --tasks project_analysis --profiles coding,max\` for planned comparison reports.
4. For builder changes, run \`bun run typecheck\` and focused tests under \`src/config/builders/\`.
5. For broad changes, run \`bun run check\`.`,
  ),
  skill(
    "context-compiler",
    "Use when compiling long sessions, issues, logs, PRs, web research, or notes into a compact, auditable context brief.",
    `# Context Compiler

Use this skill when turning long natural-language context into a compact, auditable brief.

## Good Inputs

- Long session transcripts, handoff notes, issue threads, PR discussions, web research, and verbose logs.
- Human-readable docs that can tolerate semantic summarization.

## Preserve Exactly

- File paths, command names, config keys, env var names, model IDs, profile names, exact error messages, and policy constraints.
- Do not summarize secrets; omit them and state that they were omitted.

## Output Template

1. **Goal**: one sentence describing the current objective.
2. **Confirmed Facts**: facts supported by the input, with paths or commands when available.
3. **Decisions**: accepted tradeoffs and why they matter.
4. **Key Files / Commands**: exact names future agents must inspect or run.
5. **Risks / Constraints**: security, type safety, generated-config, platform, or context risks.
6. **Next Actions**: ordered, verifiable steps.
7. **Discarded Noise**: categories of details intentionally omitted.`,
  ),
  skill(
    "memory-curator",
    "Use when organizing, reviewing, deduplicating, proposing updates to, or migrating ai-share memory files under memory/; use for memory governance, long-term knowledge capture, and deciding whether facts belong in stable, user, architecture, policies, profiles, inferred, or distilled layers.",
    `# Memory Curator

Use this skill to classify, review, deduplicate, and propose updates for ai-share memory files.

## Rules

- Read \`memory/policies/memory-lifecycle.md\` and \`memory/policies/ai-execution-contract.md\` before proposing durable memory changes.
- Treat \`memory/stable/\` and \`memory/distilled/\` as human-confirmed layers; propose patches, but do not write durable facts without explicit user approval.
- Put AI guesses in \`memory/inferred/\` unless the user explicitly confirms the fact.
- Prefer references over repeated rules. If a rule already exists in a policy file, point to it instead of duplicating it.
- Never preserve real secrets, tokens, cookies, private credentials, or unredacted production data.

## Workflow

1. Identify the memory layer that matches the information.
2. Check for existing equivalent rules or conflicting facts.
3. Decide whether to keep, merge, move, rewrite, or reject the candidate memory.
4. Produce a concise proposal with target path, rationale, and validation commands.
5. Run or recommend \`bun run memory:lint\` and \`bun run memory:check\` after changes.

## Trigger Examples

- "把这段会话沉淀成长期 memory。"
- "检查 memory 里有没有重复、冲突或过时规则。"
- "这条偏好应该放到 stable、user、inferred 还是 distilled？"

## Anti Examples

- "解释一下这段 TypeScript 为什么报错。"
- "帮我提交当前改动。"
- "写一个新的 React 组件。"

## Output

List findings first, then provide proposed target paths and replacement wording. Mark uncertain facts as needing user confirmation.`,
  ),
  skill(
    "failure-distiller",
    "Use when converting debugging failures, repeated test failures, production incidents, architecture mistakes, or multi-step troubleshooting sessions into reusable distilled knowledge under memory/distilled/; use for extracting root-cause patterns, bad fixes, correct fixes, detection, and prevention.",
    `# Failure Distiller

Use this skill to turn failures into reusable knowledge candidates.

## Rules

- Distill patterns, not transcripts. Do not store raw chat logs, full logs, stack traces, secrets, or unredacted production data.
- Separate confirmed root cause from hypotheses. Put uncertain conclusions behind explicit "needs confirmation" wording.
- Preserve exact file paths, commands, error names, config keys, and tool names that are necessary for future detection.
- Propose \`memory/distilled/\` content only after the lesson is general enough to help future tasks.

## Workflow

1. Summarize the failure in one sentence.
2. Identify the repeating pattern and confirmed root cause.
3. Record bad fixes that were tempting but wrong.
4. Record the smallest correct fix and the validation evidence.
5. Add detection and prevention notes.
6. Recommend a \`memory/distilled/\` target file or explain why the failure should not become durable memory.

## Distillation Template

- **Pattern**: recurring failure shape.
- **Root Cause**: confirmed underlying cause.
- **Bad Fixes**: approaches that hide or worsen the issue.
- **Correct Fix**: minimal durable remedy.
- **Detection**: commands, symptoms, or signals that reveal the issue.
- **Prevention**: rules or checks that reduce recurrence.
- **Evidence**: validation commands, tests, or observed results.

## Trigger Examples

- "把这次调试失败总结成可复用经验。"
- "我们连续三次修错了，提炼一下根因模式。"
- "把这个测试失败的排障过程沉淀到 distilled memory。"

## Anti Examples

- "帮我马上修这个 bug。"
- "整理一篇用户文档。"
- "选择哪个模型更适合写作？"

## Output

Return a candidate distilled entry and clearly mark whether it is ready for human-confirmed memory or still needs review.`,
  ),
  skill(
    "prompt-lint",
    "Use when reviewing prompts, agents, skills, instructions, or memory files for conflicts, vagueness, unsafe rules, or drift.",
    `# Prompt Lint

Use this skill to review prompts, agent definitions, skills, instruction files, and memory files.

## Check For

- Conflicts with higher-priority user/system/developer instructions.
- Rules that are impossible to verify or too vague to execute.
- Hidden policy changes embedded in prose.
- Duplicate instructions that increase context without changing behavior.
- Secret-handling mistakes or prompts that ask models to expose private data.
- Stale references to removed tooling, paths, commands, profiles, or runtime behavior.

## Output

List findings first, ordered by severity. Include exact file paths and suggested replacement wording when practical.`,
  ),
  skill(
    "release-commit",
    "Use when preparing a change batch, changelog notes, verification evidence, or a commit plan.",
    `# Release Commit

Use this skill when preparing final change batches, changelog notes, verification evidence, or commit plans.

## Checklist

- Confirm \`git status --short\` and inspect the diff.
- Group changes by purpose and avoid mixing unrelated work.
- Run the validation commands appropriate to the touched files.
- Summarize behavior changes, validation evidence, residual risks, and rollback path.
- Commit only when explicitly requested by the user.

## Commit Message

Use the repository's commit style from \`GIT_COMMIT_GUIDELINES.md\`.`,
  ),
];

export function nativeSkillNames(): string[] {
  return NATIVE_SKILLS.map((nativeSkill) => nativeSkill.name);
}

function skill(name: string, description: string, body: string): NativeSkill {
  return {
    name,
    content: `---
name: ${name}
description: ${description}
---

${body}
`,
  };
}
