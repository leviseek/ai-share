#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildGenerationPreview, type GenerationPreview } from "../generation-preview.ts";
import { argsFromArgv, hasFlag, parseOptionValue } from "./args.ts";
import { collectConfigDiagnostics } from "./config-diagnostics.ts";
import { renderCheckReport, type CheckItem, type CheckReport, type CheckStatus } from "./check-output.ts";
import { summarizeLocalProxyChecks } from "./env-runtime-check.ts";
import { checkMemoryPrivacy } from "./memory-privacy-check.ts";
import { buildAiocLauncherFiles } from "./aioc-install.ts";
import { checkProviderCanaries, checkProviderModels } from "./provider-check.ts";
import { formatInstallRunResult, runInstall } from "./ai-install.ts";

const startedAt = performance.now();
const args = argsFromArgv();
const cliProvider = parseOptionValue(args, "--provider", { missingValue: "error" });
const cliTask = parseOptionValue(args, "--task", { missingValue: "error" });
const preview = await buildGenerationPreview({
  options: {
    force: false,
    dryRun: true,
    ...(cliProvider ? { provider: cliProvider } : {}),
    ...(cliTask ? { task: cliTask } : {}),
  },
  env: Bun.env,
  interactiveProviderSelection: false,
  interactiveOptionalSelection: false,
});
const paths = preview.paths;
const config = preview.loadedConfig.config;
const providerId = preview.providerDecision.id;
const provider = config.providers.providers[providerId];
if (!provider) throw new Error(`提供商未定义：${providerId}`);
const providersToCheck = [
  provider,
  ...Object.values(config.providers.providers).filter(
    (candidate) => candidate.always_include === true && candidate !== provider,
  ),
];
const canary = hasFlag(args, "--canary");
const online = hasFlag(args, "--online") || canary;
const checks: CheckItem[] = [];
const installResult = await runInstall({
  argv: [],
  env: Bun.env,
  projectRoot: paths.projectRoot,
  platform: process.platform,
});
const expectedConfig = preview.configJsonc;
const diagnostics = await collectConfigDiagnostics({
  paths,
  providers: providersToCheck,
  envConfig: config.env,
  globalConfig: config.global,
  expectedOpenCodeConfig: expectedConfig,
  launcherFiles: buildAiocLauncherFiles(paths),
});
const localProxySummary = summarizeLocalProxyChecks(diagnostics.localProxyChecks.value);

checks.push(
  {
    name: "tools",
    status: !installResult.ok ? "error" : installResult.tools.every((tool) => tool.installed) ? "ok" : "warning",
    summary: !installResult.ok
      ? "工具检测失败。"
      : installResult.hints.length === 0
        ? "工具已安装并配置。"
        : "工具未全部安装或仍有配置提示。",
    details: formatInstallRunResult(installResult, false),
  },
  diagnosticCheck(
    "api_key_env",
    diagnostics.missingApiKeys.value.length === 0,
    "API Key 环境变量已设置。",
    `缺少 API Key 环境变量：${diagnostics.missingApiKeys.value.join("、") || "unknown"}`,
  ),
  diagnosticCheck(
    "default_config",
    diagnostics.defaultConfigDrift.value.status === "current",
    "默认配置与生成源一致。",
    `默认配置状态：${formatDefaultConfigStatus(diagnostics.defaultConfigDrift.value.status)}`,
  ),
  diagnosticCheck(
    "opencode_env",
    diagnostics.envManagedBlockCurrent.value,
    ".env managed block 当前有效。",
    ".env managed block 缺失或漂移。",
  ),
  diagnosticCheck(
    "aioc_launcher",
    diagnostics.launcherFilesCurrent.value,
    "aioc 启动器当前有效。",
    "aioc 启动器缺失或漂移。",
  ),
  buildArchifyCheck(preview),
  diagnosticCheck(
    "runtime_versions",
    diagnostics.versionResults.value.every((entry) => entry.ok),
    "OpenCode 版本满足要求。",
    "OpenCode 版本不足或不可检测。",
    diagnostics.versionResults.value,
  ),
  {
    name: "local_proxy",
    status: localProxySummary.ok ? "ok" : "warning",
    summary: localProxySummary.summary,
    details: diagnostics.localProxyChecks.value,
  },
);

const privacy = checkMemoryPrivacy(paths.projectRoot);
checks.push({
  name: "memory_privacy",
  status: privacy.some((finding) => finding.severity === "error") ? "error" : privacy.length > 0 ? "warning" : "ok",
  summary: privacy.length === 0 ? "Memory privacy 检查通过。" : `Memory privacy 发现 ${privacy.length} 个问题。`,
  details: privacy,
});

if (online) {
  const common = { providerId, provider, modelIds: provider.models, models: config.models, env: Bun.env };
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

const report: CheckReport = {
  status: aggregateStatus(checks),
  online,
  canary,
  elapsed_ms: Math.max(0, Math.round(performance.now() - startedAt)),
  checks,
};
const jsonOutput = hasFlag(args, "--json");
if (jsonOutput) console.log(JSON.stringify(report, null, 2));
else console.log(renderCheckReport(report, providerId, process.stdout.isTTY && process.env.NO_COLOR === undefined));
const outputPath = parseOptionValue(args, "--output", { missingValue: "error" });
if (outputPath) await writeReport(outputPath, report);
process.exitCode = report.status === "error" ? 1 : 0;

function buildArchifyCheck(preview: GenerationPreview): CheckItem {
  const archify = preview.loadedConfig.archify.archify;
  const target = resolve(preview.paths.targetGlobalSkillsDir, archify.skill);
  const entries = [...preview.plan.actions, ...preview.plan.preserved, ...preview.plan.collisions].filter(
    (entry) => entry.path === target || entry.path.startsWith(`${target}${process.platform === "win32" ? "\\" : "/"}`),
  );
  const collision = entries.some(
    (entry) => entry.reason === "archify-ref-drift" || entry.reason === "archify-content-missing",
  );
  const missing = entries.some((entry) => entry.reason === "archify-not-installed");
  return {
    name: "archify",
    status: collision || missing ? "warning" : "ok",
    summary: !archify.enabled
      ? "Archify 已禁用。"
      : collision
        ? "Archify ownership 或 revision 需要修复。"
        : missing
          ? "Archify 尚未安装；如需使用请执行 bun run ai:archify。"
          : "Archify ownership 当前有效。",
    details: entries,
  };
}

function diagnosticCheck(name: string, ok: boolean, success: string, warning: string, details?: unknown): CheckItem {
  return {
    name,
    status: ok ? "ok" : "warning",
    summary: ok ? success : warning,
    ...(details === undefined ? {} : { details }),
  };
}

function aggregateStatus(checks: readonly CheckItem[]): CheckStatus {
  if (checks.some((check) => check.status === "error")) return "error";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ok";
}

function formatDefaultConfigStatus(status: "missing" | "current" | "drifted"): string {
  if (status === "missing") return "missing（缺失）";
  if (status === "current") return "current（当前有效）";
  return "drifted（已漂移）";
}

async function writeReport(path: string, report: CheckReport): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
