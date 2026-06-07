---
name: context-compiler
description: Use when compiling long sessions, issues, logs, PRs, web research, or notes into a compact, auditable context brief.
---

# Context Compiler

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
7. **Discarded Noise**: categories of details intentionally omitted.

## Trigger Examples

- "把这段长会话压缩成可接力 brief。"
- "整理这些 issue 评论为执行上下文。"
- "从日志中提取后续 agent 需要的事实。"

## Anti Examples

- "直接修复这个测试失败。"
- "新增一个 CLI 命令。"
- "选择应该使用哪个依赖包。"
