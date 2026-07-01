---
name: memory-curator
description: Use when organizing, reviewing, deduplicating, proposing updates to, or migrating ai-share memory files under memory/; use for memory governance, long-term knowledge capture, and deciding whether facts belong in stable, user, architecture, policies, inferred, or distilled layers.
---

# Memory Curator

Use this skill to classify, review, deduplicate, and propose updates for ai-share memory files.

## Rules

- Read `memory/policies/memory-lifecycle.md` and `memory/policies/ai-execution-contract.md` before proposing durable memory changes.
- Treat `memory/stable/` and `memory/distilled/` as human-confirmed layers; propose patches, but do not write durable facts without explicit user approval.
- Put AI guesses in `memory/inferred/` unless the user explicitly confirms the fact.
- Prefer references over repeated rules. If a rule already exists in a policy file, point to it instead of duplicating it.
- Never preserve real secrets, tokens, cookies, private credentials, or unredacted production data.

## Workflow

1. Identify the memory layer that matches the information.
2. Check for existing equivalent rules or conflicting facts.
3. Decide whether to keep, merge, move, rewrite, or reject the candidate memory.
4. Produce a concise proposal with target path, rationale, and validation commands.
5. Run or recommend `bun run memory:lint` and `bun run memory:check` after changes.

## Trigger Examples

- "把这段会话沉淀成长期 memory。"
- "检查 memory 里有没有重复、冲突或过时规则。"
- "这条偏好应该放到 stable、user、inferred 还是 distilled？"

## Anti Examples

- "解释一下这段 TypeScript 为什么报错。"
- "帮我提交当前改动。"
- "写一个新的 React 组件。"

## Output

List findings first, then provide proposed target paths and replacement wording. Mark uncertain facts as needing user confirmation.
