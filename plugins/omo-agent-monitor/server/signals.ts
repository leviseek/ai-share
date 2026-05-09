import { writeFileSync } from "node:fs";
import { state } from "./state.ts";
import { validateState } from "./validate.ts";
import type { Server } from "node:http";
import { buildPersistedStateSnapshot } from "./snapshot.ts";
import { applyValidatedStateRepair } from "./apply-validation.ts";

let registered = false;

export const serverRef: { current?: Server } = {};

function isWithinUnitTest(): boolean {
  return typeof process !== "undefined" && process.env?.["NODE_ENV"] === "test";
}

export function registerSignalHandlers(serverRefHolder: { current?: Server }, statePath: string): void {
  if (registered) return;
  registered = true;

  const onSignal = (_signal: string, exitCode: number): void => {
    state.session.status = "interrupted";
    try {
      const { repaired } = validateState(state);
      applyValidatedStateRepair(state, repaired);
      const content = JSON.stringify(buildPersistedStateSnapshot(Date.now()), null, 2);
      writeFileSync(statePath, content, "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[omo-monitor] signal handler persist error: ${message}`);
    }
    if (serverRefHolder.current) {
      try {
        serverRefHolder.current.close();
      } catch {
        // Best-effort close
      }
    }
    if (!isWithinUnitTest()) {
      process.exit(exitCode);
    }
  };

  process.on("SIGINT", () => onSignal("SIGINT", 130));
  process.on("SIGTERM", () => onSignal("SIGTERM", 143));
  process.on("SIGHUP", () => onSignal("SIGHUP", 129));
}
