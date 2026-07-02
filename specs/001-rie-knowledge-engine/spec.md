# Feature Specification: RIE Knowledge Engine

**Feature Branch**: `feature/repository-intelligence-engine`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "给当前项目引入 speckit；首个 spec 聚焦 RIE 知识引擎。"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 构建可诊断的仓库知识索引 (Priority: P1)

维护者需要把当前仓库转换为可审计的知识索引，以便后续检索、图分析和上下文构建都基于同一份快照。

**Why this priority**: 没有可信索引，其他 RIE 能力都无法稳定复现。

**Independent Test**: 在仓库根目录运行知识构建命令，确认输出包含对象数、边数、诊断数、store 路径和 build hash。

**Acceptance Scenarios**:

1. **Given** 当前仓库存在 TypeScript、Markdown、YAML 和 package metadata，**When** 维护者构建知识索引，**Then** 系统返回非零 objects 与 edges，并写入本地 RIE store。
2. **Given** 仓库包含应忽略的运行态目录，**When** 维护者构建知识索引，**Then** 系统不把 ignored runtime state 纳入知识对象。
3. **Given** 构建过程中遇到无效、二进制或超限文件，**When** 文件无法解析，**Then** 系统记录诊断并继续处理其他资源。

---

### User Story 2 - 获取任务相关上下文 (Priority: P2)

Codex 使用者需要按自然语言 query、intent、paths 或 objectIds 获取一组可解释的上下文对象和关系图，用于规划、解释、审查或调试。

**Why this priority**: RIE 的核心价值是减少人工搜文件成本，让 AI 能获得更聚焦的仓库上下文。

**Independent Test**: 对已构建索引执行上下文请求，确认返回对象、sections、graph 和 quality report。

**Acceptance Scenarios**:

1. **Given** 已有知识索引，**When** 用户提交与 repository intelligence 相关的 query，**Then** 系统返回至少一个相关对象和上下文章节。
2. **Given** 用户提供明确 paths 或 objectIds，**When** 系统构建上下文，**Then** 返回内容优先围绕这些 seed 展开。
3. **Given** query 无法匹配索引内容，**When** 系统构建上下文，**Then** 返回可理解的空结果诊断和改进建议。

---

### User Story 3 - 检查和浏览知识图谱 (Priority: P3)

维护者需要诊断索引健康状态并浏览 repository tree、graph、impact、dashboard 或 Studio 视图，以评估 RIE 输出是否可信。

**Why this priority**: 可视化和诊断帮助维护者发现 broken edges、弱上下文和导入限制等质量问题。

**Independent Test**: 对已有 store 运行 doctor 或打开 Studio，确认能查看诊断摘要和图谱相关视图。

**Acceptance Scenarios**:

1. **Given** 已有知识索引，**When** 维护者运行 doctor，**Then** 系统报告 broken edges、external references 和 diagnostic severity。
2. **Given** 维护者打开 Studio，**When** 请求 repository tree、graph、context 或 impact，**Then** 系统返回结构化 JSON 或可浏览页面。
3. **Given** Studio 导入外部仓库文件，**When** 文件数量、单文件大小、总大小或路径安全不满足限制，**Then** 系统拒绝导入并说明原因。

### Edge Cases

- 空仓库或无可解析文件时，构建结果仍应包含项目级对象或明确诊断。
- `.git`、`node_modules`、`.rie`、`.worktrees`、`.codex` 和 ignored paths 不应进入索引。
- 二进制、超限、无效 JSON/YAML 文件不应导致整体构建失败。
- 相对导入、外部依赖和缺失目标应可区分为 resolved、external 或 broken references。
- 上下文预算过小或 query 无匹配时，应返回质量报告与建议，而不是静默失败。
- Studio 导入必须防止路径穿越和绝对路径写入。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST scan repository resources while honoring default ignores, `.gitignore`, explicit ignores, binary detection, and maximum file size limits.
- **FR-002**: System MUST represent repository knowledge as typed objects, typed relationships, graph nodes, graph edges, diagnostics, and build metadata.
- **FR-003**: System MUST parse directories, Markdown, package metadata, YAML/JSON, TypeScript, and generic text files into stable knowledge objects when supported.
- **FR-004**: System MUST continue building when an individual resource cannot be parsed, and MUST include a diagnostic for the failed resource.
- **FR-005**: System MUST persist and reload a complete local snapshot containing objects, nodes, edges, diagnostics, metadata, and summary stats.
- **FR-006**: Users MUST be able to search indexed objects by text query and receive ranked results with object identity, path, and title.
- **FR-007**: Users MUST be able to request context by query, intent, paths, objectIds, and object budget.
- **FR-008**: System MUST include a context quality report with score, grade, metrics, gaps, and recommendations.
- **FR-009**: Users MUST be able to inspect graph, neighbors, shortest path, impact, and graph export views for indexed objects.
- **FR-010**: System MUST provide a doctor report that distinguishes broken internal edges from external references and summarizes diagnostic severities.
- **FR-011**: Studio MUST expose repository tree, graph, context, impact, dashboard, context lab, context recipes, and Codex dry-run surfaces over local requests.
- **FR-012**: Studio repository import MUST enforce file count, per-file size, total size, and safe relative path constraints.
- **FR-013**: RIE runtime state MUST remain local and ignored by Git unless explicitly promoted into source documentation or templates.
- **FR-014**: RIE outputs MUST NOT contain real API keys, tokens, cookies, or private credentials.

### Key Entities

- **Knowledge Object**: A typed unit of repository knowledge such as project, directory, document, rule, code file, code symbol, package, script, test, or config.
- **Knowledge Relationship**: A typed connection between objects, such as contains, imports, depends_on, declares, exports, references, tested_by, or documents.
- **Graph View**: A navigable subset of nodes and edges derived from knowledge objects and relationships.
- **Build Snapshot**: The persisted result of one build, including objects, nodes, edges, diagnostics, metadata, stats, and build hash.
- **Context Request**: A user request containing query, optional intent, optional seeds, optional paths, and an object budget.
- **Context Quality Report**: A structured assessment of search hits, seed coverage, object coverage, graph connectivity, gaps, and recommendations.
- **Studio Session**: A local record of dry-run, plan-exec, context lab, or recipe activity produced while using Studio.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A clean build of the current repository completes with diagnostics count equal to 0.
- **SC-002**: A clean build of the current repository produces more than 1,000 knowledge objects and more than 1,500 graph edges.
- **SC-003**: A repeated doctor run on the current repository reports `ok: true` with zero broken internal edges.
- **SC-004**: A query for repository-intelligence work returns a non-empty context with a quality report and at least one recommendation or positive metric.
- **SC-005**: Invalid, binary, oversized, or ignored files are handled without failing the whole repository build.
- **SC-006**: Studio import rejects unsafe relative paths and file-limit violations with user-readable errors.

## Assumptions

- The first RIE spec documents the desired v1 behavior of the current knowledge engine; it does not require changing implementation immediately.
- Local store defaults to `.rie` and remains ignored by Git.
- The current repository is the primary validation target for v1.
- RIE is a local developer tool; no network service or remote persistence is required for v1.
- Existing Bun scripts remain the primary user-facing entry points.
