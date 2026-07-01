#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { EnvYaml, GlobalYaml, McpYaml, ModelsYaml, ProviderYaml } from "../types.ts";
import {
  applyProviderGroups,
  buildCodexCliConfig,
  codexEnvManagedBlockIsCurrent,
  formatCodexConfigToml,
  modelProviderGroups,
} from "../config-builders.ts";
import { missingProviderApiKeyEnvNames } from "./api-keys.ts";
import { color } from "./color.ts";
import { detectDefaultConfigDrift } from "./default-config-drift.ts";
import { checkCodexEnvLocalProxies } from "./env-runtime-check.ts";
import { checkMemoryPrivacy } from "./memory-privacy-check.ts";
import { parseCliOptions } from "./options.ts";
import { buildGeneratorPaths } from "./paths.ts";
import { checkProviderCanaries, checkProviderModels } from "./provider-model-check.ts";
import { checkVersions } from "./registry-check.ts";
import { listLocalConfigOverlaysSync, loadConfigYamlSync } from "../config/local-overlay.ts";
import { validateYamlConsistency } from "../config/validation.ts";

type DoctorStatus = "ok" | "warning" | "error";

type DoctorCheck = {
  name: string;
  status: DoctorStatus;
  summary: string;
  elapsed_ms: number;
  details?: unknown;
};

type DoctorReport = {
  status: DoctorStatus;
  strict_provider: boolean;
  elapsed_ms: number;
  checks: DoctorCheck[];
};

const doctorStartedAt = performance.now();
const args = new Set(Bun.argv.slice(2));
const jsonOutput = args.has("--json");
const strictProvider = args.has("--strict-provider");
const outputPath = parseOption(Bun.argv.slice(2), "--output");
const cliOptions = parseCliOptions();
const paths = buildGeneratorPaths();

const globalConfig = loadYaml("global.yaml") as GlobalYaml;
const providersConfig = loadYaml("provider.yaml") as ProviderYaml;
const modelsConfig = loadYaml("models.yaml") as ModelsYaml;
const mcpConfig = loadYaml("mcp.yaml") as McpYaml;
const envConfig = loadYaml("env.yaml") as EnvYaml;

const checks: DoctorCheck[] = [];

const validationStartedAt = performance.now();
const validationErrors = validateYamlConsistency(modelsConfig, providersConfig, globalConfig, mcpConfig, envConfig);
checks.push({
  name: "yaml_consistency",
  status: validationErrors.length === 0 ? "ok" : "error",
  summary:
    validationErrors.length === 0 ? "YAML 配置一致性通过。" : `YAML 配置存在 ${validationErrors.length} 个错误。`,
  elapsed_ms: elapsedSince(validationStartedAt),
  details: validationErrors,
});

const providers = providersConfig.providers ?? {};
const models = applyProviderGroups(modelsConfig, providers, cliOptions.providerGroups);
const codexCliConfig = buildCodexCliConfig(providers, models, globalConfig, mcpConfig, paths.targetCodexInstructions);

const apiKeyStartedAt = performance.now();
const missingApiKeys = missingProviderApiKeyEnvNames(providers);
const localConfigOverlays = listLocalConfigOverlaysSync(paths.configDir);
checks.push({
  name: "api_key_env",
  status: missingApiKeys.length === 0 ? "ok" : "warning",
  summary:
    missingApiKeys.length === 0 ? "API Key 环境变量已设置。" : `缺少 API Key 环境变量：${missingApiKeys.join(" / ")}`,
  elapsed_ms: elapsedSince(apiKeyStartedAt),
  details: missingApiKeys,
});

const defaultConfigDriftStartedAt = performance.now();
const defaultConfigDrift = await detectDefaultConfigDrift(
  paths.targetCodexConfig,
  formatCodexConfigToml(codexCliConfig),
);
checks.push({
  name: "default_config_drift",
  status: defaultConfigDrift.status === "current" ? "ok" : "warning",
  summary:
    defaultConfigDrift.status === "current"
      ? "默认 config.toml 与 config/global.yaml 等价。"
      : `默认 config.toml 状态：${defaultConfigDrift.status}。`,
  elapsed_ms: elapsedSince(defaultConfigDriftStartedAt),
  details: defaultConfigDrift,
});

const envManagedBlockStartedAt = performance.now();
const envManagedBlockCurrent = codexEnvManagedBlockIsCurrent(envConfig, readOptional(paths.targetCodexEnv));
checks.push({
  name: "codex_env_managed_block",
  status: envManagedBlockCurrent ? "ok" : "warning",
  summary: envManagedBlockCurrent ? ".env managed block 与 config/env.yaml 等价。" : ".env managed block 缺失或漂移。",
  elapsed_ms: elapsedSince(envManagedBlockStartedAt),
});

