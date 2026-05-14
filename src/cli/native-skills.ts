export type NativeSkill = {
  name: string;
  content: string;
};

export const NATIVE_SKILLS: NativeSkill[] = [
  skill(
    "git-master",
    "MUST USE for ANY git operations. Atomic commits, rebase/squash, history search (blame, bisect, log -S). STRONGLY RECOMMENDED: delegate with task(category='quick', load_skills=['git-master'], ...) when using aiomo.",
    `# Git Master

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
- Use \`git bisect\` only with clear good/bad boundaries and a reproducible test command.`,
  ),
  skill(
    "context-guard",
    "Use when diagnosing aiomo context guard, watch/rescue/handoff behavior, session risk, alert/history files, or oversized OpenCode sessions.",
    `# Context Guard

Use this skill for aiomo context guard checks, watcher lifecycle debugging, rescue/handoff generation, session risk analysis, and interpreting \`.opencode/context-guard-*\` files.

## Scope

- \`aiomo\` uses context guard for resume checks and per-session watch lifecycle.
- \`aioc\` is native OpenCode Build/Plan mode and does not enable context guard circuit breaking.
- Runtime implementation lives in \`src/context-guard/\`; installed entrypoint is \`opencode-context-guard.ts\`.
- Durable defaults are in \`config/global.yaml\` under \`context_guard\` and profile budgets come from \`config/profiles.yaml\` compaction settings.

## Read First

1. Read \`src/context-guard/cli.ts\` for command shape.
2. Read \`src/context-guard/check.ts\`, \`watch.ts\`, \`rescue.ts\`, or \`handoff.ts\` based on the issue.
3. Read \`bin/aiomo\`, \`bin/aiomo.ps1\`, and \`bin/opencode-launcher-common.*\` for launcher lifecycle.
4. Check local files only when relevant: \`.opencode/context-guard-alert.json\`, \`.opencode/context-guard-history/\`, and \`.opencode-rescue/\`.

## Commands

- Validate config/generator consistency: \`bun run ai:check\`.
- Preview install output: \`bun run ai:gen -- --dry-run\`.
- Run focused tests: \`bun test src/context-guard/check.test.ts src/context-guard/watch.test.ts\`.
- Full verification after behavior changes: \`bun run check\`.

## Rules

- Do not hand-edit generated user config as the durable fix; change YAML or source code.
- Do not weaken risk thresholds just to bypass a blocked session.
- Prefer \`aiomo rescue <session-id>\` or \`aiomo handoff <session-id>\` over forced resume for oversized sessions.
- Never include secrets or full session logs in summaries; keep only paths, session IDs, token diagnostics, and recommended commands.`,
  ),
  skill(
    "ai-share-generator",
    "Use when changing config/*.yaml, generated OpenCode/OMO config, provider/model/profile builders, or ai:gen/ai:check behavior.",
    `# AI Share Generator

Use this skill when modifying YAML source-of-truth files, generated OpenCode/OMO config shape, provider/model/profile builders, or generator CLI behavior.

## Source Of Truth

- \`config/global.yaml\`: shared plugin policy, proxy, workspace ignores, context guard, DCP/checkpoint/memory defaults.
- \`config/provider.yaml\`: provider definitions and API key env references.
- \`config/models.yaml\`: model catalog and provider groups.
- \`config/profiles.yaml\`: profile role mapping, compaction budgets, profile strategy overrides.
- \`config/agents.yaml\`: OMO agents/categories/runtime fallback/background task settings.

## Implementation Map

- Orchestration: \`src/generate-user-config.ts\`.
- OpenCode/aioc config: \`src/config/builders/opencode.ts\`.
- OMO config: \`src/config/builders/omo.ts\`.
- Strategy sidecars: \`src/config/builders/strategy.ts\`.
- Context guard sidecars: \`src/config/builders/context-guard.ts\`.
- Install behavior: \`src/cli/install.ts\` and \`bin/\`.

## Workflow

1. Read the relevant YAML and builder before editing.
2. Make the smallest durable source change; do not patch generated JSON in \`~/.config/opencode\`.
3. If schema or behavior changes, update README or project knowledge where user-facing.
4. Add or update focused tests near the builder/runtime if possible.
5. Run \`bun run ai:check\`, \`bun run ai:gen -- --dry-run\`, and \`bun run check\` for cross-cutting changes.

## Safety

- Keep secrets as \`{env:VAR}\` or env-var names only.
- Do not add unknown optional plugins without verifying package/path, maintenance, permissions, and need.
- Keep \`aioc\` native/lightweight unless the user explicitly requests otherwise.`,
  ),
  skill(
    "install-doctor",
    "Use when diagnosing aiomo doctor install, aioc doctor install, launcher installation, PATH, plugin install, native skills install, or generated user config health.",
    `# Install Doctor

Use this skill for \`aiomo doctor install\`, \`aioc doctor install\`, launcher installation, PATH issues, local plugin install, native skills install, and generated user config health checks.

## Where To Inspect

- Doctor implementation: \`bin/opencode-install-doctor.ts\`.
- Launcher installation: \`src/cli/install.ts\`.
- Path targets: \`src/cli/paths.ts\`.
- Generated config source: \`src/generate-user-config.ts\`.
- Launcher scripts: \`bin/aiomo*\`, \`bin/aioc*\`, \`bin/opencode-launcher-common.*\`.

## Diagnosis Flow

1. Run \`bun run ai:check\` to validate source config.
2. Run \`bun run ai:gen -- --dry-run\` to inspect intended writes and installs.
3. If user config is stale, run \`bun run ai:gen -- --force\` only when overwriting generated user config is intended.
4. Run \`aiomo doctor install\` or \`aioc doctor install\` in the target shell.
5. Interpret \`FAIL\` as missing or mismatched required artifacts; interpret \`WARN\` as environment/path/runtime caveats.

## Mode Expectations

- \`aiomo doctor install\` should expect OMO plugin, monitor plugin, OMO sidecars, strategy sidecar, context guard profile, launchers, and all native skills.
- \`aioc doctor install\` should expect native OpenCode profile and absence of OMO/monitor plugins in active config.

## Rules

- Do not edit installed artifacts directly as a durable fix.
- Preserve Windows and POSIX launcher parity.
- Keep doctor output actionable with exact missing paths or config items.

## Report Template

When summarizing doctor results, use this shape:

1. **Root Cause**: the most likely missing or stale artifact.
2. **Evidence**: exact \`FAIL\` / \`WARN\` labels and paths.
3. **Fix**: the smallest command or source change, usually \`bun run ai:gen -- --force\` after source config is valid.
4. **Verify**: rerun \`aiomo doctor install\` or \`aioc doctor install\` in the target shell.

Prefer one concrete fix path over broad shell advice.`,
  ),
  skill(
    "config-profile-tuning",
    "Use when tuning OMO profiles, model roles, compaction thresholds, context budgets, fallback behavior, or aiomo profile tradeoffs.",
    `# Config Profile Tuning

Use this skill when tuning profiles, model roles, compaction thresholds, context budgets, fallback behavior, or aiomo profile tradeoffs.

## Core Files

- \`config/profiles.yaml\`: profile-level role mapping and strategy/compaction overrides.
- \`config/models.yaml\`: model group definitions and provider selection.
- \`config/agents.yaml\`: OMO agents/categories and fallback/concurrency settings.
- \`config/global.yaml\`: default profile, shared context, plugins, and global guard defaults.

## Tuning Principles

- Keep profiles meaningfully different: cheaper profiles should reduce cost/latency; research/max can spend more on reasoning.
- Prefer role names such as \`primary\`, \`reasoning\`, and \`fast\` in agents/categories instead of hard-coded model IDs.
- Align compaction \`max_input_tokens\` with context guard budgets so launchers warn before sessions become risky.
- Keep \`aioc\` native/lightweight; use \`aiomo\` for orchestration-heavy workflows.

## P0 Review Checklist

Before changing a profile, record the intended tradeoff:

- Cost: expected provider/model spend and whether \`fast\` can handle search/summary work.
- Latency: whether background concurrency and fallback behavior match the profile purpose.
- Context: \`threshold\`, \`reserved\`, \`max_input_tokens\`, DCP budget, checkpoint count, and context guard ratios.
- Mode split: whether \`aioc\` remains native while \`aiomo\` carries orchestration-heavy plugins and sidecars.
- Fallback: whether provider fallback preserves the role intent instead of silently upgrading cheap profiles.

## Verification

1. Run \`bun run ai:check\` after YAML changes.
2. Run \`bun run ai:gen -- --dry-run\` and inspect generated \`opencode.json\`, \`oh-my-openagent.json\`, \`strategy.json\`, and context guard profiles.
3. For builder changes, run \`bun run typecheck\` and focused tests under \`src/config/builders/\`.
4. For broad changes, run \`bun run check\`.

## Avoid

- Do not duplicate the same setting across profiles if a global default is enough.
- Do not lower budgets just to hide slowdowns; explain cost/latency tradeoffs.
- Do not put real keys, local endpoints, or secrets in YAML.`,
  ),
  skill(
    "context-compiler",
    "Use when compiling long sessions, issues, logs, PRs, web research, or rescue output into a compact, auditable context brief.",
    `# Context Compiler

Use this skill when turning long natural-language context into a compact, auditable brief for aiomo/aioc work.

## Good Inputs

- Long session transcripts, handoff notes, rescue summaries, issue threads, PR discussions, web research, and verbose logs.
- Human-readable docs that can tolerate semantic summarization.

## Do Not Compress Blindly

- Do not compress \`AI_GUIDELINES.md\`, system/developer instructions, tool rules, permission policies, secrets policy, code diffs, YAML config, shell commands, or exact error messages by deleting tokens.
- Preserve exact file paths, command names, config keys, env var names, model IDs, profile names, and quoted errors.

## Output Template

Produce this structure:

1. **Goal**: one sentence describing the current objective.
2. **Confirmed Facts**: only facts supported by the input, with paths or commands when available.
3. **Decisions**: accepted tradeoffs and why they matter.
4. **Key Files / Commands**: exact names that future agents must inspect or run.
5. **Risks / Constraints**: security, type safety, generated-config, platform, or context risks.
6. **Next Actions**: ordered, verifiable steps.
7. **Discarded Noise**: categories of details intentionally omitted.

## Rules

- Prefer extractive wording for constraints and commands.
- Mark uncertain items as \`Unverified\`; do not turn guesses into facts.
- Keep summaries local and do not include secrets, tokens, cookies, or full private logs.
- For ai-share work, map the brief back to \`config/*.yaml\`, \`src/\`, \`bin/\`, \`plugins/\`, \`memory/\`, or \`AI_GUIDELINES.md\` whenever possible.`,
  ),
  skill(
    "config-diff-auditor",
    "Use after config/*.yaml, generator, plugin, launcher, profile, or native skill changes to audit generated output impact before install.",
    `# Config Diff Auditor

Use this skill to audit how source changes affect generated OpenCode, aioc, OMO, strategy, proxy, context-guard, plugin, launcher, and native-skill outputs.

## Source Of Truth

- Durable changes belong in \`config/*.yaml\`, \`src/\`, \`bin/\`, \`plugins/\`, \`memory/\`, or \`AI_GUIDELINES.md\`.
- Do not treat generated files under \`~/.config/opencode/\` as source.

## Audit Flow

1. Run \`bun run ai:check\` to validate source config and generator consistency.
2. Run \`bun run ai:gen -- --dry-run\` to preview writes and installed artifacts.
3. Inspect whether aiomo and aioc outputs differ intentionally: plugins, OMO sidecars, strategy sidecars, context guard profiles, and native skills.
4. Confirm added skills appear as \`~/.config/opencode/skills/<name>/SKILL.md\` in dry-run output.
5. If plugin arrays changed, verify \`aioc\` excludes OMO-only plugins while preserving shared safe plugins.

## Report Template

- **Expected Impact**: source files changed and intended generated outputs.
- **Unexpected Impact**: any extra profile, plugin, sidecar, launcher, or skill drift.
- **Mode Split**: aiomo-only vs aioc-native behavior.
- **Verification**: commands run and pass/fail summary.

## Avoid

- Do not approve a config change only because TypeScript passes.
- Do not ignore dry-run output that changes unrelated profiles or generated plugin lists.
- Do not write real API keys, webhooks, or local private endpoints into YAML.`,
  ),
  skill(
    "prompt-lint",
    "Use when reviewing AI_GUIDELINES.md, agent prompts, native skills, OMO categories, or instruction memory for conflicts and unverifiable rules.",
    `# Prompt Lint

Use this skill to review prompts and instruction files for clarity, safety, consistency, and enforceability.

## Targets

- \`AI_GUIDELINES.md\`, native skills in \`src/cli/native-skills.ts\`, OMO agents/categories in \`config/agents.yaml\`, memory prompt files, and project-level OpenCode instructions.

## Checks

1. Conflict: newer or more specific instructions should not fight project safety rules.
2. Verifiability: rules should name observable actions, files, commands, or outputs.
3. Scope: prompts should say when to use them and when not to use them.
4. Safety: no instruction should encourage secrets exposure, destructive Git, type suppression, deleting tests, or bypassing review gates.
5. Brevity: avoid duplicating large policy documents when a path reference or checklist is enough.
6. Mode split: keep aiomo orchestration and aioc native behavior explicit when relevant.

## Output Template

- **Blocking Issues**: contradictions or unsafe instructions that must be fixed.
- **Ambiguities**: wording likely to cause wrong agent behavior.
- **Redundancy**: repeated policy that can be shortened.
- **Suggested Rewrite**: minimal replacement text.

## Rules

- Preserve exact command names, file paths, and config keys.
- Do not add motivational language or decorative comments.
- Prefer concise trigger-oriented descriptions for skills.`,
  ),
  skill(
    "permission-auditor",
    "Use when auditing OpenCode/OMO agents, plugins, MCP servers, native skills, hooks, or install scripts for permission and side-effect boundaries.",
    `# Permission Auditor

Use this skill to audit what agents, plugins, MCP servers, hooks, launchers, and install scripts are allowed to read, write, execute, or send externally.

## Inspect

- OpenCode agents and permissions in generated builders and config sources.
- OMO agents/categories in \`config/agents.yaml\`.
- Plugin declarations in \`config/global.yaml\` and local plugin code under \`plugins/\`.
- Native skills in \`src/cli/native-skills.ts\`.
- Launcher and install behavior in \`bin/\` and \`src/cli/install.ts\`.

## Boundary Questions

1. Can it edit files, run shell commands, start background processes, write local state, or access the network?
2. Does aioc need to exclude it to preserve native Build/Plan behavior?
3. Does it inject prompt/context or alter model routing?
4. Does it read secrets only by env-var reference and avoid printing values?
5. Is rollback clear: remove plugin/skill/config entry and regenerate?

## Report Template

- **Component**: exact plugin, agent, skill, MCP, or launcher.
- **Capabilities**: read/write/execute/network/prompt-injection/local-state.
- **Scope**: shared, aiomo-only, aioc-safe, TUI-only, optional, or project-level.
- **Risk**: concrete failure mode.
- **Recommendation**: keep, restrict, make optional, exclude from aioc, or remove.

## Rules

- Default shared plugins should stay minimal.
- Unknown or network-capable components start as optional or project-level, not global defaults.
- Never approve automatic external notifications unless review-before-send remains enforced.`,
  ),
  skill(
    "evidence-pack",
    "Use after implementation to collect structured verification evidence, risks, and rollback notes without staging, committing, or pushing.",
    `# Evidence Pack

Use this skill after implementation to collect structured evidence for delivery when changes affect config generation, install behavior, plugins, skills, launchers, or user-visible workflow.

This skill is not a Git workflow. Do not stage, commit, push, or group commits from this skill; use \`release-commit\` with \`git-master\` for Git release preparation.

## Collect

1. **Scope**: files changed and why they changed.
2. **Behavior**: generated outputs, installed artifacts, profile behavior, or user-facing commands affected.
3. **Verification**: exact commands run, pass/fail result, and focused diagnostics.
4. **Risks**: skipped checks, platform caveats, dependency or permission changes.
5. **Rollback**: smallest revert path or config entry to remove.

## Verification Defaults For ai-share

- Generated config or YAML: \`bun run ai:check\` and \`bun run ai:gen -- --dry-run\`.
- TypeScript/source behavior: \`bun run typecheck\`, \`bun run lint\`, and focused tests when present.
- Broad changes: \`bun run check\`.
- Installed artifacts: \`aiomo doctor install\` / \`aioc doctor install\` after generation.

## Output Template

- **What Changed**: concise bullets with paths.
- **Why**: user goal and design reason.
- **Verified**: commands and results.
- **Risks / Follow-up**: only real remaining concerns.

## Rules

- Do not claim a check passed unless it was run.
- Separate current-change failures from pre-existing failures.
- Do not include secrets, full logs, or unrelated diffs.`,
  ),
  skill(
    "release-commit",
    "Use when grouping Git commits, preparing changelog notes, or doing final verification before pushing ai-share changes.",
    `# Release Commit

Use this skill when grouping Git commits, preparing changelog notes, or doing final verification before pushing ai-share changes.

## Relationship To git-master

- For any actual git command, also use \`git-master\` and follow its safety rules.
- This skill focuses on Git change grouping, release notes, verification, and user-facing summary; it does not replace git safety checks.

## Grouping Rules

- Group commits by reason: config, generator behavior, launcher/runtime, docs, tests.
- Keep generated artifacts, local logs, secrets, dependency caches, and unrelated formatting out of commits.
- Match repository commit style: \`option: 中文描述\`.

## Pre-Commit Verification

1. Run \`bun run check\` for cross-cutting changes.
2. Run \`bun run ai:gen -- --dry-run\` when generated output or install behavior changes.
3. Review \`git status --short --branch\`, \`git diff\`, and staged diff before each commit.
4. Confirm each commit can be explained in one sentence.

## Final Summary

Include:

- Commit hashes and messages.
- Push target if pushed.
- Verification commands and results.
- Any known risk or follow-up.`,
  ),
  skill(
    "plugin-vetting",
    "Use before adding OpenCode, OMO, TUI, or optional plugins; checks source, version pinning, permissions, maintenance, install cost, and aioc/aiomo scope.",
    `# Plugin Vetting

Use this skill before adding OpenCode, OMO, TUI, or optional plugins to shared config.

## Vetting Checklist

1. Identify the exact package name, git URL, local path, or version tag.
2. Check source reputation, license, maintenance activity, and compatibility with current OpenCode/OMO versions.
3. Understand what hooks it uses and whether it injects prompt/context, registers tools, writes files, or starts processes.
4. Decide scope: default shared plugin, optional plugin, project-level plugin, TUI-only plugin, or aiomo-only profile experiment.
5. Decide whether \`aioc\` must exclude it to preserve native Build/Plan behavior.
6. Document install/network/cache risks and rollback path.

## Project Defaults

- Default shared plugins should stay minimal.
- \`aiomo\` can load OMO orchestration and monitor plugins.
- \`aioc\` should remain native/lightweight and exclude OMO-style orchestration or prompt-injecting plugins unless explicitly requested.
- Unknown plugins belong in \`opencode.optional_plugins\` or project-level config first, not global defaults.

## Verification

- Run \`bun run ai:check\`.
- Run \`bun run ai:gen -- --dry-run\` and inspect plugin arrays for both \`profiles/opencode/*.json\` and \`profiles/aioc/*.json\`.
- Run \`aiomo doctor install\` / \`aioc doctor install\` after installation if the plugin is enabled by default.`,
  ),
  skill(
    "skill-creator",
    "Use when creating, editing, reviewing, or installing local native skills for this ai-share repository.",
    `# Skill Creator

Use this skill when creating, editing, reviewing, or installing local native skills for this repository.

## Current Architecture

- Local native skills are generated from \`src/cli/native-skills.ts\`.
- Installation is handled by \`installNativeSkills\` in \`src/cli/install.ts\`.
- Installed target path is \`~/.config/opencode/skills/<skill-name>/SKILL.md\`.
- \`bin/opencode-install-doctor.ts\` should check every generated skill.
- README should list user-facing skills when the set changes.

## Skill Design Rules

1. Give each skill one clear responsibility and a concise trigger-oriented description.
2. Prefer repository-specific paths, commands, and constraints over generic advice.
3. Keep instructions actionable: where to inspect, what commands to run, what to avoid.
4. Do not include secrets, user-specific absolute paths, or generated output snapshots.
5. Avoid duplicating large policy documents; link behavior to \`AI_GUIDELINES.md\` or project files instead.
6. Keep \`aioc\` and \`aiomo\` scope explicit when behavior differs.

## Implementation Checklist

1. Add or edit the skill entry in \`NATIVE_SKILLS\`.
2. If adding a new skill, add it to doctor's native skill list in \`bin/opencode-install-doctor.ts\`.
3. Update README's generated skills list and short description.
4. Run \`bun run format:check\`, \`bun run lint\`, \`bun run typecheck\`, and \`bun run ai:check\`.
5. Run \`bun run ai:gen -- --dry-run\` and confirm the new \`SKILL.md\` appears.

## Review Checklist

- Frontmatter has \`name\` and \`description\`.
- The description says when to use the skill.
- The body has enough project context to prevent guessing.
- The skill does not encourage unsafe Git, destructive file operations, or bypassing verification.`,
  ),
  skill(
    "find-skills",
    "Use at task start or when unsure which local native skill applies; lists and selects relevant ai-share skills without loading unrelated workflows.",
    `# Find Skills

Use this skill at task start, when the user asks what skills exist, or when unsure which local native skill applies.

## Available Local Skills

- \`git-master\`: Git status, diff, commit, push, history search, and branch safety.
- \`context-guard\`: aiomo context guard, watch/rescue/handoff, risk alerts, and history files.
- \`ai-share-generator\`: YAML source-of-truth, config builders, generated OpenCode/OMO config, and install output.
- \`install-doctor\`: \`aiomo doctor install\`, \`aioc doctor install\`, PATH, launchers, plugins, and installed skills.
- \`config-profile-tuning\`: OMO profiles, model roles, compaction, context budgets, fallback, and profile tradeoffs.
- \`context-compiler\`: compact auditable briefs for sessions, issues, logs, PRs, web research, and rescue output.
- \`config-diff-auditor\`: generated-output impact review after YAML, generator, plugin, launcher, profile, or skill changes.
- \`prompt-lint\`: prompt, agent, category, skill, and instruction-memory review for conflicts and unverifiable rules.
- \`permission-auditor\`: OpenCode/OMO agent, plugin, MCP, hook, launcher, and install side-effect boundaries.
- \`evidence-pack\`: post-implementation evidence summaries with verification, risks, and rollback notes; no Git state changes.
- \`release-commit\`: Git commit grouping, changelog notes, push preparation, and final verification summaries.
- \`plugin-vetting\`: OpenCode/OMO/TUI plugin evaluation, version pinning, permissions, and aioc/aiomo scope.
- \`skill-creator\`: creating, editing, reviewing, and installing local native skills.
- \`frontend-design\`: UI/UX, CSS, layout, accessibility, visual polish, and frontend component behavior.

## Selection Rules

1. If the user explicitly names a skill, load that skill.
2. If the task involves Git, load \`git-master\` before any git command.
3. If the task changes generated config or YAML, load \`ai-share-generator\`.
4. If the task changes local native skills, load \`skill-creator\`.
5. If the task adds plugins, load \`plugin-vetting\`.
6. If the task asks for session rescue, handoff, or long-context summarization, load \`context-compiler\`.
7. If the task changes generated outputs, load \`config-diff-auditor\` before final verification.
8. If the task reviews prompts or instructions, load \`prompt-lint\`.
9. If the task changes permissions, plugins, MCP, hooks, launchers, or external effects, load \`permission-auditor\`.
10. If the task needs post-implementation delivery evidence without Git state changes, load \`evidence-pack\`.
11. If the task touches UI, frontend components, CSS, layout, or design, load \`frontend-design\`.
12. If more than one skill applies, load the smallest useful set; do not stack unrelated workflows.

## Output When Asked To List Skills

Return a concise list of skill names with one-line purpose. Do not paste full skill contents unless asked.

## Maintenance

This list is generated from \`src/cli/native-skills.ts\`; update it whenever \`NATIVE_SKILLS\` changes.`,
  ),
  skill(
    "frontend-design",
    "Use for frontend UI/UX, CSS, layout, accessibility, visual polish, animations, or frontend component design and implementation.",
    `# Frontend Design

Use this skill for frontend UI/UX, CSS, layout, accessibility, visual polish, animations, or frontend component design and implementation.

## First Steps

1. Identify the frontend stack from project files before editing: package scripts, framework, styling system, component directories, and existing design conventions.
2. Reuse existing tokens, spacing, colors, typography, components, and patterns before inventing new ones.
3. If visual behavior is ambiguous, choose the simplest accessible interpretation and state the assumption in the final summary.

## Design Principles

- Make hierarchy obvious: primary action, secondary action, supporting text, and status should be visually distinct.
- Prefer consistent spacing and alignment over decorative complexity.
- Preserve keyboard access, focus states, semantic HTML, contrast, and responsive behavior.
- Avoid introducing new UI dependencies unless the existing stack cannot reasonably solve the problem.
- Keep animations subtle, purposeful, and respectful of reduced-motion preferences when applicable.

## Implementation Workflow

1. Search for similar components and style patterns first.
2. Make surgical changes in the relevant component/style files.
3. Update tests or snapshots if the project already uses them.
4. Run the narrowest relevant frontend validation: lint/typecheck/test/build based on available scripts.
5. For browser-visible changes, manually verify the feature with a browser or project-provided preview command when available.

## aiomo Delegation

When delegating visual work, use the visual-engineering category and include frontend skills when available:

\`task(category="visual-engineering", load_skills=["frontend-design"], run_in_background=false, prompt="...")\`

## Avoid

- Do not redesign unrelated screens or components.
- Do not hard-code colors or spacing if project tokens exist.
- Do not remove accessibility attributes or focus styles for visual neatness.
- Do not claim visual verification without actually running or inspecting the UI.`,
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

${body.trim()}
`,
  };
}
