import type { ProviderGroupMap } from "../types.ts";
import { color } from "./color.ts";
import type { GeneratorPaths } from "./paths.ts";

export function printCheckSummary(input: {
  configuredProviderCount: number;
  modelGroups: string[];
  codexProfileIds: string[];
  mcpServerIds: string[];
  codexHome: string;
  selectedDefaultProfileId: string;
  providerGroups: ProviderGroupMap;
  missingApiKeys: string[];
}): void {
  console.log(color.green("配置检查通过。"));
  console.log(`${color.cyan("已配置 provider 数量")}：${color.bold(String(input.configuredProviderCount))}`);
  console.log(`${color.cyan("模型分组")}：${color.magenta(input.modelGroups.join(" / "))}`);
  console.log(`${color.cyan("Codex CLI profile")}：${color.magenta(input.codexProfileIds.join(" / "))}`);
  console.log(`${color.cyan("MCP servers")}：${color.magenta(input.mcpServerIds.join(" / ") || "none")}`);
  console.log(`${color.cyan("Codex home")}：${color.bold(input.codexHome)}`);
  console.log(`${color.cyan("默认 Codex profile")}：${color.bold(input.selectedDefaultProfileId)}`);
  console.log(`${color.cyan("模型组提供商")}：${formatProviderGroups(input.providerGroups)}`);
  if (input.missingApiKeys.length > 0) {
    console.warn(`${color.yellow("API Key 环境变量未设置")}：${color.yellow(input.missingApiKeys.join(" / "))}`);
    process.exit(1);
  }
  console.log(color.green("API Key 环境变量已设置。"));
}

export function printGenerationSummary(input: {
  dryRun: boolean;
  paths: GeneratorPaths;
  codexProfileIds: string[];
  providerGroups: ProviderGroupMap;
}): void {
  const prefix = input.dryRun ? "将生成" : "已生成";
  const installPrefix = input.dryRun ? "将安装" : "已安装";
  console.log(
    `${color.green(prefix)} ${color.cyan("Codex CLI 默认配置")}：${color.bold(input.paths.targetCodexConfig)}${color.gray("（存在时保留）")}`,
  );
  console.log(`${color.green(prefix)} ${color.cyan("OMX 默认配置")}：${color.bold(input.paths.targetOmxConfig)}`);
  console.log(
    `${color.green(prefix)} ${color.cyan("AI runtime 清单")}：${color.bold(input.paths.targetRuntimeManifest)}`,
  );
  console.log(
    `${color.green(prefix)} ${color.cyan("Codex CLI profile")}：${color.magenta(input.codexProfileIds.map((profileId) => `codex --profile ${color.bold(profileId)}`).join(" / "))}`,
  );
  console.log(
    `${color.green(prefix)} ${color.cyan("Codex+OMX 启动 profile")}：${color.magenta(input.codexProfileIds.map((profileId) => `aiomx ${color.bold(profileId)}`).join(" / "))}`,
  );
  console.log(`${color.green(installPrefix)} ${color.cyan("启动命令目录")}：${color.bold(input.paths.targetBinDir)}`);
  console.log(
    `${color.green(installPrefix)} ${color.cyan("Codex native skills 目录")}：${color.bold(input.paths.targetCodexSkillsDir)}`,
  );
  console.log(
    `${color.gray("说明")}：provider/model/profiles/agents/MCP/native skills 均来自 config/*.yaml 与 src/cli/native-skills.ts。`,
  );
  console.log(`${color.cyan("模型组提供商")}：${formatProviderGroups(input.providerGroups)}`);
  console.log(color.gray("启动命令：aiomx [profile] = Codex + OMX。"));
}

function formatProviderGroups(providerGroups: ProviderGroupMap): string {
  return Object.entries(providerGroups)
    .map(([groupId, providerId]) => `${color.magenta(groupId)}=${color.bold(providerId)}`)
    .join(" / ");
}
