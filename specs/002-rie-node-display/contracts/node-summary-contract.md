# Contract: RIE Node Summary Display Data

## Scope

This contract defines the display-level summary fields expected on RIE graph nodes and any surface that serializes node display data.

## Node Summary Fields

```ts
type SummarySource = "explicit" | "inferred" | "no-summary" | "ai-enhanced";
type SummaryConfidence = "high" | "medium" | "low";

type SummaryProvenance = {
  source: SummarySource;
  signals: string[];
  confidence: SummaryConfidence;
  fallbackReason?: string;
};

type SummaryDisplay = {
  summary: string;
  summaryProvenance: SummaryProvenance;
};
```

## Required Behavior

- `summary` is always display-safe: redacted, compacted, and target length is 120 characters or fewer.
- `summaryProvenance` is present whenever `summary` is present.
- `source: "explicit"` means the source object had an explicit summary that was normalized for display.
- `source: "inferred"` means the summary was generated from deterministic repository signals.
- `source: "no-summary"` means a safe useful summary could not be inferred; `fallbackReason` explains why.
- `source: "ai-enhanced"` is reserved for future optional enhancement and is not required for v1.
- `signals` names only safe signal categories; it must not contain raw secrets or long source excerpts.
- Core identity fields (`id`, `objectId`, `type`, `label`) remain stable and unchanged by summary inference.

## Surface Expectations

- Knowledge snapshot read/write preserves summary display fields.
- Graph, neighbors, impact, context graph, export, Studio, and MCP surfaces reuse the persisted summary fields.
- Existing consumers may ignore these fields without losing core node identity.

## Validation Expectations

- Repeated builds from the same input produce identical `summary` and `summaryProvenance`.
- No persisted or displayed summary field contains real API keys, tokens, cookies, passwords, or private credentials.
- At least 95% of summary text values are 120 characters or fewer.
