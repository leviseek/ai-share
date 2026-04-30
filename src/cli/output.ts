import type { ProviderGroupMap } from "../types.ts";
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
  console.log("配置检查通过。");
  console.log(`OpenCode provider 数量：${input.selectedOpenCodeProviderCount}`);
  console.log(`已配置 provider 数量：${input.configuredProviderCount}`);
  console.log(`模型分组：${input.modelGroups.join(" / ")}`);
  console.log(`OMO 编排级别：${input.profileIds.join(" / ")}`);
  console.log(`默认 OMO 编排级别：${input.selectedDefaultProfileId}`);
  console.log(`模型组提供商：${formatProviderGroups(input.providerGroups)}`);
  if (input.missingApiKeys.length > 0) {
    console.warn(`API Key 环境变量未设置：${input.missingApiKeys.join(" / ")}`);
    process.exit(1);
  } else if (input.registryMismatches.length > 0) {
    console.warn(`OMO monitor agent registry 与 config/agents.yaml 不一致：${input.registryMismatches.join(" / ")}`);
    process.exit(1);
  } else {
    console.log("API Key 环境变量已设置。");
  }
  process.exit(0);
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
  console.log(`${prefix} OpenCode 配置：${input.paths.targetOpenCode}`);
  console.log(`${prefix} OpenCode TUI 配置：${input.paths.targetTui}`);
  console.log(`${prefix} OpenCode 级别配置：${formatProfileCommands(input.openCodeProfileIds)}`);
  console.log(`${prefix} oh-my-openagent 默认配置：${input.paths.targetOhMyOpenAgent}`);
  console.log(`${prefix} 共享策略默认配置：${input.paths.targetStrategy}`);
  console.log(`${prefix} OMO 级别清单：${input.paths.targetProfileManifest}`);
  console.log(`${prefix} 上下文守卫配置：${input.paths.targetContextGuard}`);
  console.log(`${prefix} OMO 级别配置：${formatProfileCommands(input.ohMyOpenAgentProfileIds)}`);
  console.log(`${prefix} 共享策略级别配置：${formatProfileCommands(input.strategyProfileIds)}`);
  console.log(`${installPrefix} 启动命令目录：${input.paths.targetBinDir}`);
  console.log(`${installPrefix} OpenCode 本地插件目录：${input.paths.targetPluginDir}`);
  console.log(`${installPrefix} OpenCode native skills 目录：${input.paths.targetSkillsDir}`);
  console.log(
    "说明：provider/model/profiles/agents/categories/runtime_fallback/background_task/tmux/plugin/strategy 均来自 config/*.yaml。",
  );
  console.log(`模型组提供商：${formatProviderGroups(input.providerGroups)}`);
  console.log("启动命令：aiomo [profile] = OMO 编排模式，aioc = OpenCode 原生 Build/Plan 模式。");
}

function formatProviderGroups(providerGroups: ProviderGroupMap): string {
  return Object.entries(providerGroups)
    .map(([groupId, providerId]) => `${groupId}=${providerId}`)
    .join(" / ");
}

function formatProfileCommands(profileIds: string[]): string {
  return profileIds.map((profileId) => `aiomo ${profileId}`).join(" / ");
}
