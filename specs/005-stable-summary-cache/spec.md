# Feature Specification: Stable AI Summary Cache

**Feature Branch**: `feature/repository-intelligence-engine`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "AI summary cache key 改为基于稳定内容：当前节点 id/type/path/hash；一跳关联节点 id/type/path/hash；incoming/outgoing 边拓扑；文件内容 hash；AI provider/base_url/model；promptVersion。不把 updatedAt、importRoot 路径、临时导入目录、build time 纳入 cache key。"

## Clarifications

### Session 2026-07-03

- Q: Relationship topology identity should include which edge fields? → A: Include from/to node identity, direction, and relationship type; exclude volatile edge metadata.
- Q: How should cache reuse behave when selected or one-hop context nodes lack content hash? → A: Do not reuse old AI Summary when any included current or one-hop node lacks content hash.
- Q: Should stream/non-stream AI request mode be included in the AI Summary cache key? → A: Do not include stream mode; AI configuration identity is provider/base_url/model/promptVersion.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reuse summaries for unchanged nodes (Priority: P1)

A user refreshes the browser, re-imports the same project, and opens a node that was summarized previously. If the selected node, its one-hop related nodes, their relationships, relevant file contents, selected AI model configuration, and summary prompt version are unchanged, the user sees the existing AI Summary without waiting for a new AI generation request.

**Why this priority**: This directly prevents unnecessary AI cost and latency for the primary repeated-use workflow.

**Independent Test**: Can be tested by generating a summary for a node, refreshing/re-importing the same project without content changes, reopening the same node, and verifying the summary is served from cache with no new AI generation.

**Acceptance Scenarios**:

1. **Given** a node has an existing AI Summary cache entry and the project content is unchanged, **When** the user re-imports the same project and opens that node, **Then** the cached summary is shown and no new AI generation is triggered.
2. **Given** a node has an existing AI Summary cache entry and only import location or build timestamp changed, **When** the user opens that node after re-import, **Then** the cached summary remains valid.

---

### User Story 2 - Regenerate when relevant content changes (Priority: P2)

A user changes the selected node, a one-hop related node, relationship topology, relevant file content, AI model identity, AI provider endpoint, or prompt version. When the user opens the affected node again, the AI Summary is regenerated so it reflects the changed context.

**Why this priority**: Cache reuse must not show stale summaries when meaningful context changed.

**Independent Test**: Can be tested by changing one stable content identity input at a time and verifying that the next node summary is not served from the previous cache entry.

**Acceptance Scenarios**:

1. **Given** a cached summary exists, **When** the selected file content changes, **Then** opening the node produces a new summary cache identity.
2. **Given** a cached summary exists, **When** an incoming or outgoing relationship changes, **Then** opening the node produces a new summary cache identity.
3. **Given** a cached summary exists, **When** the user switches to a different AI model or provider endpoint, **Then** opening the node produces a summary for that AI configuration rather than reusing the old one.

---

### User Story 3 - Explain cache reuse behavior (Priority: P3)

A user inspecting AI Summary behavior can understand whether a summary was reused or regenerated, and can reason about why unchanged projects do not trigger repeat generation.

**Why this priority**: Observability builds user trust and helps diagnose unexpected regeneration.

**Independent Test**: Can be tested by opening a cached node and confirming that the visible summary state identifies it as cached while changed contexts clearly produce a newly generated summary.

**Acceptance Scenarios**:

1. **Given** a cached summary is reused, **When** the user views the AI Summary panel, **Then** the panel indicates cache reuse.
2. **Given** meaningful context changes invalidate the cache, **When** the user views the next AI Summary result, **Then** the panel indicates it was newly generated.

---

### Edge Cases

