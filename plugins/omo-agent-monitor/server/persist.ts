import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { state } from "./state.ts";
import { refreshDbTokenSnapshot } from "./sqlite.ts";
import { validateState } from "./validate.ts";
import { checkHealth, emergencyStop } from "./circuit-breaker.ts";
import { buildPersistedStateSnapshot } from "./snapshot.ts";
import { applyValidatedStateRepair } from "./apply-validation.ts";

const idleThresholdMs = 15_000;

export async function persist(statePath: string): Promise<void> {
  state.updatedAt = Date.now();
  const now = Date.now();
  await refreshDbTokenSnapshot(now);
  if (Object.keys(state.activeCalls).length > 0) {
    state.session.status = "running";
  } else if (state.session.status === "running" && now - state.session.lastActiveAt > idleThresholdMs) {
    state.session.status = "idle";
  }

  // Validate and repair state before writing
  const { repaired, warnings } = validateState(state);
  for (const warning of warnings) {
    console.warn(`[omo-monitor] state validation: ${warning}`);
  }
  applyValidatedStateRepair(state, repaired);

  mkdirSync(dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.tmp`;
  const content = JSON.stringify(buildPersistedStateSnapshot(now), null, 2);
  writeFileSync(tempPath, content);
  renameSync(tempPath, statePath);

  // Circuit breaker health check after successful persist
  const tripReason = checkHealth(statePath);
  if (tripReason) {
    console.error(`[omo-monitor] Persist triggered circuit breaker: ${tripReason}`);
    emergencyStop(statePath);
  }
}
