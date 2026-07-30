#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildCodexCliConfig, formatCodexConfigToml } from "../config-builders.ts";
import { loadValidatedConfig } from "../config/load.ts";
import { argsFromArgv, hasFlag, parseOptionValue } from "./args.ts";
import { collectConfigDiagnostics } from "./config-diagnostics.ts";
import { checkMemoryPrivacy } from "./memory-privacy-check.ts";
import { resolveProviderId } from "./options.ts";
import { buildGeneratorPaths } from "./paths.ts";
import { checkProviderCanaries, checkProviderModels } from "./provider-check.ts";

type DoctorStatus = "ok" | "warning" | "error";
type DoctorCheck = { name: string; status: DoctorStatus; summary: string; details?: unknown };
type DoctorReport = {
  status: DoctorStatus;
  online: boolean;
  canary: boolean;
  elapsed_ms: number;
  checks: DoctorCheck[];
};

const startedAt = performance.now();
const args = argsFromArgv();
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
const online = hasFlag(args, "--online") || canary;
const checks: DoctorCheck[] = [];
const expectedConfig = formatCodexConfigToml(buildCodexCliConfig(config, providerId, paths.targetCodexInstructions));
const diagnostics = await collectConfigDiagnostics({
  paths,
  provider,
  envConfig: config.env,
  globalConfig: config.global,
  expectedCodexConfig: expectedConfig,
  probeLocalProxy: online,
});

checks.push(
  diagnosticCheck(
    "api_key_env",
    diagnostics.missingApiKey.value === undefined,
    "API Key 环境变量已设置。",
    `缺少 API Key 环境变量：${diagnostics.missingApiKey.value ?? "unknown"}`,
  ),
  diagnosticCheck(
    "default_config",
    diagnostics.defaultConfigDrift.value.status === "current",
    "默认配置与生成源一致。",
    `默认配置状态：${diagnostics.defaultConfigDrift.value.status}`,
  ),
  diagnosticCheck(
    "codex_env",
    diagnostics.envManagedBlockCurrent.value,
    ".env managed block 当前有效。",
    ".env managed block 缺失或漂移。",
  ),
  diagnosticCheck(
    "runtime_versions",
    diagnostics.versionResults.value.every((entry) => entry.ok),
    "Codex 版本满足要求。",
    "Codex 版本不足或不可检测。",
    diagnostics.versionResults.value,
  ),
  diagnosticCheck(
    "local_proxy",
    diagnostics.localProxyChecks.value.every((entry) => entry.ok),
    online ? "本地代理可达或未配置。" : "离线模式未探测本地代理。",
    "存在不可达的本地代理。",
    diagnostics.localProxyChecks.value,
  ),
);

const privacy = checkMemoryPrivacy(paths.projectRoot);
checks.push({
  name: "memory_privacy",
  status: privacy.some((finding) => finding.severity === "error") ? "error" : privacy.length > 0 ? "warning" : "ok",
  summary: privacy.length === 0 ? "Memory privacy 检查通过。" : `Memory privacy 发现 ${privacy.length} 个问题。`,
  details: privacy,
});

if (online) {
  const common = { providerId, provider, models: config.models, env: Bun.env };
  const results = await checkProviderModels(common);
  checks.push({
    name: "provider_models",
    status: results.every((entry) => entry.status === "ok") ? "ok" : "warning",
    summary: results.every((entry) => entry.status === "ok")
      ? "Provider models 检查通过。"
      : "Provider models 检查存在问题。",
    details: results,
  });
  if (canary) {
    const results = await checkProviderCanaries(common);
    checks.push({
      name: "provider_canary",
      status: results.every((entry) => entry.status === "ok") ? "ok" : "warning",
      summary: results.every((entry) => entry.status === "ok")
        ? "Provider canary 检查通过。"
        : "Provider canary 检查存在问题。",
      details: results,
    });
  }
}

const report: DoctorReport = {
  status: aggregateStatus(checks),
  online,
  canary,
  elapsed_ms: Math.max(0, Math.round(performance.now() - startedAt)),
  checks,
};
const jsonOutput = hasFlag(args, "--json");
if (jsonOutput) console.log(JSON.stringify(report, null, 2));
else printReport(report, providerId);
const outputPath = parseOptionValue(args, "--output", { missingValue: "error" });
if (outputPath) await writeReport(outputPath, report);
process.exitCode = report.status === "error" ? 1 : 0;

function diagnosticCheck(name: string, ok: boolean, success: string, warning: string, details?: unknown): DoctorCheck {
  return {
    name,
    status: ok ? "ok" : "warning",
    summary: ok ? success : warning,
    ...(details === undefined ? {} : { details }),
  };
}

function aggregateStatus(checks: readonly DoctorCheck[]): DoctorStatus {
  if (checks.some((check) => check.status === "error")) return "error";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ok";
}

function printReport(report: DoctorReport, providerId: string): void {
  console.log(
    `ai:doctor ${report.status.toUpperCase()} provider=${providerId} online=${report.online} (${report.elapsed_ms}ms)`,
  );
  for (const check of report.checks)
    console.log(
      `${check.status === "ok" ? "✓" : check.status === "warning" ? "!" : "✗"} ${check.name}: ${check.summary}`,
    );
}

async function writeReport(path: string, report: DoctorReport): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
