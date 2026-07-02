# Contract: Repository Browser Search

## UI Contract

The Repository Browser panel exposes a search input above the file directory tree.

Input behavior:

- Empty input renders the full repository tree.
- Non-empty input is validated as a regular expression for file-name/path matching.
- Invalid regex renders an invalid-query state and keeps the previous usable tree or full tree available.
- Valid input automatically updates results as the input changes.
- Content matching uses the same input as literal text, not as regex.

Result rendering:

- Results render as a filtered tree with ancestor directories preserved.
- Matching files display one match classification: `name`, `content`, or `both`.
- Each matching path appears once.
- Content-match hover details show the complete content name containing the search text and its line/column in a visually distinct top region; full snippets are out of scope.

## HTTP Contract

### `GET /api/repository/search?q=<query>`

Searches the currently active Studio repository scope.

Query parameters:

- `q` (required): Search text. Interpreted as regex for file names/paths and literal text for file contents.

Success response for valid query:

```json
{
  "query": "main\\.ts",
  "status": "ok",
  "tree": {
    "name": ".",
    "path": "",
    "kind": "directory",
    "objectIds": [],
    "children": []
  },
  "results": [
    {
      "path": "src/main.ts",
      "name": "main.ts",
      "objectIds": ["codefile:src/main.ts"],
      "matchType": "name",
      "contentReadable": true,
      "contentMatches": [{ "text": "main", "line": 1, "column": 8 }]
    }
  ],
  "skipped": []
}
```

Invalid regex response:

```json
{
  "query": "[",
  "status": "invalid-query",
  "error": "Invalid regular expression."
}
```

No-results response:

```json
{
  "query": "not-found",
  "status": "no-results",
  "tree": {
    "name": ".",
    "path": "",
    "kind": "directory",
    "objectIds": [],
    "children": []
  },
  "results": [],
  "skipped": []
}
```

Rules:

- The endpoint must respect the same repository visibility boundaries as the existing tree.
- Binary or unreadable files are skipped without failing the whole query.
- The response includes first complete content name containing the search text and line/column for hover details when a file matched by content.
- The UI must ignore responses that do not correspond to the latest query.
