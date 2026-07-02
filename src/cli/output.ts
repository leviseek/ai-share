import type { ProviderGroupMap } from "../types.ts";
import { color } from "./color.ts";
import type { DefaultConfigDrift } from "./default-config-drift.ts";
import type { LocalProxyRuntimeCheck } from "./env-runtime-check.ts";
import type { GeneratorPaths } from "./paths.ts";

export function printCheckSummary(input: {
  configuredProviderCount: number;
  modelGroups: string[];
  modelId: string;
  mcpServerIds: string[];
  codexEnvVarNames: string[];
  localConfigOverlays: string[];
  codexHome: string;
  providerGroups: ProviderGroupMap;
  missingApiKeys: string[];
  defaultConfigDrift: DefaultConfigDrift;
  localProxyChecks: LocalProxyRuntimeCheck[];
  envManagedBlockCurrent: boolean;
}): void {
  console.log(color.green("配置检查通过。"));
  console.log(`${color.cyan("已配置 provider 数量")}：${color.bold(String(input.configuredProviderCount))}`);
  console.log(`${color.cyan("模型分组")}：${color.magenta(input.modelGroups.join(" / "))}`);
  console.log(`${color.cyan("Codex 模型")}：${color.magenta(input.modelId)}`);
  console.log(
    `${color.cyan("MCP servers")}：${color.magenta(input.mcpServerIds.length > 0 ? input.mcpServerIds.join(" / ") : "none")}`,
  );
  console.log(
    `${color.cyan("Local config overlays")}：${color.magenta(input.localConfigOverlays.join(" / ") || "none")}`,
  );
  console.log(`${color.cyan("Codex .env 变量")}：${color.magenta(input.codexEnvVarNames.join(" / ") || "none")}`);
  console.log(
    `${color.cyan("Codex .env managed block")}：${
      input.envManagedBlockCurrent ? color.green("current") : color.yellow("missing/drifted")
    }`,
  );
  printLocalProxyChecks(input.localProxyChecks);
  console.log(`${color.cyan("Codex home")}：${color.bold(input.codexHome)}`);
  printDefaultConfigDrift(input.defaultConfigDrift);
  console.log(`${color.cyan("模型组提供商")}：${formatProviderGroups(input.providerGroups)}`);
  if (input.missingApiKeys.length > 0) {
    console.warn(`${color.yellow("API Key 环境变量未设置")}：${color.yellow(input.missingApiKeys.join(" / "))}`);
    process.exit(1);
  }
  console.log(color.green("API Key 环境变量已设置。"));
}

function printLocalProxyChecks(checks: readonly LocalProxyRuntimeCheck[]): void {
  if (checks.length === 0) {
    console.log(`${color.cyan("Codex .env 本地代理")}：${color.gray("none")}`);
    return;
  }

  for (const check of checks) {
    const target = `${check.host}:${check.port}`;
    const envNames = check.envNames.join(" / ");
    if (check.ok) {
      console.log(`${color.cyan("Codex .env 本地代理")}：${color.green("可达")} ${target}（${envNames}）`);
    } else {
      console.warn(
        `${color.yellow("Codex .env 本地代理不可达")}：${color.yellow(target)}（${envNames}）；请启动代理或修改 config/env.yaml。`,
      );
    }
  }
}

function printDefaultConfigDrift(drift: DefaultConfigDrift): void {
  if (drift.status === "current") {
    console.log(`${color.cyan("默认 config.toml")}：${color.green("current")}`);
    return;
  }
  if (drift.status === "missing") {
    console.log(`${color.cyan("默认 config.toml")}：${color.yellow("不存在，生成时会创建")} ${color.gray(drift.path)}`);
    return;
  }
  console.log(
    `${color.yellow("默认 config.toml 漂移")}：${color.yellow(drift.path)} 与当前 config/global.yaml 不等价；如需刷新请运行 bun run ai:gen -- --force。`,
  );
}

export function printGenerationSummary(input: {
  dryRun: boolean;
  force: boolean;
  paths: GeneratorPaths;
  modelId: string;
  providerGroups: ProviderGroupMap;
  mcpServerIds: string[];
}): void {
  const prefix = input.dryRun ? "将生成" : "已生成";
  const installPrefix = input.dryRun ? "将安装" : "已安装";
  const preserveHint = input.force ? "（--force 覆盖）" : "（存在时保留，--force 覆盖）";
  console.log(
    `${color.green(prefix)} ${color.cyan("Codex CLI 默认配置")}：${color.bold(input.paths.targetCodexConfig)}${color.gray(preserveHint)}`,
  );
  console.log(`${color.green(prefix)} ${color.cyan("Codex 模型")}：${color.magenta(input.modelId)}`);
  console.log(
    `${color.green(prefix)} ${color.cyan("Codex MCP servers")}：${color.magenta(input.mcpServerIds.length > 0 ? input.mcpServerIds.join(" / ") : "none")}`,
  );
  console.log(
    `${color.green(prefix)} ${color.cyan("Codex CLI .env")}：${color.bold(input.paths.targetCodexEnv)}${color.gray("（存在时保留，--force 覆盖）")}`,
  );
  console.log(
    `${color.green(prefix)} ${color.cyan("AI runtime 清单")}：${color.bold(input.paths.targetRuntimeManifest)}`,
  );
  console.log(
    `${color.green(installPrefix)} ${color.cyan("Codex native skills 目录")}：${color.bold(input.paths.targetCodexSkillsDir)}`,
  );
  console.log(
    `${color.gray("说明")}：provider/model/MCP/native skills 均来自 config/*.yaml 与 src/cli/native-skills.ts。`,
  );
  console.log(`${color.cyan("模型组提供商")}：${formatProviderGroups(input.providerGroups)}`);
  console.log(color.gray("启动命令由 Codex CLI 提供：codex。"));
}

function formatProviderGroups(providerGroups: ProviderGroupMap): string {
  return Object.entries(providerGroups)
    .map(([groupId, providerId]) => `${color.magenta(groupId)}=${color.bold(providerId)}`)
    .join(" / ");
}
