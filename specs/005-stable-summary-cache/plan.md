# Implementation Plan: Stable AI Summary Cache

**Branch**: `feature/repository-intelligence-engine` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-stable-summary-cache/spec.md`

## Summary

将 RIE Studio AI Summary 的缓存身份从导入/构建时易变信息调整为稳定内容身份：当前节点、一跳关联节点、关系拓扑、文件内容 hash、AI provider/base_url/model 与 promptVersion。实现沿用当前 Bun + strict TypeScript + React/Vite Studio 技术栈，在现有 `src/knowledge/studio/ai-summary.ts` 缓存边界内收敛 cache key 生成，并通过相关 Bun 测试验证缓存复用、失效和不纳入易变字段的行为。

## Technical Context

**Language/Version**: TypeScript strict mode, Bun runtime, React 19 + Vite for RIE Studio UI

**Primary Dependencies**: Existing Node/Bun standard APIs, current RIE knowledge graph types, existing Studio AI Summary module, React/Vite UI stack; no new runtime dependency planned

**Storage**: Existing file-backed RIE AI Summary cache through `JsonFileAiNodeSummaryCache`; cache directory remains configurable and treated as runtime artifact

**Testing**: `bun test src/knowledge/studio/ai-summary.test.ts`, relevant `data.test.ts`, plus `bun run typecheck` and `bun run knowledge:studio:build` when UI-visible state is touched

**Target Platform**: Local developer workstation running RIE Studio via Bun on Windows/WSL/macOS-compatible project scripts

**Project Type**: TypeScript CLI/runtime plus local web Studio application

**Performance Goals**: Stable cache identity computation should be deterministic and lightweight relative to AI API latency; unchanged project re-import should cause zero extra AI generation requests for matching summaries

**Constraints**: Preserve env-only secret handling; do not commit runtime cache files; do not weaken strict TypeScript; do not include volatile fields (`updatedAt`, import root, temp directory, build time, volatile edge metadata, stream mode) in cache identity

**Scale/Scope**: Applies to one selected RIE node and its one-hop summary context per AI Summary request; does not expand cache invalidation beyond the current one-hop dependency boundary

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Source-First Configuration**: PASS. Durable behavior is specified in source and Spec Kit docs; runtime caches remain generated/local artifacts.
- **II. Env-Only Secret Handling**: PASS. AI provider API keys remain environment-variable references; no secrets are written to docs, cache keys, or tests.
- **III. Strict TypeScript And Test-First Delivery**: PASS. Plan requires targeted tests for cache identity and existing strict typecheck; no `as any`/`@ts-ignore` relaxation is planned.
- **IV. Runtime Outputs Are Generated Artifacts**: PASS. Cache entries and `.rie/` outputs remain uncommitted runtime state.
- **V. API First, Domain First, Storage Last**: PASS. Plan defines stable cache identity domain and contract before storage details; file cache remains replaceable behind `AiNodeSummaryCache`.

Post-design re-check: PASS. Phase 0/1 artifacts keep identity semantics separate from JSON-file storage and do not introduce new constitutional violations.

## Project Structure

### Documentation (this feature)

```text
specs/005-stable-summary-cache/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ai-summary-cache-identity.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/knowledge/
├── core/
│   ├── ids.ts                  # existing canonical hashing/path helpers
│   └── types.ts                # GraphNode/GraphEdge stable fields
├── studio/
│   ├── ai-summary.ts           # AI Summary prompt/context/cache identity behavior
│   ├── ai-summary.test.ts      # targeted cache identity tests
│   ├── data.ts                 # StudioSnapshot shape if needed
│   ├── data.test.ts            # cache directory/import behavior tests if affected
│   ├── server.ts               # Studio API wiring if response metadata changes
│   └── ui/src/main.tsx         # UI cached/generated state only if surfaced behavior changes
```

**Structure Decision**: Use the existing single TypeScript project and current RIE Studio module layout. The implementation should stay inside `src/knowledge/studio` and shared `src/knowledge/core` helpers unless a reusable identity helper is clearly needed. No new app, service, database, or framework is introduced.

## Complexity Tracking

No constitution violations or extra complexity requiring justification.
