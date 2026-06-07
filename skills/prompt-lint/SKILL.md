---
name: prompt-lint
description: Use when reviewing prompts, agents, skills, instructions, or memory files for conflicts, vagueness, unsafe rules, or drift.
---

# Prompt Lint

Use this skill to review prompts, agent definitions, skills, instruction files, and memory files.

## Check For

- Conflicts with higher-priority user/system/developer instructions.
- Rules that are impossible to verify or too vague to execute.
- Hidden policy changes embedded in prose.
- Duplicate instructions that increase context without changing behavior.
- Secret-handling mistakes or prompts that ask models to expose private data.
- Stale references to removed tooling, paths, commands, profiles, or runtime behavior.

## Output

List findings first, ordered by severity. Include exact file paths and suggested replacement wording when practical.

## Trigger Examples

- "检查这个 prompt 是否有冲突规则。"
- "review 新 skill 的说明是否含糊。"
- "找出 AGENTS.md 中可能过时的工具引用。"

## Anti Examples

- "实现配置生成器功能。"
- "运行 git commit。"
- "把调试记录沉淀成 distilled memory。"
