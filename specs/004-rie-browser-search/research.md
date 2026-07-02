# Research: RIE Repository Browser Search

## Decision: Reuse existing RIE Studio stack

**Rationale**: The repository browser already lives in `src/knowledge/studio/ui/src/main.tsx`, is served by `src/knowledge/studio/server.ts`, and receives tree data from `buildRepositoryTree()` in `src/knowledge/studio/data.ts`. Extending these paths keeps the feature aligned with the user's instruction to reuse the existing stack and avoids a parallel UI or search service.

**Alternatives considered**:

- Add a separate search service: rejected because this is local Studio functionality and would add operational scope.
- Add a new frontend framework or search dependency: rejected because current React/Vite UI is sufficient and dependency policy favors no new dependencies.

## Decision: Use a small Studio search domain contract

**Rationale**: Search has domain concepts not present in the current tree: query validity, match type, filtered tree, skipped files, and stale-result prevention. Defining a typed contract keeps UI rendering, server responses, and tests consistent while preserving API-first/domain-first governance.

**Alternatives considered**:

- Mutate `RepositoryTreeNode` everywhere without explicit search fields: rejected because match classification and no-result/invalid states would become implicit.
- Return only flat results: rejected because the spec requires enough directory context and the existing browser is tree-oriented.

## Decision: Keep file-name/path regex and file-content literal matching separate

**Rationale**: Clarification selected regex for file names/paths and literal containment for content. This avoids surprising regex interpretation in file contents and makes invalid regex handling independent from content-text lookup.

**Alternatives considered**:

- Regex for both name and content: rejected by clarification and higher risk of slow or confusing content searches.
- Keyword tokenization for content: rejected by clarification and because it complicates acceptance tests.

## Decision: Search results update automatically with stale-result protection

**Rationale**: Clarification selected automatic updates. The UI should treat each query as the current source of truth and prevent older content-search responses from replacing newer results.

**Alternatives considered**:

- Enter/button-only search: rejected by clarification.
- Manual content-search trigger: rejected because it splits one requested search bar into two user flows.

## Decision: Show matching files only, with match type badges

**Rationale**: Clarification selected file-only results and match classification. This satisfies discovery without expanding scope into snippets, line numbers, or content preview.

**Alternatives considered**:

- Snippets and line numbers: rejected as scope expansion beyond requested file discovery.
- Unlabeled filtered tree: rejected because users need to tell name, content, and both matches apart.

## Decision: Preserve existing ignored/generated/unreadable boundaries

**Rationale**: Current Studio import/build behavior skips ignored directories and treats generated/runtime artifacts as non-source. Search must follow the same visible/allowed file scope, skip binary or unreadable files, and report non-blocking skipped states only when useful for status.

**Alternatives considered**:

- Search all filesystem paths under repo root: rejected because it may expose ignored/runtime artifacts and violates scope boundaries.
- Fail the whole search on unreadable files: rejected because it harms browsing reliability.
