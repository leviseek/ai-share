# Quickstart: Stable AI Summary Cache Validation

## Prerequisites

- Run from repository root: `D:\ai-share`
- Dependencies installed with `bun install`
- No real AI API key is required for targeted unit tests that mock AI responses

## Targeted Validation

### 1. AI Summary cache identity tests

```powershell
bun test src/knowledge/studio/ai-summary.test.ts
```

Expected outcome:

- unchanged selected node, one-hop nodes, topology, file hash, provider/baseUrl/model, and promptVersion reuse cache
- `updatedAt`, temporary import location, build time-like values, volatile edge metadata, and stream mode do not change cache key
- selected node hash, one-hop node hash, relationship type/direction, file content hash, provider/baseUrl/model, and promptVersion changes invalidate cache
- missing selected or one-hop node hash prevents unsafe cache reuse

### 2. Cache directory/import behavior tests

```powershell
bun test src/knowledge/studio/data.test.ts src/knowledge/studio/ai-summary.test.ts
```

Expected outcome:

- configured RIE cache directory remains usable across repeated project imports
- unchanged project import does not force new AI Summary generation for matching cache identities

### 3. TypeScript safety

```powershell
bun run typecheck
```

Expected outcome: strict TypeScript passes without weakening compiler settings or suppressing errors.

### 4. Studio build when UI/API response metadata changes

```powershell
bun run knowledge:studio:build
```

Expected outcome: RIE Studio UI builds successfully and still displays cached/newly generated AI Summary state.

## Manual Scenario

1. Start Studio using the existing project workflow.
2. Import a repository and open a file node.
3. Generate AI Summary once.
4. Refresh the browser and re-import the unchanged project, possibly from a different temporary import location.
5. Open the same node.
6. Confirm the AI Summary panel reports cached reuse and no new AI request is made.
7. Modify selected file content or a one-hop relationship type and repeat.
8. Confirm the next result is newly generated.

## References

- Spec: `specs/005-stable-summary-cache/spec.md`
- Data model: `specs/005-stable-summary-cache/data-model.md`
- Contract: `specs/005-stable-summary-cache/contracts/ai-summary-cache-identity.md`
