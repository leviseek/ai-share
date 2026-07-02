# Quickstart: Validate RIE Node Summary Inference

## Prerequisites

- Work from repository root.
- Use the existing Bun-based project toolchain.
- Do not commit `.rie/` runtime output.

## Scenario 1: Focused RIE tests

Run:

```powershell
bun test src/knowledge
```

Expected outcome:

- Tests cover explicit summary normalization, inferred summary generation, provenance fields, redaction, deterministic output, and graph surface reuse.
- Existing RIE behavior remains compatible.

## Scenario 2: Type safety

Run:

```powershell
bun run typecheck
```

Expected outcome:

- Strict TypeScript passes without `as any`, `@ts-ignore`, loosened optional types, or unchecked summary fields.

## Scenario 3: Build current repository snapshot

Run:

```powershell
$store = Join-Path $env:TEMP ('rie-summary-' + [guid]::NewGuid().ToString('N'))
bun run knowledge:build -- --repo . --store $store --json
bun run knowledge:doctor -- --repo . --store $store
if (Test-Path $store) { Remove-Item -LiteralPath $store -Recurse -Force }
```

Expected outcome:

- Build completes and writes a local snapshot.
- Doctor reports no broken internal edges.
- Persisted nodes include display summaries and provenance.
- No summary/provenance field exposes secret-like values.

## Scenario 4: Cross-surface consistency

Run graph, context, impact, and export commands against the same temporary store.

Expected outcome:

- The same node keeps the same `summary` and `summaryProvenance` across surfaces.
- Core node identity remains unchanged.
- Display summaries are concise, Simplified Chinese prose with identifiers preserved.
