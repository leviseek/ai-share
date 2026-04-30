#!/usr/bin/env bun

import { check } from "./context-guard/check.mjs";
import { handoff } from "./context-guard/handoff.mjs";
import { rescue } from "./context-guard/rescue.mjs";
import { watch } from "./context-guard/watch.mjs";

const [, , command, ...args] = process.argv;

try {
  if (command === "check") process.exit(check(args));
  if (command === "rescue") process.exit(runCommand(rescue(args)));
  if (command === "handoff") process.exit(runCommand(handoff(args)));
  if (command === "watch") {
    if ((await watch(args)) === false) {
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

function runCommand(result) {
  if (result === false) {
    usage();
    return 2;
  }
  return result;
}

function usage() {
  console.error("Usage:");
  console.error("  opencode-context-guard.mjs check <launcher> <config> <guard-config> <db> -- <opencode args...>");
  console.error("  opencode-context-guard.mjs rescue <launcher> <session-id> <guard-config> <db>");
  console.error("  opencode-context-guard.mjs handoff <launcher> <session-id> <guard-config> <db> <cwd>");
  console.error(
    "  opencode-context-guard.mjs watch <launcher> <config> <guard-config> <strategy-config> <db> <cwd> <parent-pid>",
  );
}
