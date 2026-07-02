# Feature Specification: RIE Node Summary Inference

**Feature Branch**: `002-rie-node-display`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "增强rie，分析推理出节点的summary"

## Clarifications

### Session 2026-07-02

- Q: Should inferred node summaries be persisted in the knowledge snapshot or generated only for each display request? → A: Build-time generation persisted in the knowledge snapshot.
- Q: What target length should node summaries use for graph display and exports? → A: Compact summaries targeting 120 characters or fewer.
- Q: How should explicit summaries be handled when they are long or may contain sensitive content? → A: Redact and compact explicit summaries before persisting display summaries.
- Q: What language should inferred node summaries use by default? → A: Simplified Chinese summaries by default, with identifiers unchanged.
- Q: How detailed should summary provenance be? → A: Include source, signals, confidence, and fallback reason.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Understand node purpose from summary (Priority: P1)

Maintainers browsing repository intelligence views need each graph node to include a concise summary that explains what the node represents and why it matters, even when the source object did not provide an explicit description.

**Why this priority**: A graph made of labels and identifiers is hard to trust; summaries turn nodes into useful repository knowledge that can guide planning, debugging, review, and context selection.

**Independent Test**: Build or load a repository knowledge snapshot, inspect persisted node summary data, and verify that every visible node includes either an explicit summary, an inferred summary, or a clear explanation that no safe summary could be inferred.

**Acceptance Scenarios**:

1. **Given** a graph contains files, directories, documents, code symbols, configuration, scripts, packages, and generated artifacts, **When** a maintainer views the graph, **Then** each node includes a short summary that helps identify its purpose.
2. **Given** a node already has a high-quality explicit summary, **When** the persisted display summary is produced, **Then** the explicit meaning is preserved, redacted, compacted, and marked as explicit rather than replaced by a weaker inferred summary.
3. **Given** a node lacks an explicit summary, **When** the knowledge snapshot is built, **Then** the system infers and persists a summary from safe repository signals such as type, title, path, tags, language, metadata, and repository relationships.

---

### User Story 2 - Trust how summaries were inferred (Priority: P2)

Maintainers diagnosing repository knowledge need to know whether a node summary came from source content, deterministic inference, or a future optional AI enhancement so they can judge confidence and reproducibility.

**Why this priority**: Summary quality affects context selection; provenance prevents inferred text from being mistaken for authoritative source documentation.

**Independent Test**: Inspect node display output and verify that summary text is accompanied by source/provenance details and a concise reason for inferred summaries.

**Acceptance Scenarios**:

1. **Given** a summary was copied from an existing object description, **When** the node is displayed, **Then** the summary source is identified as explicit.
2. **Given** a summary was inferred from repository signals during snapshot build, **When** the node is displayed, **Then** the summary source is identified as inferred and includes enough provenance to explain the inputs used.
3. **Given** optional AI enhancement is introduced later, **When** an AI-enhanced summary is displayed, **Then** the display still distinguishes it from explicit and deterministic inferred summaries.

---

### User Story 3 - Reuse summaries across RIE surfaces (Priority: P3)

Codex users and maintainers need graph, context, impact, and exported views to describe the same node with the same summary so that diagnostics, screenshots, and prompt bundles remain comparable.

**Why this priority**: Consistent summaries reduce confusion when users move between RIE surfaces and make validation evidence easier to compare.

**Independent Test**: Compare the same node across graph, impact, context-related graph output, and export output and verify that summary text, summary source, and core identity remain consistent.

**Acceptance Scenarios**:

1. **Given** the same node appears in multiple RIE surfaces, **When** a maintainer compares those surfaces, **Then** the summary and summary source remain consistent.
2. **Given** summary data is exported for another tool or AI workflow, **When** the export is inspected, **Then** it contains enough summary metadata to render or explain the node without re-reading the full snapshot.
3. **Given** existing consumers only rely on core node identity, **When** summary fields are added, **Then** they can continue matching nodes back to the same repository knowledge objects.

### Edge Cases

