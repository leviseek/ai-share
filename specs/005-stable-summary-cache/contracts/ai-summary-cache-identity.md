# Contract: AI Summary Cache Identity

## Purpose

Defines the observable contract for deciding whether RIE Studio AI Summary may reuse an existing cached result.

## Inputs Included In Cache Identity

The cache identity MUST include:

- selected node `id`, `type`, `path`, `hash`
- each one-hop related node `id`, `type`, `path`, `hash`
- incoming/outgoing topology using connected node identities, direction, and relationship type
- file content hash when file content participates in summary context
- AI provider id
- AI provider `base_url`
- AI model id/name
- AI Summary `promptVersion`

## Inputs Excluded From Cache Identity

The cache identity MUST NOT include:

- `updatedAt`
- import root path
- temporary import directory
- build time
- volatile edge metadata
- API key value or resolved secret
- stream/non-stream request mode
- generated result timestamp

## Reuse Rules

- If all included stable identity inputs match an existing cache entry, the summary MUST be returned from cache without initiating an AI API request.
- If any included stable identity input changes, the previous cache entry MUST NOT be reused for that context.
- If selected node or included one-hop node content hash is missing, existing AI Summary MUST NOT be reused for that context.
- Changing only excluded inputs MUST NOT invalidate an otherwise matching cache entry.

## Response Observability

The AI Summary response exposed to Studio UI MUST continue to indicate whether the displayed result was cached or newly generated. Generated results MAY include API request duration; cached results MUST NOT require a new API request duration.

## Compatibility

This contract applies to the existing `AiNodeSummaryCache` boundary. It does not require a specific storage backend and remains compatible with file-backed cache directories.
