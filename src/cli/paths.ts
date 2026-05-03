import { resolve } from "node:path";

export type GeneratorPaths = {
  projectRoot: string;
  configDir: string;
  binDir: string;
  contextGuardSourceDir: string;
  pluginDir: string;
  distPluginDir: string;
  homeDir: string;
  targetConfigDir: string;
  targetProfileDir: string;
  targetOpenCodeProfileDir: string;
  targetAiocProfileDir: string;
  targetOhMyOpenAgentProfileDir: string;
  targetStrategyProfileDir: string;
  targetContextGuardProfileDir: string;
  targetOpenCode: string;
  targetTui: string;
  targetOhMyOpenAgent: string;
  targetProfileManifest: string;
  targetContextGuard: string;
  targetContextGuardProfile: string;
  targetDingTalkNotifier: string;
  targetProxy: string;
  targetStrategy: string;
  targetBinDir: string;
  targetPluginDir: string;
  targetSkillsDir: string;
};

export function buildGeneratorPaths(projectRoot: string = resolve(import.meta.dir, "..", "..")): GeneratorPaths {
  const configDir = resolve(projectRoot, "config");
  const binDir = resolve(projectRoot, "bin");
  const contextGuardSourceDir = resolve(projectRoot, "src", "context-guard");
  const pluginDir = resolve(projectRoot, "plugins");
  const distPluginDir = resolve(projectRoot, "dist", "plugins");
  const homeDir = resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "");
  const targetConfigDir = resolve(homeDir, ".config", "opencode");
  const targetProfileDir = resolve(targetConfigDir, "profiles");
  const targetOpenCodeProfileDir = resolve(targetProfileDir, "opencode");
  const targetAiocProfileDir = resolve(targetProfileDir, "aioc");
  const targetOhMyOpenAgentProfileDir = resolve(targetProfileDir, "oh-my-openagent");
  const targetStrategyProfileDir = resolve(targetProfileDir, "strategy");
  const targetContextGuardProfileDir = resolve(targetProfileDir, "context-guard");

  if (!targetConfigDir.startsWith(homeDir)) {
    throw new Error("无法解析用户级 OpenCode 配置目录。请检查 HOME 或 USERPROFILE 环境变量。");
  }

  return {
    projectRoot: projectRoot,
    configDir: configDir,
    binDir: binDir,
    contextGuardSourceDir: contextGuardSourceDir,
    pluginDir: pluginDir,
    distPluginDir: distPluginDir,
    homeDir: homeDir,
    targetConfigDir: targetConfigDir,
    targetProfileDir: targetProfileDir,
    targetOpenCodeProfileDir: targetOpenCodeProfileDir,
    targetAiocProfileDir: targetAiocProfileDir,
    targetOhMyOpenAgentProfileDir: targetOhMyOpenAgentProfileDir,
    targetStrategyProfileDir: targetStrategyProfileDir,
    targetContextGuardProfileDir: targetContextGuardProfileDir,
    targetOpenCode: resolve(targetConfigDir, "opencode.json"),
    targetTui: resolve(targetConfigDir, "tui.json"),
    targetOhMyOpenAgent: resolve(targetConfigDir, "oh-my-openagent.json"),
    targetProfileManifest: resolve(targetConfigDir, ".omo-profiles.json"),
    targetContextGuard: resolve(targetConfigDir, "context-guard.json"),
    targetContextGuardProfile: resolve(targetConfigDir, "context-guard.profile.json"),
    targetDingTalkNotifier: resolve(targetConfigDir, "dingtalk-notifier.json"),
    targetProxy: resolve(targetConfigDir, "proxy.json"),
    targetStrategy: resolve(targetConfigDir, "strategy.json"),
    targetBinDir: resolve(homeDir, ".local", "bin"),
    targetPluginDir: resolve(targetConfigDir, "plugins"),
    targetSkillsDir: resolve(targetConfigDir, "skills"),
  };
}

export function profileOhMyOpenAgentPath(targetConfigDir: string, profileId: string): string {
  return resolve(targetConfigDir, "profiles", "oh-my-openagent", `${profileId}.json`);
}

export function profileStrategyPath(targetConfigDir: string, profileId: string): string {
  return resolve(targetConfigDir, "profiles", "strategy", `${profileId}.json`);
}

export function profileContextGuardPath(targetConfigDir: string, profileId: string): string {
  return contextGuardProfilePath(targetConfigDir, profileId);
}

export function profileOpenCodePath(targetConfigDir: string, profileId: string): string {
  return resolve(targetConfigDir, "profiles", "opencode", `${profileId}.json`);
}

export function profileAiocOpenCodePath(targetConfigDir: string, profileId: string): string {
  return resolve(targetConfigDir, "profiles", "aioc", `${profileId}.json`);
}

function contextGuardProfilePath(targetConfigDir: string, profileId: string): string {
  return resolve(targetConfigDir, "profiles", "context-guard", `${profileId}.json`);
}
