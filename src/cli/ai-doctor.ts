#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import type {
  AgentsYaml,
  EnvYaml,
  GlobalYaml,
  McpYaml,
  ModelsYaml,
  ProfileEvalYaml,
  ProfilesYaml,
  ProviderYaml,
} from "../types.ts";
import {
  applyProviderGroups,
  buildCodexCliConfigs,
  codexEnvManagedBlockIsCurrent,
  defaultProfileId,
  formatCodexConfigToml,
  modelProviderGroups,
  requireValue,
} from "../config-builders.ts";
import { missingProviderApiKeyEnvNames } from "./api-keys.ts";
import { color } from "./color.ts";
import { detectDefaultConfigDrift } from "./default-config-drift.ts";
import { checkCodexEnvLocalProxies } from "./env-runtime-check.ts";
import { checkMemoryPrivacy } from "./memory-privacy-check.ts";
import { parseCliOptions } from "./options.ts";
import { buildGeneratorPaths, profileCodexInstructionsPath } from "./paths.ts";
import { checkProviderCanaries, checkProviderModels } from "./provider-model-check.ts";
import { checkVersions } from "./registry-check.ts";
import { loadConfigYamlSync } from "../config/local-overlay.ts";
import { validateYamlConsistency } from "../config/validation.ts";

type DoctorStatus = "ok" | "warning" | "error";

type DoctorCheck = {
  name: string;
  status: DoctorStatus;
  summary: string;
  details?: unknown;
};

type DoctorReport = {
  status: DoctorStatus;
  strict_provider: boolean;
  checks: DoctorCheck[];
};

const args = new Set(Bun.argv.slice(2));
const jsonOutput = args.has("--json");
const strictProvider = args.has("--strict-provider");
const cliOptions = parseCliOptions();
const paths = buildGeneratorPaths();

const globalConfig = loadYaml("global.yaml") as GlobalYaml;
const providersConfig = loadYaml("provider.yaml") as ProviderYaml;
const modelsConfig = loadYaml("models.yaml") as ModelsYaml;
const profilesConfig = loadYaml("profiles.yaml") as ProfilesYaml;
const agentsConfig = loadYaml("agents.yaml") as AgentsYaml;
const mcpConfig = loadYaml("mcp.yaml") as McpYaml;
const envConfig = loadYaml("env.yaml") as EnvYaml;
const profileEvalConfig = loadYaml("profile-eval.yaml") as ProfileEvalYaml;

const checks: DoctorCheck[] = [];

const validationErrors = validateYamlConsistency(
  profilesConfig,
  modelsConfig,
  providersConfig,
  globalConfig,
  mcpConfig,
  agentsConfig,
  envConfig,
  profileEvalConfig,
);
checks.push({
  name: "yaml_consistency",
  status: validationErrors.length === 0 ? "ok" : "error",
  summary:
    validationErrors.length === 0 ? "YAML 配置一致性通过。" : `YAML 配置存在 ${validationErrors.length} 个错误。`,
  details: validationErrors,
});

const providers = providersConfig.providers ?? {};
const models = applyProviderGroups(modelsConfig, providers, cliOptions.providerGroups);
const codexCliConfigs = buildCodexCliConfigs(providers, models, profilesConfig, agentsConfig, mcpConfig, (profileId) =>
  profileCodexInstructionsPath(paths.targetCodexConfigDir, profileId),
);
const selectedDefaultProfileId = defaultProfileId(globalConfig, profilesConfig);
const selectedCodexCliConfig = requireValue(codexCliConfigs[selectedDefaultProfileId], "默认 Codex profile");
const selectedCodexBaseConfig = {
  ...selectedCodexCliConfig,
  model_instructions_file: paths.targetCodexInstructions,
};

const missingApiKeys = missingProviderApiKeyEnvNames(providers);
checks.push({
  name: "api_key_env",
  status: missingApiKeys.length === 0 ? "ok" : "warning",
  summary:
    missingApiKeys.length === 0 ? "API Key 环境变量已设置。" : `缺少 API Key 环境变量：${missingApiKeys.join(" / ")}`,
  details: missingApiKeys,
});

const defaultConfigDrift = await detectDefaultConfigDrift(
  paths.targetCodexConfig,
  formatCodexConfigToml(selectedCodexBaseConfig),
);
checks.push({
  name: "default_config_drift",
  status: defaultConfigDrift.status === "current" ? "ok" : "warning",
  summary:
    defaultConfigDrift.status === "current"
      ? `默认 config.toml 与 ${selectedDefaultProfileId} 等价。`
      : `默认 config.toml 状态：${defaultConfigDrift.status}。`,
  details: defaultConfigDrift,
});

const envManagedBlockCurrent = codexEnvManagedBlockIsCurrent(envConfig, readOptional(paths.targetCodexEnv));
checks.push({
  name: "codex_env_managed_block",
  status: envManagedBlockCurrent ? "ok" : "warning",
  summary: envManagedBlockCurrent ? ".env managed block 与 config/env.yaml 等价。" : ".env managed block 缺失或漂移。",
});

const versionResults = checkVersions(globalConfig);
checks.push({
  name: "runtime_versions",
  status: versionResults.every((result) => result.ok) ? "ok" : "warning",
  summary: versionResults.every((result) => result.ok)
    ? "Codex/OMX 版本满足最低要求。"
    : "Codex/OMX 版本低于最低要求或不可检测。",
  details: versionResults,
});

const localProxyChecks = await checkCodexEnvLocalProxies(envConfig);
checks.push({
  name: "local_proxy",
  status: localProxyChecks.every((result) => result.ok) ? "ok" : "warning",
  summary: localProxyChecks.every((result) => result.ok) ? "本地代理可达。" : "存在不可达的本地代理。",
  details: localProxyChecks,
});

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
  details: memoryFindings,
});

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
  details: providerResults,
});

if (strictProvider) {
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
    details: providerCanaryResults,
  });
}

checks.push({
  name: "generation_scope",
  status: "ok",
  summary: `配置范围：${Object.keys(providers).length} providers，${modelProviderGroups(modelsConfig).join(" / ")} groups，${Object.keys(codexCliConfigs).length} Codex profiles。`,
  details: {
    codex_home: paths.targetCodexConfigDir,
    default_profile: selectedDefaultProfileId,
    provider_groups: cliOptions.providerGroups,
  },
});

const report: DoctorReport = {
  status: aggregateStatus(checks),
  strict_provider: strictProvider,
  checks,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printDoctorReport(report);
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

function aggregateStatus(input: readonly DoctorCheck[]): DoctorStatus {
  if (input.some((check) => check.status === "error")) return "error";
  if (input.some((check) => check.status === "warning")) return "warning";
  return "ok";
}

function printDoctorReport(report: DoctorReport): void {
  const statusText =
    report.status === "ok" ? color.green("OK") : report.status === "warning" ? color.yellow("WARNING") : "ERROR";
  console.log(`${color.cyan("ai:doctor")}：${statusText}`);
  for (const check of report.checks) {
    const mark = check.status === "ok" ? color.green("✓") : check.status === "warning" ? color.yellow("!") : "✗";
    console.log(`${mark} ${check.name}: ${check.summary}`);
  }
}