- Nodes with duplicate titles but different paths or types must produce distinguishable summaries.
- Nodes without paths, tags, language, metadata, or relationships must still display safely with a minimal summary or a clear no-summary explanation.
- Inferred summaries must not present external references or unresolved endpoints as ordinary internal repository nodes.
- Very dense nodes must summarize relationship context without overwhelming the display.
- Filtered graph scopes must distinguish persisted summary meaning from any visible-scope relationship counts.
- Summary generation must not reveal real secrets, tokens, cookies, passwords, or private credentials from source content or metadata.
- Empty, binary, oversized, ignored, or invalid files must not cause summary inference to fail the whole graph view.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide summary information for every visible graph node.
- **FR-002**: System MUST preserve the meaning and explicit provenance of an existing non-empty summary while redacting and compacting it before persisting display summary text.
- **FR-003**: System MUST infer and persist a concise summary during snapshot build when a node lacks an explicit summary, using safe repository signals available in the knowledge snapshot.
- **FR-004**: System MUST identify summary provenance as explicit, inferred, no-summary, or future optional AI-enhanced.
- **FR-005**: System MUST provide provenance for each summary that includes source, main signals used, confidence, and fallback reason when applicable.
- **FR-006**: System MUST keep inferred summaries deterministic for the same snapshot and graph scope.
- **FR-007**: System MUST keep summaries concise enough for dense graph views, targeting 120 characters or fewer for displayed summary text while exposing enough detail for node inspection.
- **FR-008**: System MUST use Simplified Chinese as the default summary language while preserving identifiers such as paths, symbol names, commands, and API names unchanged.
- **FR-009**: System MUST preserve consistent persisted summary text and provenance across graph browsing, impact analysis, context-related graph output, and graph export surfaces.
- **FR-010**: System MUST keep core node identity stable so existing users can still match display-enriched nodes back to repository knowledge objects.
- **FR-011**: System MUST redact or omit secret-like values before they can appear in explicit summaries, inferred summaries, summary provenance, or display metadata.
- **FR-012**: System MUST provide clear fallback behavior when a safe summary cannot be inferred.
- **FR-013**: Users MUST be able to validate summary coverage and summary safety through repeatable graph-view checks on the current repository snapshot.

### Key Entities

- **Node Summary**: A concise redacted user-facing explanation of what a graph node represents and how it is relevant to the repository.
- **Summary Provenance**: Metadata that distinguishes explicit, inferred, no-summary, and future optional AI-enhanced summaries and records source, main input signals, confidence, and fallback reason when applicable.
- **Node Display Profile**: The user-facing description of a graph node, including identity, label, type, location, summary, summary provenance, status indicators, and relationship metrics.
- **Visible Graph Scope**: The subset of nodes and relationships currently shown after applying seeds, depth, filters, search, or limits.
- **Relationship Context**: The repository relationships available in the knowledge snapshot that can help infer a node's purpose.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of nodes shown in graph inspection output include non-empty summary text or an explicit no-summary explanation.
- **SC-002**: 100% of displayed summaries include summary provenance.
- **SC-003**: 100% of summary provenance records include source, signals, confidence, and fallback reason when applicable.
- **SC-004**: Repeated summary generation for the same snapshot and graph scope produces identical summary text and provenance.
- **SC-005**: At least 95% of nodes with path, type, tag, language, metadata, or relationship signals receive an inferred or explicit summary.
- **SC-006**: At least 95% of displayed summaries are 120 characters or fewer.
- **SC-007**: At least 95% of inferred summaries use Simplified Chinese prose while preserving repository identifiers unchanged.
- **SC-008**: Maintainers can distinguish duplicate-title nodes by summary, type, or location without opening source files.
- **SC-009**: Existing graph consumers can still map every display-enriched node back to the same repository object identity.
- **SC-010**: A validation pass on the current repository confirms no node summary or summary provenance contains real secrets or credential-like values.

## Assumptions

- This enhancement updates the existing RIE node display feature rather than creating a separate feature.
- The first delivery uses deterministic local inference as the default source of missing summaries.
- Optional AI-enhanced summaries may be added later, but they are not required for v1 completion.
- Inference should prefer concise, explainable summaries over full source excerpts.
- Summary inference uses repository relationship context available at snapshot build time; visible graph scopes may add display metrics but do not change persisted summary text.
- Summary prose defaults to Simplified Chinese; code identifiers, paths, commands, and API names remain unchanged.
