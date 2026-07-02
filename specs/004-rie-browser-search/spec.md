# Feature Specification: RIE Repository Browser Search

**Feature Branch**: `[004-rie-browser-search]`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "增强rie，在仓库浏览器内，文件目录树上方新增搜索栏，通过名称正则搜索匹配对应的文件以及文件内容包含有匹配名称字符的文件"

## Clarifications

### Session 2026-07-02

- Q: How should the search input be applied to file contents? → A: File names/paths use regex; file contents use literal text containment.
- Q: When should search results update? → A: Results update automatically as the input changes.
- Q: What detail should content-match results show? → A: Show matching files with match type; on hover, content matches show complete content name containing the search text and line/column.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Regex search files by name (Priority: P1)

As a repository browser user, I want a search bar above the file directory tree so I can quickly locate files whose names or paths match a regular expression without manually expanding directories.

**Why this priority**: File-name search is the primary requested capability and directly reduces time spent navigating large repositories.

**Independent Test**: Can be tested by opening a repository browser with a known file tree, entering a regular expression that matches specific file names, and confirming only matching files remain visible or are clearly highlighted in context.

**Acceptance Scenarios**:

1. **Given** the repository browser file tree is visible, **When** the user enters a valid regular expression matching one or more file names, **Then** matching files are shown in the tree with enough parent directory context to identify their location.
2. **Given** the user has entered a search expression, **When** the user clears the search bar, **Then** the full original file directory tree is restored.
3. **Given** the user enters a regular expression that matches no file names, **When** the search completes, **Then** the browser communicates that no file-name matches were found without losing the user's current query.

---

### User Story 2 - Find files by content containing the search text (Priority: P2)

As a repository browser user, I want the same search input to also reveal files whose contents include the search text so I can discover relevant files even when their names do not match.

**Why this priority**: Content-based discovery expands the usefulness of the search bar beyond file naming conventions and supports exploration of unfamiliar repositories.

**Independent Test**: Can be tested by using a repository where a known string appears inside a file whose name does not match the query, then confirming the file appears as a content match.

**Acceptance Scenarios**:

1. **Given** a file name does not match the entered query but its contents include the query text, **When** the user searches, **Then** the file appears in search results as a content match.
2. **Given** a file matches by both name and content, **When** the user searches, **Then** the file appears once with clear indication that it matched at least one search mode.
3. **Given** content search is still being evaluated for a large repository, **When** name matches are already known, **Then** the browser remains usable and eventually updates content matches or status.

---

### User Story 3 - Handle invalid and changing queries gracefully (Priority: P3)

As a repository browser user, I want invalid expressions and rapid query changes to be handled clearly so search does not interrupt browsing or produce confusing results.

**Why this priority**: Regex input can be malformed; graceful handling protects the base browsing experience after the core search behavior exists.

**Independent Test**: Can be tested by entering malformed regular expressions, editing them into valid expressions, and confirming the browser provides useful feedback while recovering automatically.

**Acceptance Scenarios**:

1. **Given** the user enters an invalid regular expression, **When** the browser validates the query, **Then** the user sees a clear validation message and the previous valid results or full tree remain available.
2. **Given** the user quickly changes the search query, **When** newer results become available, **Then** stale results from older queries do not replace the current query's results.

---

### Edge Cases

- Empty or whitespace-only input restores the unfiltered tree and does not show an error.
- Invalid regular expressions produce a readable validation state without clearing the input.
- Case sensitivity follows the repository browser's documented default; if no default exists, search is case-insensitive for user convenience.
- Binary, generated, ignored, or unreadable files do not break search; they are either skipped or reported in a non-blocking way consistent with existing repository-browser behavior.
- Very large files or repositories do not freeze the browser; users receive progress or partial-result feedback when search takes noticeable time.
- Files matching through content but not name are distinguishable from name matches, while duplicate entries are avoided.
- Rapid input changes do not require manual submission; newer automatic results supersede older pending results.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The repository browser MUST provide a search bar positioned above the file directory tree.
- **FR-002**: Users MUST be able to enter a regular expression to match file names and visible file paths in the repository tree.
- **FR-003**: The browser MUST show matching files with sufficient directory context for users to identify each file's location, and show complete content name containing the search text plus line/column in a distinct hover area for content matches.
- **FR-004**: The browser MUST restore the complete file directory tree when the search query is cleared.
- **FR-005**: The browser MUST identify files whose contents contain the user's search text as literal text, even when their file names do not match the regular expression.
- **FR-006**: The browser MUST avoid duplicate file entries when a file matches by both name and content, and MUST indicate whether each visible result matched by name, content, or both.
- **FR-007**: The browser MUST distinguish no-results states from invalid-query states.
- **FR-008**: The browser MUST provide clear feedback for invalid regular expressions without disrupting normal file browsing.
- **FR-009**: Search results MUST update automatically when the query changes and MUST NOT display stale results for a superseded query.
- **FR-010**: Search MUST respect the repository browser's existing visibility boundaries for ignored, generated, unreadable, or excluded files.
- **FR-011**: Search behavior MUST be testable on repositories containing nested directories, files with similar names, and files whose contents include the query text.

### Key Entities

- **Search Query**: The text entered by the user; interpreted as a regular expression for file-name/path matching and as search text for content inclusion.
- **Search Result File**: A repository file that matched by name, path, content, or multiple match types; includes its repository-relative location and match classification, and may include first content-match text plus line/column for hover display.
- **Repository File Tree**: The visible hierarchy of directories and files shown by the repository browser before and after filtering.
- **Search State**: The current query, validation status, result status, and whether the displayed tree represents full, filtered, partial, or no-result content.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In a repository with at least 1,000 visible files, users can locate a known file by name search in under 10 seconds from opening the browser.
- **SC-002**: At least 95% of valid searches return visible name-match feedback within 1 second for repositories of the project's typical size.
- **SC-003**: Content matches for typical text files become visible without blocking tree interaction for more than 1 second.
- **SC-004**: 90% of users in validation can correctly tell whether a result matched by name, by content, or by both.
- **SC-005**: Invalid regular expression input is recoverable by editing the query, with no page refresh or browser restart required.

## Assumptions

- The target user is an existing RIE repository browser user exploring local repository contents.
- Search applies to the currently opened repository and the browser's currently visible/allowed file scope.
- The same input is used for both modes: regular-expression matching for file names/paths and literal text containment for file contents; content matching does not interpret the input as a regular expression.
- Case-insensitive search is the default unless the existing repository browser already exposes a different documented behavior.
- Content search focuses on text-readable files and may skip binary or unreadable files without failing the entire search.
