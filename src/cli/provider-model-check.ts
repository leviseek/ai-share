#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadValidatedConfig } from "../config/load.ts";
import { argsFromArgv, hasFlag, parseOptionValue } from "./args.ts";
import { resolveProviderId } from "./options.ts";
import { buildGeneratorPaths } from "./paths.ts";
import {
  checkProviderCanaries,
  checkProviderModels,
  type ProviderCanaryCheckResult,
  type ProviderCheckReport,
  type ProviderModelCheckResult,
} from "./provider-check.ts";

export { checkProviderCanaries, checkProviderModels } from "./provider-check.ts";
export type { ProviderCanaryCheckResult, ProviderCheckReport, ProviderModelCheckResult } from "./provider-check.ts";

if (import.meta.main) await main();

async function main(): Promise<void> {
  const args = argsFromArgv();
  const startedAt = performance.now();
  const paths = buildGeneratorPaths();
  const config = await loadValidatedConfig(paths.configDir);
  const cliProvider = parseOptionValue(args, "--provider", { missingValue: "error" });
  const providerId = resolveProviderId({
    ...(cliProvider ? { cliProvider } : {}),
    ...(Bun.env.AI_SHARE_PROVIDER ? { envProvider: Bun.env.AI_SHARE_PROVIDER } : {}),
    defaultProvider: config.global.provider,
  });
  const provider = config.providers.providers[providerId];
  if (!provider) throw new Error(`提供商未定义：${providerId}`);
  const canary = hasFlag(args, "--canary");
  const jsonOutput = hasFlag(args, "--json");
  const outputPath = parseOptionValue(args, "--output", { missingValue: "error" });
  const common = { providerId, provider, models: config.models, env: Bun.env };
  const modelResults = await checkProviderModels(common);
  const canaryResults = canary ? await checkProviderCanaries(common) : [];
  const report: ProviderCheckReport = {
    status:
      modelResults.every((result) => result.status === "ok") && canaryResults.every((result) => result.status === "ok")
        ? "ok"
        : "error",
    provider: providerId,
    canary,
    elapsed_ms: Math.max(0, Math.round(performance.now() - startedAt)),
    model_results: modelResults,
    canary_results: canaryResults,
  };
  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else printResults(modelResults, canaryResults, report.elapsed_ms);
  if (outputPath) await writeReport(outputPath, report);
  process.exitCode = report.status === "ok" ? 0 : 1;
}

function printResults(
  modelResults: readonly ProviderModelCheckResult[],
  canaryResults: readonly ProviderCanaryCheckResult[],
  elapsedMs: number,
): void {
  for (const result of modelResults) {
    const detail = result.error ?? result.missing_model_names.join(",");
    console.log(
      `${result.status === "ok" ? "✓" : "✗"} ${result.provider}: ${result.status}${detail ? ` ${detail}` : ""}`,
    );
  }
  for (const result of canaryResults) {
    console.log(
      `${result.status === "ok" ? "✓" : "✗"} ${result.provider}/${result.model_id}: ${result.status} fingerprint=${result.request_fingerprint.slice(0, 12)}`,
    );
  }
  console.log(`provider check elapsed: ${elapsedMs}ms`);
}

async function writeReport(path: string, report: ProviderCheckReport): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
