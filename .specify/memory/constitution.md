<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- PRINCIPLE_1_NAME -> I. Source-First Configuration
- PRINCIPLE_2_NAME -> II. Env-Only Secret Handling
- PRINCIPLE_3_NAME -> III. Strict TypeScript And Test-First Delivery
- PRINCIPLE_4_NAME -> IV. Runtime Outputs Are Generated Artifacts
- PRINCIPLE_5_NAME -> V. API First, Domain First, Storage Last
Added sections:
- Technology And Repository Constraints
- Development Workflow And Quality Gates
Removed sections:
- Template placeholder sections
Templates requiring updates:
- ✅ .specify/templates/plan-template.md reviewed; existing Constitution Check gate remains compatible.
- ✅ .specify/templates/spec-template.md reviewed; current user-value requirements remain compatible.
- ✅ .specify/templates/tasks-template.md reviewed; current TDD task guidance remains compatible.
Follow-up TODOs:
- None.
-->

# ai-share Constitution

## Core Principles

### I. Source-First Configuration

All durable configuration changes MUST be made in source files under `config/`, `memory/`,
`skills/`, `.specify/`, or documented templates. Generated user-level Codex files are outputs and
MUST NOT be edited as the durable fix. YAML in `config/*.yaml` remains the authority for model,
provider, MCP, environment, and Codex generation behavior.

### II. Env-Only Secret Handling

Real API keys, tokens, cookies, passwords, private credentials, and production secrets MUST NOT be
written to repository files, generated examples, specs, memory, or logs. Provider credentials and
sensitive MCP values MUST be represented only by environment-variable names or `${ENV_NAME}`
references. `config/env.yaml` MAY contain non-secret runtime defaults such as local proxy values but
MUST NOT contain `CODEX_HOME`, `PATH`, `AI_SHARE_*`, `CODEX_*`, or secret-like values.

### III. Strict TypeScript And Test-First Delivery

Code changes MUST preserve strict TypeScript settings, including `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noUnused*`, `isolatedDeclarations`, and `erasableSyntaxOnly`. Feature
work and bug fixes MUST be protected by relevant tests or repeatable validation commands before the
change is considered complete. Implementations MUST NOT bypass failures by deleting tests, weakening
assertions, loosening types, swallowing errors, using `as any`, or adding `@ts-ignore`.

### IV. Runtime Outputs Are Generated Artifacts

The repository manages Codex user runtime through one-way generation. `CODEX_HOME/config.toml`,
`CODEX_HOME/.env`, `CODEX_HOME/AGENTS.md`, runtime manifests, installed skills, `.rie/`, caches, and
other local state are runtime artifacts. Source changes MUST keep generated output reproducible, and
runtime artifacts MUST stay out of Git unless explicitly defined as source templates.

### V. API First, Domain First, Storage Last

Repository Intelligence Engine and memory-runtime work MUST define stable user-facing behavior,
domain objects, relationships, and contracts before choosing storage mechanics. Business logic MUST
not depend on a specific persistence detail such as JSONL, cache directories, SQLite, graph stores,
or generated snapshots when an interface boundary can keep storage replaceable.

## Technology And Repository Constraints

- Bun is the package manager and runtime for project scripts.
- TypeScript is the implementation language for generator, CLI, and RIE code.
- Default communication and project-authored prose use Simplified Chinese; identifiers, commands,
  paths, API names, and schema fields stay English.
- Native Codex skills are sourced from `skills/*/SKILL.md` or installed Spec Kit skills, never from
  generated user files.
- Local/private layers such as `config/local/`, `memory/local/`, `memory/private/`,
  `memory/project/`, `.env*`, `.rie/`, and caches remain ignored.

## Development Workflow And Quality Gates

- Before implementation, read relevant project rules, specs, configs, and existing patterns.
- For feature work, prefer Spec Kit flow: constitution → specification → plan → tasks →
  implementation → validation.
- Each implementation slice MUST be independently verifiable. Run the smallest relevant checks first,
  then broader checks when touching cross-cutting behavior.
- Standard verification commands are `bun run format:check`, `bun run lint`, `bun run typecheck`,
  `bun test`, `bun run memory:check`, `bun run skill:lint`, `bun run ai:check`, and RIE-specific
  `bun run knowledge:build -- --repo . --json` plus `bun run knowledge:doctor -- --repo .`.
- Git commits, pushes, history rewrites, and destructive operations require explicit user request.

## Governance

This constitution supersedes ad-hoc workflow preferences for Spec Kit governed work in this
repository. Amendments require updating this file, adding a Sync Impact Report, and reviewing
dependent templates or specs affected by changed principles.

Versioning follows semantic versioning:

- MAJOR for removing or redefining a principle in a backward-incompatible way.
- MINOR for adding a principle or materially expanding governance.
- PATCH for clarifications that do not change obligations.

All specs, plans, and tasks MUST pass the Constitution Check before implementation. Any justified
violation MUST be documented in the feature plan with a simpler alternative considered.

**Version**: 1.0.0 | **Ratified**: 2026-07-02 | **Last Amended**: 2026-07-02
