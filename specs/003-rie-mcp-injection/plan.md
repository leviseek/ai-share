# Implementation Plan: RIE MCP Injection

**Branch**: `` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-rie-mcp-injection/spec.md`

**Note**: 沿用当前现有技术栈与架构：Bun + strict TypeScript、`config/*.yaml` source-first 生成器、RIE 本地知识引擎、JSONL 本地快照、Codex 用户目录单向生成。

## Summary

为现有 RIE 增加可被 Codex 发现的本地 MCP tool server，并通过 ai-share 标准生成流程自动注入到 Codex 用户目录。实现应复用现有 `config/mcp.yaml`、Codex TOML 生成器、RIE build/load/search/graph/context/impact 能力，并补齐 MCP stdio 入口、当前会话仓库解析、缺失快照自动构建、stale 快照提示刷新、dry-run/check 输出与安全验证。

## Technical Context

**Language/Version**: TypeScript (strict) running on Bun; existing `tsconfig` strict options remain unchanged.

**Primary Dependencies**: Existing Bun runtime, existing ai-share generator modules, existing RIE modules under `src/knowledge/*`, existing YAML/config validation and TOML formatting code. No new dependency is planned.

**Storage**: Existing local JSONL RIE store under `.rie` by default, with generated Codex runtime files under `CODEX_HOME`. Source configuration remains `config/*.yaml`; runtime outputs stay generated artifacts.

**Testing**: `bun test` for unit/integration tests; targeted tests for config validation/builders and RIE MCP behavior; `bun run ai:check`, `bun run ai:dry-run`, `bun run knowledge:build -- --repo . --json`, and `bun run knowledge:doctor -- --repo .` for validation.

**Target Platform**: Local developer machines supported by the project: Windows PowerShell, WSL/Linux, and macOS, with Codex user directory resolved by existing `CODEX_HOME`/home directory rules.

**Project Type**: TypeScript CLI/config generator plus local repository-intelligence tool server.

**Performance Goals**: First-time injection and readiness verification complete in under 5 minutes on a clean device with dependencies installed; MCP tool discovery exposes at least seven capabilities; dry-run/check output remains fast enough for normal generator workflows.

**Constraints**: Env-only secret handling; no durable edits to generated Codex runtime files except through existing generation flow; source repository files are read-only for MCP tools; local writes limited to `.rie` snapshots/caches and generated Codex runtime targets; no network service or remote persistence required.

**Scale/Scope**: Current repository and other Codex session repositories; RIE store sizes consistent with existing RIE scope (>1,000 objects and >1,500 edges for ai-share clean build target from prior spec).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Source-First Configuration**: PASS — RIE MCP registration is planned through `config/mcp.yaml`, schema/validation, and generator code; generated Codex files remain outputs.
- **II. Env-Only Secret Handling**: PASS — MCP env values and sensitive values remain placeholders/env var names only; diagnostics must redact or avoid secret-like values.
- **III. Strict TypeScript And Test-First Delivery**: PASS — implementation will add tests before/with behavior and avoid type/lint suppressions.
- **IV. Runtime Outputs Are Generated Artifacts**: PASS — `CODEX_HOME/config.toml`, `.env`, runtime manifests, installed skills, `.rie`, and caches remain generated/local artifacts.
- **V. API First, Domain First, Storage Last**: PASS — plan defines MCP contracts and RIE domain entities before storage mechanics; storage remains replaceable behind existing store interfaces.

Post-design re-check: PASS — Phase 1 artifacts keep the same boundaries and introduce no constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-rie-mcp-injection/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── mcp-tools.md
│   └── codex-injection.md
└── tasks.md
```

### Source Code (repository root)

```text
config/
├── mcp.yaml                       # source RIE MCP server definition
└── *.schema.json                  # generated schema outputs when schema generation runs

src/
├── config/
│   ├── builders/codex.ts          # Codex TOML MCP server generation
│   ├── schema-spec.ts             # mcp.yaml schema source
│   ├── validation.ts              # config consistency orchestration
│   └── validators/mcp.ts          # MCP security/config validation
├── cli/
│   ├── ai-doctor.ts               # readiness/check reporting
│   ├── output.ts                  # dry-run/check/generation summaries
│   └── paths.ts                   # CODEX_HOME target resolution
├── knowledge/
│   ├── cli.ts                     # existing RIE build/doctor/search commands
│   ├── index.ts                   # buildKnowledge orchestration
│   ├── mcp/
│   │   ├── server.ts              # MCP exports/stdio entrypoint area
│   │   └── tools.ts               # RIE capability surface
│   └── storage/                   # JSONL store interfaces and implementation
└── types/
    ├── yaml.ts                    # source config types
    └── codex.ts                   # generated Codex config types
```

**Structure Decision**: Use the existing single TypeScript project. Extend current `config/mcp.yaml` → `buildCodexCliConfig()` → generated `CODEX_HOME/config.toml` path and current `src/knowledge/mcp` surface rather than adding a second installer, service, or storage layer.

## Complexity Tracking

No constitution violations. No extra project, database, network service, or dependency is justified for this feature.
