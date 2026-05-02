#!/usr/bin/env bun

import { check } from "./check.ts";
import { handoff } from "./handoff.ts";
import { rescue } from "./rescue.ts";
import { watch } from "./watch.ts";

const [, , command, ...args] = process.argv;

try {
  if (command === "check") process.exit(check(args));
  if (command === "rescue") process.exit(runCommand(rescue(args)));
  if (command === "handoff") process.exit(runCommand(handoff(args)));
  if (command === "watch") {
    if (!(await watch(args))) {
      usage();
      process.exit(2);
    }
  }
  usage();
  process.exit(2);
} catch (error) {
  console.error(`context guard failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

function runCommand(result: number | false): number {
  if (result === false) {
    usage();
    return 2;
  }
  return result;
}

function usage() {
  console.error("Usage:");
  console.error("  opencode-context-guard.ts check <launcher> <config> <guard-config> <db> -- <opencode args...>");
  console.error("  opencode-context-guard.ts rescue <launcher> <session-id> <guard-config> <db>");
  console.error("  opencode-context-guard.ts handoff <launcher> <session-id> <guard-config> <db> <cwd>");
  console.error(
    "  opencode-context-guard.ts watch <launcher> <config> <guard-config> <strategy-config> <db> <cwd> <parent-pid>",
  );
}
