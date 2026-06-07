---
name: failure-distiller
description: Use when converting debugging failures, repeated test failures, production incidents, architecture mistakes, or multi-step troubleshooting sessions into reusable distilled knowledge under memory/distilled/; use for extracting root-cause patterns, bad fixes, correct fixes, detection, and prevention.
---

# Failure Distiller

Use this skill to turn failures into reusable knowledge candidates.

## Rules

- Distill patterns, not transcripts. Do not store raw chat logs, full logs, stack traces, secrets, or unredacted production data.
- Separate confirmed root cause from hypotheses. Put uncertain conclusions behind explicit "needs confirmation" wording.
- Preserve exact file paths, commands, error names, config keys, and tool names that are necessary for future detection.
- Propose `memory/distilled/` content only after the lesson is general enough to help future tasks.
- Follow `memory/distilled/TEMPLATE.md` when outputting a candidate distilled entry.
- Mark unconfirmed output as a candidate and do not write it into `memory/distilled/` until the user explicitly confirms it.

## Workflow

1. Summarize the failure in one sentence.
2. Identify the repeating pattern and confirmed root cause.
3. Record bad fixes that were tempting but wrong.
4. Record the smallest correct fix and the validation evidence.
5. Add detection and prevention notes.
6. Recommend a `memory/distilled/` target file or explain why the failure should not become durable memory.

## Distillation Template

Use `memory/distilled/TEMPLATE.md` as the canonical candidate shape:

- `source`: use `session-distilled` unless a more precise non-secret source label is available.
- `confirmed_by_user`: use `false` for candidates; change to `true` only after explicit user confirmation.
- `created_at` and `review_after`: use concrete `YYYY-MM-DD` dates when proposing durable content.
- `scope` and `confidence`: keep explicit and conservative.
- Sections: `Pattern`, `Root Cause`, `Bad Fixes`, `Correct Fix`, `Detection`, `Prevention`, and `Evidence`.

## Trigger Examples

- "把这次调试失败总结成可复用经验。"
- "我们连续三次修错了，提炼一下根因模式。"
- "把这个测试失败的排障过程沉淀到 distilled memory。"

## Anti Examples

- "帮我马上修这个 bug。"
- "整理一篇用户文档。"
- "选择哪个模型更适合写作？"

## Output

Return a candidate distilled entry and clearly mark whether it is ready for human-confirmed memory or still needs review.
