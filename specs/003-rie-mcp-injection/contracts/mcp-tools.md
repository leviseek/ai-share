# Contract: RIE MCP Tools

This contract describes the user-visible MCP capability surface. Names are stable planning targets; implementation may map them to the concrete MCP protocol envelope while preserving input/output meaning.

## Common Rules

- Default repository: current Codex session repository.
- Optional `repoRoot` override: accepted by tools that operate on a repository.
- Missing snapshot: build automatically before answering.
- Stale snapshot: report staleness and allow explicit refresh.
- Source repository writes: prohibited. Local `.rie` snapshot/cache writes are allowed.
- Secret handling: outputs and diagnostics must not include real API keys, tokens, cookies, passwords, or private credentials.

## Tool: `rie.search`

**Purpose**: Find repository knowledge objects relevant to a text query.

**Input**:

```json
{
  "query": "provider workflow",
  "repoRoot": "optional explicit local path",
  "limit": 10
}
```

**Output**:

```json
{
  "repoRoot": "resolved repository path",
  "results": [
    {
      "id": "object id",
      "score": 0.92,
      "path": "relative/path.ts",
      "title": "display title",
      "summary": "short safe summary"
    }
  ],
  "snapshot": {
    "status": "current",
    "buildHash": "hash"
  }
}
```

**Errors**:

- Empty query returns a field-specific validation error.
- Empty or mismatched snapshot returns recovery guidance.

## Tool: `rie.context`

**Purpose**: Build a context bundle for planning, debugging, review, or explanation.

**Input**:

```json
{
  "query": "mcp injection",
  "intent": "plan",
  "repoRoot": "optional explicit local path",
  "paths": ["config/mcp.yaml"],
  "objectIds": ["object id"],
  "budget": {
    "maxObjects": 30
  }
}
```

**Output**:

```json
{
  "objects": [],
  "sections": [],
  "graph": {
    "nodes": [],
    "edges": []
  },
  "quality": {
    "score": 0.8,
    "grade": "good",
    "metrics": {},
    "gaps": [],
    "recommendations": []
  },
  "snapshot": {
    "status": "current",
    "buildHash": "hash"
  }
}
```

## Tool: `rie.graph`

**Purpose**: Return the full graph or a seeded subgraph.

**Input**:

```json
{
  "repoRoot": "optional explicit local path",
  "seedIds": ["object id"],
  "depth": 1
}
```

**Output**:

```json
{
  "nodes": [],
  "edges": [],
  "snapshot": {
    "status": "current",
    "buildHash": "hash"
  }
}
```

## Tool: `rie.neighbors`

**Purpose**: Return graph neighbors for one object.

**Input**:

```json
{
  "objectId": "object id",
  "repoRoot": "optional explicit local path"
}
```

**Output**: Same graph envelope as `rie.graph`.

## Tool: `rie.impact`

**Purpose**: Return impact graph for one object.

**Input**:

```json
{
  "objectId": "object id",
  "repoRoot": "optional explicit local path"
}
```

**Output**: Same graph envelope as `rie.graph`.

## Tool: `rie.explain`

**Purpose**: Build an explanation-focused context bundle for one object.

**Input**:

```json
{
  "objectId": "object id",
  "repoRoot": "optional explicit local path"
}
```

**Output**: Same bundle shape as `rie.context`.

## Tool: `rie.context_quality`

**Purpose**: Return only the context quality report for a request.

**Input**: Same as `rie.context`.

**Output**:

```json
{
  "score": 0.8,
  "grade": "good",
  "metrics": {},
  "gaps": [],
  "recommendations": [],
  "snapshot": {
    "status": "current",
    "buildHash": "hash"
  }
}
```

## Tool: `rie.graph_export`

**Purpose**: Export graph data in a supported text format.

**Input**:

```json
{
  "repoRoot": "optional explicit local path",
  "format": "json"
}
```

**Allowed formats**: `json`, `mermaid`.

**Output**:

```json
{
  "format": "json",
  "content": "serialized graph",
  "snapshot": {
    "status": "current",
    "buildHash": "hash"
  }
}
```

## Tool: `rie.readiness`

**Purpose**: Diagnose whether injected RIE MCP is usable for the selected repository.

**Input**:

```json
{
  "repoRoot": "optional explicit local path",
  "refresh": false
}
```

**Output**:

```json
{
  "injectionStatus": "present",
  "targetCodexHome": "resolved Codex user directory",
  "serverStartup": "ready",
  "snapshotStatus": "current",
  "capabilityCount": 8,
  "recoveryActions": [],
  "safe": true
}
```

**Errors**:

- Invalid command/env/config reports field-specific errors.
- Missing snapshot may trigger automatic build.
- Stale snapshot reports refresh availability; `refresh: true` may rebuild.
