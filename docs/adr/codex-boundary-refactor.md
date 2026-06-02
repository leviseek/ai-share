# ADR: Codex instruction boundary refactor

## Status

Accepted for the Codex boundary refactor slice described in `.omx/plans/prd-codex-boundary-refactor.md`.

## Context

Codex/OMX is the ai-share mainline path, but `buildCodexInstructions` previously consumed instruction and memory path composition through the OpenCode builder module. That made a shared concept look OpenCode-owned and obscured the compatibility boundary between Codex/OMX generation and OpenCode/OMO config generation.

The protected behavior is memory semantics: generated instruction lists must keep `AI_GUIDELINES.md` first, keep task-specific memory ahead of structured memory, preserve `AIOMO_TASK` fallback behavior, and append profile-specific memory without changing OpenCode/aioc/OMO output semantics.

## Decision

Instruction and memory path composition is a neutral ai-share builder boundary owned by `src/config/builders/instructions.ts`.

Codex/OMX and OpenCode/aioc/OMO builders should both depend on that neutral module. OpenCode remains a compatibility consumer of the same path arrays; it is no longer the owner of the shared instruction/memory path contract.

## Drivers

- Remove the Codex-to-OpenCode architectural dependency for shared instruction memory composition.
- Preserve generated instruction arrays and user memory behavior across Codex/OMX, OpenCode, aioc, and OMO profiles.
- Keep the first refactor slice small, reversible, and verifiable with targeted regression coverage and generated-output dry-run evidence.
- Make the public owner discoverable in authoritative docs so future changes do not reintroduce OpenCode-specific ownership wording.

## Alternatives considered

1. **Extract a neutral instruction path builder** — accepted. It directly removes the misleading owner while keeping the behavior surface narrow.
2. **Split all Codex and OpenCode generation orchestration immediately** — rejected for this slice. It is broader than the boundary problem and increases generated-config risk.
3. **Documentation-only ADR** — rejected. It would describe the desired boundary but leave the concrete Codex import coupled to the OpenCode builder.

## Compatibility shim policy

`src/config/builders/opencode.ts` may keep a temporary forwarding export for `buildInstructionsPaths` during this slice so existing imports from the old OpenCode-named module continue to work.

The canonical export path is the neutral module and facade export, not the OpenCode builder. Removing the temporary forwarding export is a follow-up cleanup only after repository and generated-config consumers are audited.

## Rollback

If targeted tests or `bun run ai:dry-run` show unexpected generated output changes, revert the import/export rewiring and move `buildInstructionsPaths` back to its previous owner until the behavior delta is understood. Rollback must preserve the same memory file ordering and `AIOMO_TASK` fallback semantics.

## Follow-ups

- Audit other OpenCode-named modules for shared Codex/OMX concepts that deserve neutral ownership.
- Decide whether targeted Bun tests should become a first-class package script after this regression harness is proven.
- Evaluate a later orchestration split between Codex/OMX mainline generation and OpenCode/OMO compatibility outputs.
