import type { ProviderGroupMap } from "../types.ts";
import { color } from "./color.ts";
import type { GeneratorPaths } from "./paths.ts";

export function printCheckSummary(input: {
  selectedOpenCodeProviderCount: number;
  configuredProviderCount: number;
  modelGroups: string[];
  profileIds: string[];
  selectedDefaultProfileId: string;
  providerGroups: ProviderGroupMap;
  missingApiKeys: string[];
  registryMismatches: string[];
}): void {
  console.log(color.green("配置检查通过。"));
  console.log(`${color.cyan("OpenCode provider 数量")}：${color.bold(String(input.selectedOpenCodeProviderCount))}`);
  console.log(`${color.cyan("已配置 provider 数量")}：${color.bold(String(input.configuredProviderCount))}`);
  console.log(`${color.cyan("模型分组")}：${color.magenta(input.modelGroups.join(" / "))}`);
  console.log(`${color.cyan("OMO 编排级别")}：${color.magenta(input.profileIds.join(" / "))}`);
  console.log(`${color.cyan("默认 OMO 编排级别")}：${color.bold(input.selectedDefaultProfileId)}`);
  console.log(`${color.cyan("模型组提供商")}：${formatProviderGroups(input.providerGroups)}`);
  if (input.missingApiKeys.length > 0) {
    console.warn(`${color.yellow("API Key 环境变量未设置")}：${color.yellow(input.missingApiKeys.join(" / "))}`);
    process.exit(1);
  } else if (input.registryMismatches.length > 0) {
    console.warn(
      `${color.yellow("OMO monitor agent registry 与 config/agents.yaml 不一致")}：${color.yellow(input.registryMismatches.join(" / "))}`,
    );
    process.exit(1);
  } else {
    console.log(color.green("API Key 环境变量已设置。"));
  }
}

export function printGenerationSummary(input: {
  dryRun: boolean;
  paths: GeneratorPaths;
  openCodeProfileIds: string[];
  ohMyOpenAgentProfileIds: string[];
  strategyProfileIds: string[];
  providerGroups: ProviderGroupMap;
}): void {
  const prefix = input.dryRun ? "将生成" : "已生成";
  const installPrefix = input.dryRun ? "将安装" : "已安装";
  console.log(`${color.green(prefix)} ${color.cyan("OpenCode 配置")}：${color.bold(input.paths.targetOpenCode)}`);
  console.log(`${color.green(prefix)} ${color.cyan("OpenCode TUI 配置")}：${color.bold(input.paths.targetTui)}`);
  console.log(
    `${color.green(prefix)} ${color.cyan("OpenCode 级别配置")}：${color.magenta(formatProfileCommands(input.openCodeProfileIds))}`,
  );
  console.log(
    `${color.green(prefix)} ${color.cyan("aioc 级别配置")}：${color.magenta(formatProfileCommands(input.openCodeProfileIds, "aioc"))}`,
  );
  console.log(
    `${color.green(prefix)} ${color.cyan("oh-my-openagent 默认配置")}：${color.bold(input.paths.targetOhMyOpenAgent)}`,
  );
  console.log(`${color.green(prefix)} ${color.cyan("共享策略默认配置")}：${color.bold(input.paths.targetStrategy)}`);
  console.log(`${color.green(prefix)} ${color.cyan("OMO 级别清单")}：${color.bold(input.paths.targetProfileManifest)}`);
  console.log(`${color.green(prefix)} ${color.cyan("上下文守卫配置")}：${color.bold(input.paths.targetContextGuard)}`);
  console.log(
    `${color.green(prefix)} ${color.cyan("OMO 级别配置")}：${color.magenta(formatProfileCommands(input.ohMyOpenAgentProfileIds))}`,
  );
  console.log(
    `${color.green(prefix)} ${color.cyan("共享策略级别配置")}：${color.magenta(formatProfileCommands(input.strategyProfileIds))}`,
  );
  console.log(`${color.green(installPrefix)} ${color.cyan("启动命令目录")}：${color.bold(input.paths.targetBinDir)}`);
  console.log(
    `${color.green(installPrefix)} ${color.cyan("OpenCode 本地插件目录")}：${color.bold(input.paths.targetPluginDir)}`,
  );
  console.log(
    `${color.green(installPrefix)} ${color.cyan("OpenCode native skills 目录")}：${color.bold(input.paths.targetSkillsDir)}`,
  );
  console.log(
    `${color.gray("说明")}：provider/model/profiles/agents/categories/runtime_fallback/background_task/tmux/plugin/strategy 均来自 config/*.yaml。`,
  );
  console.log(`${color.cyan("模型组提供商")}：${formatProviderGroups(input.providerGroups)}`);
  console.log(color.gray("启动命令：aiomo [profile] = OMO 编排模式，aioc = OpenCode 原生 Build/Plan 模式。"));
}

function formatProviderGroups(providerGroups: ProviderGroupMap): string {
  return Object.entries(providerGroups)
    .map(([groupId, providerId]) => `${color.magenta(groupId)}=${color.bold(providerId)}`)
    .join(" / ");
}

function formatProfileCommands(profileIds: string[], command: "aiomo" | "aioc" = "aiomo"): string {
  return profileIds.map((profileId) => `${color.green(command)} ${color.bold(profileId)}`).join(" / ");
}
