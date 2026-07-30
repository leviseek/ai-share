import type { CliOptions } from "../types.ts";
import { argsFromArgv, parseOptionValue } from "./args.ts";

const VALUE_OPTIONS = new Set(["--provider", "--task"]);
const FLAG_OPTIONS = new Set(["--force", "--dry-run"]);

export type ProviderDecisionSource = "cli" | "environment" | "global-config" | "interactive";

export type ProviderDecision = {
  id: string;
  source: ProviderDecisionSource;
};

export type TaskDecision = { value: string; source: "cli" | "environment" } | { source: "none" };

export function parseCliOptions(argv: readonly string[] = Bun.argv): CliOptions {
  const args = argsFromArgv(argv);
  validateGenerationArgs(args);
  const provider = parseOptionValue(args, "--provider", { missingValue: "error" });
  const task = parseOptionValue(args, "--task", { missingValue: "error" });
  return {
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
    ...(provider ? { provider } : {}),
    ...(task ? { task } : {}),
  };
}

export function resolveProviderId(input: {
  cliProvider?: string;
  envProvider?: string;
  defaultProvider: string;
}): string {
  return resolveProviderDecision(input).id;
}

export function resolveProviderDecision(input: {
  cliProvider?: string;
  envProvider?: string;
  defaultProvider: string;
}): ProviderDecision {
  if (input.cliProvider) return { id: input.cliProvider, source: "cli" };
  if (input.envProvider) return { id: input.envProvider, source: "environment" };
  return { id: input.defaultProvider, source: "global-config" };
}

export function resolveTaskDescription(input: { cliTask?: string; envTask?: string }): string | undefined {
  const decision = resolveTaskDecision(input);
  return decision.source === "none" ? undefined : decision.value;
}

export function resolveTaskDecision(input: { cliTask?: string; envTask?: string }): TaskDecision {
  if (input.cliTask) return { value: input.cliTask, source: "cli" };
  if (input.envTask) return { value: input.envTask, source: "environment" };
  return { source: "none" };
}

function validateGenerationArgs(args: readonly string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (FLAG_OPTIONS.has(arg)) continue;
    if ([...VALUE_OPTIONS].some((name) => arg.startsWith(`${name}=`))) continue;
    if (VALUE_OPTIONS.has(arg)) {
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${arg}`);
  }
}
