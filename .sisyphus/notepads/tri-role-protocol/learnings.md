# T20: Tri-Role Protocol TypeScript Implementation

## Done
- Created `src/protocol/tri-role.ts` with `TriRoleProfile` type, `ValidationError` type, and `validateTriRoleProfile()` validator
- Spec from T19 (`docs/protocol/tri-role.md`) uses `model_id` in roles and `version: "1.0.0"` as top-level field
- Task plan (T20) chose a simplified export format: `protocol: "tri-role/v1"` instead of `version: "1.0.0"`, and `model` instead of `model_id` in role objects
- `bun run typecheck` passes under strict tsconfig (`exactOptionalPropertyTypes`, `isolatedDeclarations`, `erasableSyntaxOnly`, `noUncheckedIndexedAccess`)

## Key Decisions
- Followed T20 task plan exactly (simplified format) rather than matching T19 spec structure 1:1, since T20 is the implementation task
- `protocol: "tri-role/v1"` acts as both protocol ID and version marker — single field replaces the spec's separate `version` + protocol concept
- Validator uses pure TypeScript, no JSON Schema library
- Error messages in Chinese per project convention for user-facing validation
