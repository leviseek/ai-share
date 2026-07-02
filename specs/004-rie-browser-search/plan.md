# Implementation Plan: RIE Repository Browser Search

**Branch**: `` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-rie-browser-search/spec.md`

**Note**: 沿用现有技术栈和框架：Bun + strict TypeScript、现有 RIE Studio、React/Vite 前端、Bun HTTP server、JSONL RIE snapshot 和当前测试/构建脚本。不引入新运行时、数据库、服务或第三方依赖。

## Summary

在 RIE Repository Browser 的文件目录树上方新增搜索栏。用户输入的查询会自动更新搜索结果：文件名/路径按正则匹配，文件内容按字面文本包含匹配；结果仍以文件树上下文展示，匹配文件只出现一次，并标注 name/content/both 匹配类型，不展示内容片段或行号。

## Technical Context

**Language/Version**: TypeScript strict mode running on Bun; React UI built by the existing Vite setup.

**Primary Dependencies**: Existing `react`, `react-dom`, `vite`, `lucide-react`, Bun standard APIs, and current RIE modules under `src/knowledge/*`. No new dependency is planned.

**Storage**: Existing `.rie` JSONL snapshot for knowledge objects plus current repository/imported-repository files for content reads. No new persistent storage is required; search state is UI/runtime state only.

**Testing**: `bun test src/knowledge/studio/data.test.ts`, targeted Studio search tests, `bun run knowledge:studio:build`, plus broader `bun run typecheck`/`bun run lint` when implementation changes are complete.

**Target Platform**: Local developer machines supported by the repository: Windows PowerShell, WSL/Linux, and macOS, served through the existing local RIE Studio HTTP server.

**Project Type**: Single TypeScript project containing a local RIE data layer, Bun HTTP server, and React browser UI.

**Performance Goals**: Name/path matches visibly update within 1 second for at least 1,000 visible files; content matching for typical text files must not block tree interaction for more than 1 second; users can find a known file in under 10 seconds.

**Constraints**: Preserve env-only secret handling; no edits to generated runtime artifacts as durable source; respect existing ignored/generated/unreadable file visibility boundaries; skip binary or unreadable content without failing the whole search; maintain strict TypeScript without `as any`/`@ts-ignore`; no new dependencies unless explicitly approved.

**Scale/Scope**: Current RIE Studio repository snapshots and uploaded repository imports, with search scoped to the currently opened repository and visible/allowed file tree. Planning target is at least 1,000 visible files and existing import guardrails.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Source-First Configuration**: PASS — durable changes are planned in `src/knowledge/studio/*`, tests, and feature specs only; generated Studio dist remains build output.
- **II. Env-Only Secret Handling**: PASS — feature searches local repository files and does not introduce credentials or secret persistence.
- **III. Strict TypeScript And Test-First Delivery**: PASS — implementation must add/adjust tests for search classification, invalid regex, content matching, and UI search behavior before completion.
- **IV. Runtime Outputs Are Generated Artifacts**: PASS — `.rie` and `public/dist` remain runtime/build artifacts; source changes stay in TypeScript/CSS/spec files.
- **V. API First, Domain First, Storage Last**: PASS — plan defines Search Query, Search Result File, Search State, and HTTP/UI contracts before choosing file-read mechanics.

Post-design re-check: PASS — Phase 1 artifacts keep existing architecture, storage boundaries, and generated-artifact rules; no constitution violations are introduced.

## Project Structure

### Documentation (this feature)

```text
specs/004-rie-browser-search/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── repository-browser-search.md
└── tasks.md              # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
src/knowledge/studio/
├── data.ts               # Search domain types and pure tree/result helpers
├── data.test.ts          # Unit tests for search behavior and edge cases
├── server.ts             # Repository search endpoint and safe file-content reads
└── ui/src/
    ├── main.tsx          # Search bar, automatic updates, filtered tree rendering, match badges
    └── styles.css        # Search input/result-state/match badge styling
```

**Structure Decision**: Extend the existing RIE Studio data/server/UI files. Keep search domain helpers in `data.ts` for testability, add server content-search behavior behind a Studio endpoint, and keep browser interaction in the existing React entrypoint instead of introducing a new app, worker framework, database, or dependency.

## Complexity Tracking

No constitution violations. No additional service, storage layer, or dependency is justified for this feature.
