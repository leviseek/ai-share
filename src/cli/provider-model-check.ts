#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ModelsYaml, ProviderYaml } from "../types.ts";
import { applyProviderGroups } from "../config-builders.ts";
import { loadConfigYamlSync } from "../config/local-overlay.ts";
import { argsFromArgv, hasFlag, parseOptionValue } from "./args.ts";
import {
  checkProviderCanaries,
  checkProviderModels,
  type ProviderCanaryCheckResult,
  type ProviderCheckReport,
  type ProviderModelCheckResult,
} from "./provider-check.ts";
import { parseCliOptions } from "./options.ts";

export { checkProviderCanaries, checkProviderModels } from "./provider-check.ts";
export type { ProviderCanaryCheckResult, ProviderCheckReport, ProviderModelCheckResult } from "./provider-check.ts";

const projectRoot = resolve(import.meta.dirname, "..", "..");

if (import.meta.main) {
  const args = argsFromArgv(Bun.argv);
  const startedAt = performance.now();
  const providerConfig = loadYaml("provider.yaml") as ProviderYaml;
  const modelConfig = loadYaml("models.yaml") as ModelsYaml;
  const providerGroups = parseCliOptions().providerGroups;
  const canary = hasFlag(args, "--canary");
  const jsonOutput = hasFlag(args, "--json");
  const outputPath = parseOptionValue(args, "--output");
  const models = applyProviderGroups(modelConfig, providerConfig.providers ?? {}, providerGroups);
  const results = await checkProviderModels({
    providers: providerConfig.providers ?? {},
    models,
    env: Bun.env,
  });
  const canaryResults = canary
    ? await checkProviderCanaries({
        providers: providerConfig.providers ?? {},
        models,
        env: Bun.env,
      })
    : [];
  const report: ProviderCheckReport = {
    status:
      results.every((result) => result.status === "ok") && canaryResults.every((result) => result.status === "ok")
        ? "ok"
        : "error",
    canary,
    elapsed_ms: elapsedSince(startedAt),
    provider_groups: providerGroups,
    model_results: results,
    canary_results: canaryResults,
  };
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printProviderModelResults(results);
    if (canary) printProviderCanaryResults(canaryResults);
    console.log(`provider check elapsed: ${report.elapsed_ms}ms`);
  }
  if (outputPath) {
    writeJsonReport(outputPath, report);
    if (!jsonOutput) console.log(`provider check report: ${outputPath}`);
  }
  process.exit(report.status === "ok" ? 0 : 1);
}

function loadYaml(fileName: string): object {
  return loadConfigYamlSync(resolve(projectRoot, "config"), fileName);
}

function writeJsonReport(path: string, report: ProviderCheckReport): void {
  const resolvedPath = resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function printProviderModelResults(results: readonly ProviderModelCheckResult[]): void {
  for (const result of results) {
    if (result.status === "ok") {
      console.log(`✓ ${result.provider}: ${result.checked_model_names.length} models available`);
      continue;
    }

    const missing = result.missing_model_names.length > 0 ? ` missing=${result.missing_model_names.join(",")}` : "";
    const error = result.error ? ` ${result.error}` : "";
    console.log(`✗ ${result.provider}: ${result.status}${missing}${error}`);
  }
}

function printProviderCanaryResults(results: readonly ProviderCanaryCheckResult[]): void {
  for (const result of results) {
    const fingerprint = ` fingerprint=${shortRequestFingerprint(result.request_fingerprint)}`;
    if (result.status === "ok") {
      console.log(`✓ ${result.provider}/${result.model_id}: canary ok${fingerprint}`);
      continue;
    }

    const error = result.error ? ` ${result.error}` : "";
    console.log(`✗ ${result.provider}/${result.model_id}: ${result.status}${fingerprint}${error}`);
  }
}

function shortRequestFingerprint(fingerprint: string): string {
  return fingerprint.slice(0, 12);
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
