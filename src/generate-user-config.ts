#!/usr/bin/env bun

import { resolve } from "node:path";
import { buildCodexCliConfig, buildCodexInstructions, formatCodexConfigToml } from "./config-builders.ts";
import { ConfigValidationError, formatValidationError, loadValidatedConfig } from "./config/load.ts";
import { listLocalConfigOverlays } from "./config/local-overlay.ts";
import { buildGenerationPlan, executeGenerationPlan, type GenerationPlan } from "./cli/generation-plan.ts";
import { parseCliOptions, resolveProviderId, resolveTaskDescription } from "./cli/options.ts";
import { buildGeneratorPaths } from "./cli/paths.ts";
import { buildProviderChoices, selectProviderInteractive, type ProviderSelector } from "./cli/provider-select.ts";
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
    const paths = buildGeneratorPaths(input.projectRoot, env);
    const config = await loadValidatedConfig(paths.configDir);
    const providerId =
      options.provider ??
      (await selectProviderForGeneration({
        providers: config.providers.providers,
        ...(env.AI_SHARE_PROVIDER ? { envProvider: env.AI_SHARE_PROVIDER } : {}),
        defaultProvider: config.global.provider,
        ...(input.providerSelector ? { providerSelector: input.providerSelector } : {}),
      }));
    if (!config.providers.providers[providerId]) throw new Error(`提供商未定义：${providerId}`);
    const task = resolveTaskDescription({
      ...(options.task ? { cliTask: options.task } : {}),
      ...(env.AI_SHARE_TASK ? { envTask: env.AI_SHARE_TASK } : {}),
    });
    const codexConfig = buildCodexCliConfig(config, providerId, paths.targetCodexInstructions);
    plan = await buildGenerationPlan({
      paths,
      configToml: formatCodexConfigToml(codexConfig),
      instructions: buildCodexInstructions(paths.projectRoot, task),
      envConfig: config.env,
      force: options.force,
    });
    const overlays = await listLocalConfigOverlays(paths.configDir);

    if (plan.collisions.length > 0) {
      throw new Error(
        `存在 ${plan.collisions.length} 个未受管目标；未写入任何文件。请先备份，确认后使用 --force 显式接管。`,
      );
    }
    if (!options.dryRun) {
      await executeGenerationPlan(plan, resolve(paths.targetCodexConfigDir, ".ai-share-staging"));
    }
    return {
      ok: true,
      modelId: config.global.model,
      providerId,
      options,
      plan,
      overlays,
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
  for (const path of plan.preserved) console.log(`${prefix} PRESERVE ${path}`);
  for (const path of plan.collisions) console.error(`${prefix} COLLISION ${path}`);
}

async function selectProviderForGeneration(input: {
  providers: Parameters<typeof buildProviderChoices>[0];
  envProvider?: string;
  defaultProvider: string;
  providerSelector?: ProviderSelector;
}): Promise<string> {
  const initialProviderId = resolveProviderId({
    ...(input.envProvider ? { envProvider: input.envProvider } : {}),
    defaultProvider: input.defaultProvider,
  });
  const providerSelector =
    input.providerSelector ?? (process.stdin.isTTY && process.stdout.isTTY ? selectProviderInteractive : undefined);
  if (providerSelector) {
    const validInitialProviderId = input.providers[initialProviderId] ? initialProviderId : input.defaultProvider;
    return await providerSelector(buildProviderChoices(input.providers), validInitialProviderId);
  }
  if (!input.providers[initialProviderId]) throw new Error(`提供商未定义：${initialProviderId}`);
  return initialProviderId;
}