- Re-importing the same project into a different temporary import location must not invalidate summaries by itself.
- Rebuilding the project at a later time without content or relationship changes must not invalidate summaries by itself.
- Changing only non-semantic timestamps must not invalidate summaries.
- Changing the selected node's content identity must invalidate only affected summary identities, not unrelated nodes.
- Changing a one-hop related node's content identity must invalidate summaries that include that related node in their context.
- Changing only nodes outside the selected node's one-hop summary context must not invalidate the selected node's cached summary.
- Changing AI provider, provider endpoint, model, or prompt version must produce a distinct summary identity; changing only stream/non-stream request mode must not invalidate an otherwise matching cached summary.
- If the selected node or any one-hop related node included in the summary context lacks a content hash, the system must not reuse an existing AI Summary for that context.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST determine AI Summary cache identity from stable content identity rather than volatile import or build metadata.
- **FR-002**: The selected node's stable identity MUST include its id, type, path, and content hash.
- **FR-003**: Each one-hop related node included in summary context MUST contribute its id, type, path, and content hash to the summary cache identity.
- **FR-004**: Incoming and outgoing relationship topology included in summary context MUST contribute to the summary cache identity by using the connected node identities, relationship direction, and relationship type while excluding volatile edge metadata.
- **FR-005**: Relevant file content identity MUST contribute to the summary cache identity when file content is part of the summary context.
- **FR-006**: AI provider identity, provider endpoint, selected model, and summary prompt version MUST contribute to the summary cache identity; streaming versus non-streaming request mode MUST NOT contribute to the cache identity.
- **FR-007**: The system MUST NOT use updated timestamps, import root locations, temporary import directories, or build time values when deciding whether an AI Summary cache entry is reusable.
- **FR-008**: When all stable cache identity inputs match an existing cache entry, the system MUST serve the cached AI Summary without initiating a new AI generation request.
- **FR-009**: When any stable cache identity input differs from the existing cache entry, the system MUST treat the prior summary as not reusable for that context.
- **FR-010**: Cache reuse MUST work across browser refreshes and repeated imports of the same unchanged project when the configured RIE cache location is available.
- **FR-011**: The user-facing AI Summary state MUST continue to distinguish cached summaries from newly generated summaries.
- **FR-012**: The system MUST handle missing or incomplete stable identity data safely: if the selected node or any one-hop related node included in the summary context lacks a content hash, the system MUST NOT reuse an existing AI Summary for that context.

### Key Entities _(include if feature involves data)_

- **Summary Cache Identity**: A stable description of the selected summary context, including selected node identity, one-hop node identities, relationship topology, relevant file content identity, AI configuration identity, and prompt version.
- **Stable Node Identity**: The subset of node fields that represent meaningful summary context: id, type, path, and content hash.
- **Relationship Topology Identity**: The incoming and outgoing relationship structure included in the summary context, consisting of connected node identities, relationship direction, and relationship type, independent of volatile timestamps, temporary storage paths, or other volatile edge metadata.
- **AI Configuration Identity**: The selected AI provider, provider endpoint, model, and prompt version that determine whether two summaries are comparable; request streaming mode is a transport/display preference and is excluded from this identity.
- **Volatile Import Metadata**: Data such as updated timestamps, import root location, temporary import directory, and build time that must not affect cache reuse.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Reopening a previously summarized node after browser refresh and unchanged project re-import reuses the existing summary in 100% of test cases where stable identity inputs match.
- **SC-002**: Re-importing an unchanged project from a different temporary location causes zero additional AI generation requests for previously summarized nodes whose stable identity inputs match.
- **SC-003**: Changing selected node content, one-hop related node content, relationship topology, provider endpoint, model, or prompt version causes regeneration in 100% of targeted invalidation tests.
- **SC-004**: Changing only updated timestamps, temporary import path, or build time causes zero cache invalidations in targeted non-semantic-change tests.
- **SC-005**: Users can identify whether a displayed AI Summary was cached or newly generated without inspecting logs or internal files.

## Assumptions

- Users expect cache reuse only when the summary context and AI configuration are meaningfully unchanged.
- One-hop related nodes and relationship topology are the intended dependency boundary for AI Summary cache invalidation.
- Content hash is the authoritative indicator for whether node or file content changed.
- If stable content hash data is unavailable for the selected node or any one-hop related node in summary context, avoiding stale reuse is required.
- Existing RIE cache directory settings provide the persistent storage needed for reuse across browser refreshes and repeated project imports.