const runtimeVersionsStartedAt = performance.now();
const versionResults = checkVersions(globalConfig);
checks.push({
  name: "runtime_versions",
  status: versionResults.every((result) => result.ok) ? "ok" : "warning",
  summary: versionResults.every((result) => result.ok)
    ? "Codex 版本满足最低要求。"
    : "Codex 版本低于最低要求或不可检测。",
  elapsed_ms: elapsedSince(runtimeVersionsStartedAt),
  details: versionResults,
});

const localProxyStartedAt = performance.now();
const localProxyChecks = await checkCodexEnvLocalProxies(envConfig);
checks.push({
  name: "local_proxy",
  status: localProxyChecks.every((result) => result.ok) ? "ok" : "warning",
  summary: localProxyChecks.every((result) => result.ok) ? "本地代理可达。" : "存在不可达的本地代理。",
  elapsed_ms: elapsedSince(localProxyStartedAt),
  details: localProxyChecks,
});

const memoryPrivacyStartedAt = performance.now();
const memoryFindings = checkMemoryPrivacy(paths.projectRoot);
checks.push({
  name: "memory_privacy",
  status: memoryFindings.some((finding) => finding.severity === "error")
    ? "error"
    : memoryFindings.length > 0
      ? "warning"
      : "ok",
  summary:
    memoryFindings.length === 0
      ? "memory privacy check 通过。"
      : `memory privacy 发现 ${memoryFindings.length} 个问题。`,
  elapsed_ms: elapsedSince(memoryPrivacyStartedAt),
  details: memoryFindings,
});

const providerModelsStartedAt = performance.now();
const providerResults = await checkProviderModels({
  providers,
  models,
  env: Bun.env,
});
const providerOk = providerResults.every((result) => result.status === "ok");
checks.push({
  name: "provider_models",
  status: providerOk ? "ok" : strictProvider ? "error" : "warning",
  summary: providerOk
    ? "provider model 检查通过。"
    : strictProvider
      ? "provider model 检查失败。"
      : "provider model 检查存在 warning。",
  elapsed_ms: elapsedSince(providerModelsStartedAt),
  details: providerResults,
});

if (strictProvider) {
  const providerCanaryStartedAt = performance.now();
  const providerCanaryResults = await checkProviderCanaries({
    providers,
    models,
    env: Bun.env,
  });
  checks.push({
    name: "provider_canary",
    status: providerCanaryResults.every((result) => result.status === "ok") ? "ok" : "error",
    summary: providerCanaryResults.every((result) => result.status === "ok")
      ? "provider canary completion 检查通过。"
      : "provider canary completion 检查失败。",
    elapsed_ms: elapsedSince(providerCanaryStartedAt),
    details: providerCanaryResults,
  });
}

const generationScopeStartedAt = performance.now();
checks.push({
  name: "generation_scope",
  status: "ok",
  summary: `配置范围：${Object.keys(providers).length} providers，${modelProviderGroups(modelsConfig).join(" / ")} groups，Codex model ${globalConfig.model ?? "unknown"}。`,
  elapsed_ms: elapsedSince(generationScopeStartedAt),
  details: {
    codex_home: paths.targetCodexConfigDir,
    model: globalConfig.model,
    provider_groups: cliOptions.providerGroups,
    local_config_overlays: localConfigOverlays,
  },
});

const report: DoctorReport = {
  status: aggregateStatus(checks),
  strict_provider: strictProvider,
  elapsed_ms: elapsedSince(doctorStartedAt),
  checks,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printDoctorReport(report);
}
if (outputPath) {
  writeJsonReport(outputPath, report);
  if (!jsonOutput) console.log(`${color.cyan("ai:doctor report")}：${outputPath}`);
}

process.exit(report.status === "error" ? 1 : 0);

function loadYaml(fileName: string): object {
  return loadConfigYamlSync(paths.configDir, fileName);
}

function readOptional(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function parseOption(values: readonly string[], name: string): string | undefined {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) return values[index + 1];
    if (value?.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return undefined;
}

function writeJsonReport(path: string, report: DoctorReport): void {
  const resolvedPath = resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(
    resolvedPath,
    `${JSON.stringify(report, null, 2)}
`,
    "utf8",
  );
}

function aggregateStatus(input: readonly DoctorCheck[]): DoctorStatus {
  if (input.some((check) => check.status === "error")) return "error";
  if (input.some((check) => check.status === "warning")) return "warning";
  return "ok";
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function printDoctorReport(report: DoctorReport): void {
  const statusText =
    report.status === "ok" ? color.green("OK") : report.status === "warning" ? color.yellow("WARNING") : "ERROR";
  console.log(`${color.cyan("ai:doctor")}：${statusText} (${report.elapsed_ms}ms total)`);
  for (const check of report.checks) {
    const mark = check.status === "ok" ? color.green("✓") : check.status === "warning" ? color.yellow("!") : "✗";
    console.log(`${mark} ${check.name}: ${check.summary} (${check.elapsed_ms}ms)`);
  }
}
