#!/usr/bin/env bun

import { resolve } from "node:path";
import { ConfigValidationError, formatValidationError } from "./config/load.ts";
import { executeGenerationPlan, type GenerationPlan } from "./cli/generation-plan.ts";
import { parseCliOptions } from "./cli/options.ts";
import type { ProviderSelector } from "./cli/provider-select.ts";
import { buildGenerationPreview } from "./generation-preview.ts";
import type { CliOptions } from "./types.ts";

export type GenerationRunResult =
  | {
      ok: true;
      modelId: string;
      providerId: string;
      options: CliOptions;
      plan: GenerationPlan;
      overlays: string[];
    }
  | { ok: false; error: unknown; options?: CliOptions; plan?: GenerationPlan };

export async function runGeneration(
  input: {
    argv?: readonly string[];
    env?: Record<string, string | undefined>;
    projectRoot?: string;
    providerSelector?: ProviderSelector;
  } = {},
): Promise<GenerationRunResult> {
  let plan: GenerationPlan | undefined;
  let options: CliOptions | undefined;
  try {
    const env = input.env ?? Bun.env;
    options = parseCliOptions(input.argv ?? Bun.argv);
    const preview = await buildGenerationPreview({
      options,
      env,
      ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
      ...(input.providerSelector ? { providerSelector: input.providerSelector } : {}),
    });
    plan = preview.plan;

    if (plan.collisions.length > 0) {
      throw new Error(
        `存在 ${plan.collisions.length} 个未受管目标；未写入任何文件。请先备份，确认后使用 --force 显式接管。`,
      );
    }
    if (!options.dryRun) {
      await executeGenerationPlan(plan, resolve(preview.paths.targetCodexConfigDir, ".ai-share-staging"));
    }
    return {
      ok: true,
      modelId: preview.loadedConfig.config.global.model,
      providerId: preview.providerDecision.id,
      options,
      plan,
      overlays: preview.loadedConfig.overlays,
    };
  } catch (error) {
    return { ok: false, error, ...(options ? { options } : {}), ...(plan ? { plan } : {}) };
  }
}

export function printGenerationResult(result: GenerationRunResult): number {
  if (!result.ok) {
    if (result.plan) printPlan(result.plan, result.options?.dryRun ?? false);
    if (result.error instanceof ConfigValidationError) {
      for (const finding of result.error.errors) console.error(formatValidationError(finding));
    } else {
      console.error(result.error instanceof Error ? result.error.message : String(result.error));
    }
    return 1;
  }

  printPlan(result.plan, result.options.dryRun);
  console.log(
    `${result.options.dryRun ? "dry-run" : "完成"}：model=${result.modelId} provider=${result.providerId} actions=${result.plan.actions.length} preserved=${result.plan.preserved.length} overlays=${result.overlays.join(",") || "none"}`,
  );
  return 0;
}

if (import.meta.main) process.exitCode = printGenerationResult(await runGeneration());

function printPlan(plan: GenerationPlan, dryRun: boolean): void {
  const prefix = dryRun ? "PLAN" : "APPLY";
  for (const action of plan.actions) console.log(`${prefix} ${action.kind.toUpperCase()} ${action.path}`);
  for (const entry of plan.preserved) console.log(`${prefix} PRESERVE ${entry.path}`);
  for (const entry of plan.collisions) console.error(`${prefix} COLLISION ${entry.path}`);
}
