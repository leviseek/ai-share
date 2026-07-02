# Quickstart: RIE Repository Browser Search

## Prerequisites

- Dependencies installed with `bun install`.
- Run commands from repository root.
- Use the existing RIE Studio stack; no extra service or dependency is required.

## Build a fresh knowledge snapshot

```powershell
bun run knowledge:build -- --repo . --json
bun run knowledge:doctor -- --repo .
```

Expected outcome:

- Knowledge build completes.
- Doctor reports the snapshot is readable for Studio.

## Run targeted tests

```powershell
bun test src/knowledge/studio/data.test.ts
```

Expected outcome:

- Search helper tests cover name regex matches, literal content matches, duplicate `both` classification, invalid regex, empty query restore, and skipped unreadable/binary content behavior.

## Build Studio UI

```powershell
bun run knowledge:studio:build
```

Expected outcome:

- Vite build succeeds with strict TypeScript-compatible UI code.

## Manual validation in Studio

```powershell
bun run knowledge:studio
```

Open the printed local Studio URL.

Scenarios:

1. Search for a regex matching a known path, such as `main\\.tsx`.
   - Expected: matching files are visible in a filtered tree with parent directories.
   - Expected: result badge indicates `name` or `both`.
2. Search for text that appears inside a file but not in its file name.
   - Expected: the file appears once with a `content` badge; hovering the file shows complete content name containing the search text and line/column in a distinct top hover area.
3. Enter an invalid regex such as `[`.
   - Expected: invalid-query feedback appears without clearing the input.
4. Clear the input.
   - Expected: full tree is restored.
5. Type rapidly across multiple values.
   - Expected: the final query's results are displayed and stale earlier results do not replace them.

## Broader verification before implementation completion

```powershell
bun run typecheck
bun run lint
bun run knowledge:studio:build
bun run ai:check
```

Expected outcome:

- All commands pass, or failures are triaged as unrelated existing issues before delivery.
