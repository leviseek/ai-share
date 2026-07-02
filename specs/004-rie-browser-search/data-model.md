# Data Model: RIE Repository Browser Search

## Search Query

Represents the current text entered in the repository browser search bar.

Fields:

- `raw`: Original user input.
- `trimmed`: Input after trimming leading/trailing whitespace.
- `nameRegex`: Valid regular expression derived from `trimmed` for file-name/path matching.
- `contentText`: Literal text derived from `trimmed` for file-content containment.
- `caseSensitive`: Boolean search mode; defaults to existing browser behavior, otherwise case-insensitive.
- `status`: `empty` | `valid` | `invalid`.
- `errorMessage`: Present only when `status` is `invalid`.

Validation rules:

- Empty or whitespace-only input has `status = empty` and restores the unfiltered tree.
- Invalid regular expressions have `status = invalid` and must not clear the user's input.
- Content matching never interprets `contentText` as a regular expression.

## Search Result File

Represents one visible repository file that matched the current query.

Fields:

- `path`: Repository-relative file path; unique result identity.
- `name`: File name displayed in the tree.
- `objectIds`: Knowledge object ids associated with the file node.
- `matchType`: `name` | `content` | `both`.
- `contentReadable`: Boolean indicating whether content search could inspect this file.
- `contentMatches`: Optional first content-match text plus line/column used by the hover display.

Validation rules:

- A path appears at most once in result output.
- If a file matches both name/path and content, `matchType = both`.
- Content-match result records include first complete content name containing the search text plus line/column for hover display; full snippets remain out of scope.

## Repository File Tree

Represents the tree shown by the repository browser.

Fields:

- `name`: Display label.
- `path`: Repository-relative path.
- `kind`: `directory` | `file`.
- `objectIds`: Knowledge object ids attached to the node.
- `children`: Child nodes.
- `matchType`: Optional on file nodes in filtered/search results.
- `descendantMatchCount`: Optional on directory nodes in filtered/search results.
- `contentMatches`: Optional on content-matched file nodes for hover display.

Relationships:

- Directories contain child directories and files.
- Search results keep ancestor directories needed to locate matching files.

Validation rules:

- Filtering preserves enough parent directory context to identify matched files.
- Clearing search restores the original unfiltered tree.
- Directory ordering and file ordering remain consistent with existing tree sort behavior.

## Search State

Represents the browser-visible state for the active query.

Fields:

- `query`: Current Search Query.
- `displayMode`: `full-tree` | `filtered-tree` | `no-results` | `invalid-query` | `loading`.
- `results`: Search Result File list.
- `filteredTree`: Repository File Tree used for rendering when results exist.
- `pendingQueryId`: Identifier for the latest pending content-search request.
- `skipped`: Optional list of skipped paths and reasons.

State transitions:

- `full-tree` → `loading` when a non-empty valid query starts content search.
- `loading` → `filtered-tree` when current-query results arrive and at least one result exists.
- `loading` → `no-results` when current-query results arrive with no matches.
- Any state → `invalid-query` when regex validation fails.
- Any state → `full-tree` when the query becomes empty.
- Pending older results are ignored when `pendingQueryId` no longer matches the current query.
