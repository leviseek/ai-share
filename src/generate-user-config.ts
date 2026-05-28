#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentsYaml, GlobalProxy, GlobalYaml, McpYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "./types.ts";
import {
  applyProviderGroups,
  buildAiocOpenCodeConfigs,
  buildCodexAgentConfigs,
  buildCodexCliConfigs,
  buildCodexInstructions,
  buildContextGuardConfig,
  buildContextGuardProfileConfigs,
  buildDingTalkNotifierConfig,
  buildOhMyOpenAgentConfigs,
  buildOpenCodeConfigs,
  buildOmxConfigs,
  buildProfileManifest,
  buildStrategyConfigs,
  buildTuiConfig,
  defaultProfileId,
  formatCodexAgentToml,
  formatCodexConfigToml,
  modelProviderGroups,
  requireValue,
} from "./config-builders.ts";
import { missingProviderApiKeyEnvNames } from "./cli/api-keys.ts";
import { pathExists, writeJson, writeText } from "./cli/fs.ts";
import { installLaunchers, installNativeSkills, installPlugins } from "./cli/install.ts";
import { ensureAiWorkspaceLinks } from "./cli/memory-link.ts";
import { parseCliOptions } from "./cli/options.ts";
import { scanPlugins, formatPluginScan } from "./cli/plugin-scanner.ts";
import { color } from "./cli/color.ts";
import { printCheckSummary, printGenerationSummary } from "./cli/output.ts";
import {
  buildGeneratorPaths,
  codexAgentConfigPath,
  profileCodexConfigPath,
  profileCodexInstructionsPath,
  profileContextGuardPath,
  profileAiocOpenCodePath,
  profileOhMyOpenAgentPath,
  profileOmxConfigPath,
  profileOpenCodePath,
  profileStrategyPath,
  type GeneratorPaths,
} from "./cli/paths.ts";
import { agentRegistryMismatches, checkVersions } from "./cli/registry-check.ts";
import { validateYamlConsistency } from "./config/validation.ts";
import { parseYamlObject } from "./yaml.ts";

const cliOptions = parseCliOptions();
const { force, dryRun, checkOnly, providerGroups } = cliOptions;
const paths = buildGeneratorPaths();

if (!checkOnly) {
  await ensureAiWorkspaceLinks(paths, dryRun);
  // Deprecation notice: ai-memory external repo no longer needed
  if (existsSync(resolve(paths.projectRoot, "..", "ai-memory"))) {
    console.warn(
      `${color.yellow("检测到 ../ai-memory 仓库仍存在")}：记忆已迁移到 ${color.cyan("memory/")}，外部 ai-memory 已不再使用。请手动归档此目录。`,
    );
  }
}

const [globalConfig, providersConfig, modelsConfig, profilesConfig, agentsConfig, mcpConfig] = await Promise.all([
  loadYaml<GlobalYaml>("global.yaml"),
  loadYaml<ProviderYaml>("provider.yaml"),
  loadYaml<ModelsYaml>("models.yaml"),
  loadYaml<ProfilesYaml>("profiles.yaml"),
  loadYaml<AgentsYaml>("agents.yaml"),
  loadYaml<McpYaml>("mcp.yaml"),
]);

const providers = providersConfig.providers ?? {};
const models = applyProviderGroups(modelsConfig, providers, providerGroups);
const openCodeConfigs = buildOpenCodeConfigs(paths.projectRoot, globalConfig, providers, models, profilesConfig);
const aiocOpenCodeConfigs = buildAiocOpenCodeConfigs(openCodeConfigs, globalConfig);
const codexCliConfigs = buildCodexCliConfigs(providers, models, profilesConfig, mcpConfig, (profileId) =>
  profileCodexInstructionsPath(paths.targetCodexConfigDir, profileId),
);
const selectedDefaultProfileId = defaultProfileId(globalConfig, profilesConfig);
const codexAgentConfigs = buildCodexAgentConfigs(agentsConfig, models, profilesConfig, selectedDefaultProfileId);
const tuiConfig = buildTuiConfig(globalConfig);
const ohMyOpenAgentConfigs = buildOhMyOpenAgentConfigs(models, profilesConfig, agentsConfig);
const omxConfigs = buildOmxConfigs(models, profilesConfig);
const strategyConfigs = buildStrategyConfigs(globalConfig, profilesConfig, agentsConfig);
const contextGuardProfileConfigs = buildContextGuardProfileConfigs(globalConfig, profilesConfig);
const selectedOpenCodeConfig = requireValue(openCodeConfigs[selectedDefaultProfileId], "默认 OpenCode profile");
const selectedCodexCliConfig = requireValue(codexCliConfigs[selectedDefaultProfileId], "默认 Codex profile");
const selectedCodexBaseConfig = {
  ...selectedCodexCliConfig,
  model_instructions_file: paths.targetCodexInstructions,
};
const missingApiKeys = missingProviderApiKeyEnvNames(providers);
const registryMismatches = await agentRegistryMismatches(paths.pluginDir, agentsConfig);

if (checkOnly) {
  const checkValidationErrors = validateYamlConsistency(profilesConfig, modelsConfig, providersConfig, globalConfig);
  if (checkValidationErrors.length > 0) {
    for (const err of checkValidationErrors) {
      console.error(`${color.yellow(`[${err.file}]`)} ${err.message}（${err.path}）`);
    }
    if (!force) {
      console.error("校验失败。使用 --force 可忽略校验继续生成。");
      process.exit(1);
    }
  }
  printCheckSummary({
    selectedOpenCodeProviderCount: Object.keys(selectedOpenCodeConfig.provider).length,
    configuredProviderCount: Object.keys(providers).length,
    modelGroups: modelProviderGroups(modelsConfig),
    profileIds: Object.keys(ohMyOpenAgentConfigs),
    codexProfileIds: Object.keys(codexCliConfigs),
    codexHome: paths.targetCodexConfigDir,
    selectedDefaultProfileId,
    providerGroups,
    missingApiKeys,
    registryMismatches,
  });

  // Version compatibility checks
  const versionResults = checkVersions(globalConfig, paths.pluginDir);
  if (versionResults.length > 0) {
    console.log("");
    for (const vr of versionResults) {
      if (!vr.ok) {
        console.warn(`${color.yellow(vr.name)} 版本 ${vr.current} 低于最低要求 ${vr.minimum}。建议升级。`);
      } else {
        console.log(`${color.green("✓")} ${vr.name} 版本 ${vr.current}（最低要求 ${vr.minimum}，通过）`);
      }
    }
  }

  // Plugin manifest auto-discovery
  const pluginScan = scanPlugins(paths.pluginDir);
  console.log(`\n本地插件扫描（${pluginScan.length} 个目录）：`);
  console.log(formatPluginScan(pluginScan));

  process.exit(0);
}

if (registryMismatches.length > 0) {
  throw new Error(`OMO monitor agent registry 与 config/agents.yaml 不一致：${registryMismatches.join(" / ")}`);
}

const genValidationErrors = validateYamlConsistency(profilesConfig, modelsConfig, providersConfig, globalConfig);
if (genValidationErrors.length > 0) {
  for (const err of genValidationErrors) {
    console.error(`${color.yellow(`[${err.file}]`)} ${err.message}（${err.path}）`);
  }
  if (!force) {
    throw new Error("YAML 配置校验失败。使用 --force 可忽略。");
  }
}

if (!dryRun) await mkdir(paths.targetConfigDir, { recursive: true });
if (!dryRun) {
  await Promise.all([
    mkdir(paths.targetOpenCodeProfileDir, { recursive: true }),
    mkdir(paths.targetAiocProfileDir, { recursive: true }),
    mkdir(paths.targetOhMyOpenAgentProfileDir, { recursive: true }),
    mkdir(paths.targetStrategyProfileDir, { recursive: true }),
    mkdir(paths.targetContextGuardProfileDir, { recursive: true }),
    mkdir(paths.targetCodexConfigDir, { recursive: true }),
    mkdir(paths.targetCodexAgentDir, { recursive: true }),
  ]);
}
for (const [profileId, openCodeConfig] of Object.entries(openCodeConfigs)) {
  await writeJson(profileOpenCodePath(paths.targetConfigDir, profileId), openCodeConfig, { dryRun, force });
}
for (const [profileId, aiocOpenCodeConfig] of Object.entries(aiocOpenCodeConfigs)) {
  await writeJson(profileAiocOpenCodePath(paths.targetConfigDir, profileId), aiocOpenCodeConfig, { dryRun, force });
}
await writeJson(paths.targetOpenCode, selectedOpenCodeConfig, { dryRun, force });
await writeJson(paths.targetTui, tuiConfig, { dryRun, force });
for (const [profileId, codexCliConfig] of Object.entries(codexCliConfigs)) {
  await writeText(
    profileCodexConfigPath(paths.targetCodexConfigDir, profileId),
    formatCodexConfigToml(codexCliConfig),
    {
      dryRun,
      force,
    },
  );
}
if (dryRun || !(await pathExists(paths.targetCodexConfig))) {
  await writeText(paths.targetCodexConfig, formatCodexConfigToml(selectedCodexBaseConfig), { dryRun, force });
} else {
  console.log(
    `${color.yellow("保留")} ${color.cyan("Codex CLI 现有默认配置")}：${color.bold(paths.targetCodexConfig)}（只更新 profile/agent/OMX 生成文件）`,
  );
}
await writeText(paths.targetCodexInstructions, buildCodexInstructions(paths.projectRoot, selectedDefaultProfileId), {
  dryRun,
  force,
});
for (const profileId of Object.keys(codexCliConfigs)) {
  await writeText(
    profileCodexInstructionsPath(paths.targetCodexConfigDir, profileId),
    buildCodexInstructions(paths.projectRoot, profileId),
    { dryRun, force },
  );
}
for (const [agentId, codexAgentConfig] of Object.entries(codexAgentConfigs)) {
  await writeText(codexAgentConfigPath(paths.targetCodexAgentDir, agentId), formatCodexAgentToml(codexAgentConfig), {
    dryRun,
    force,
  });
}
for (const [profileId, omxConfig] of Object.entries(omxConfigs)) {
  await writeJson(profileOmxConfigPath(paths.targetCodexConfigDir, profileId), omxConfig, { dryRun, force });
}
for (const [profileId, ohMyOpenAgentConfig] of Object.entries(ohMyOpenAgentConfigs)) {
  await writeJson(profileOhMyOpenAgentPath(paths.targetConfigDir, profileId), ohMyOpenAgentConfig, { dryRun, force });
}
await writeJson(paths.targetOmxConfig, requireValue(omxConfigs[selectedDefaultProfileId], "默认 OMX profile"), {
  dryRun,
  force,
});
await writeJson(
  paths.targetRuntimeManifest,
  buildRuntimeManifest(paths, Object.keys(codexCliConfigs), Object.keys(codexAgentConfigs)),
  { dryRun, force },
);
await writeJson(
  paths.targetOhMyOpenAgent,
  requireValue(ohMyOpenAgentConfigs[selectedDefaultProfileId], "默认 OMO profile"),
  {
    dryRun,
    force,
  },
);
for (const [profileId, strategyConfig] of Object.entries(strategyConfigs)) {
  await writeJson(profileStrategyPath(paths.targetConfigDir, profileId), strategyConfig, { dryRun, force });
}
await writeJson(paths.targetStrategy, requireValue(strategyConfigs[selectedDefaultProfileId], "默认共享策略 profile"), {
  dryRun,
  force,
});
for (const [profileId, contextGuardProfileConfig] of Object.entries(contextGuardProfileConfigs)) {
  await writeJson(profileContextGuardPath(paths.targetConfigDir, profileId), contextGuardProfileConfig, {
    dryRun,
    force,
  });
}
await writeJson(
  paths.targetContextGuardProfile,
  requireValue(contextGuardProfileConfigs[selectedDefaultProfileId], "默认 context guard profile"),
  { dryRun, force },
);
await writeJson(paths.targetProfileManifest, buildProfileManifest(profilesConfig, selectedDefaultProfileId), {
  dryRun,
  force,
});
await writeJson(paths.targetContextGuard, buildContextGuardConfig(globalConfig), { dryRun, force });
await writeJson(paths.targetDingTalkNotifier, buildDingTalkNotifierConfig(globalConfig), { dryRun, force });
await writeJson(paths.targetProxy, buildProxyConfig(globalConfig), { dryRun, force });
await installPlugins(paths, dryRun);
await installNativeSkills(paths, dryRun, force);
await installLaunchers(paths, dryRun);

printGenerationSummary({
  dryRun,
  paths,
  openCodeProfileIds: Object.keys(openCodeConfigs),
  codexProfileIds: Object.keys(codexCliConfigs),
  ohMyOpenAgentProfileIds: Object.keys(ohMyOpenAgentConfigs),
  strategyProfileIds: Object.keys(strategyConfigs),
  providerGroups,
});

async function loadYaml<T extends object>(fileName: string): Promise<T> {
  const value = parseYamlObject(await readFile(resolve(paths.configDir, fileName), "utf8"));
  return value as T;
}

type ProxyConfig = Required<Pick<GlobalProxy, "enabled" | "host" | "port" | "protocol">> & {
  no_proxy: string[];
};

type RuntimeManifest = {
  version: 1;
  scope: "user";
  primary_stack: "codex+omx";
  fallback_stack: "opencode+omo";
  platforms: ["windows", "macos"];
  memory: {
    v1: "load-existing-memory";
    v2: "proposal-distillation-review";
  };
  paths: {
    codex_home: string;
    opencode_config: string;
    bin: string;
    opencode_skills: string;
    codex_skills: string;
    plugins: string;
  };
  managed: {
    codex_profiles: string[];
    omx_profiles: string[];
    opencode_profiles: string[];
    codex_agents: string[];
  };
};

function buildRuntimeManifest(paths: GeneratorPaths, profileIds: string[], agentIds: string[]): RuntimeManifest {
  return {
    version: 1,
    scope: "user",
    primary_stack: "codex+omx",
    fallback_stack: "opencode+omo",
    platforms: ["windows", "macos"],
    memory: {
      v1: "load-existing-memory",
      v2: "proposal-distillation-review",
    },
    paths: {
      codex_home: paths.targetCodexConfigDir,
      opencode_config: paths.targetConfigDir,
      bin: paths.targetBinDir,
      opencode_skills: paths.targetSkillsDir,
      codex_skills: paths.targetCodexSkillsDir,
      plugins: paths.targetPluginDir,
    },
    managed: {
      codex_profiles: profileIds,
      omx_profiles: profileIds,
      opencode_profiles: profileIds,
      codex_agents: agentIds,
    },
  };
}

function buildProxyConfig(globalConfig: GlobalYaml): ProxyConfig {
  const proxy = globalConfig.proxy ?? {};
  return {
    enabled: proxy.enabled ?? true,
    host: proxy.host ?? "127.0.0.1",
    port: proxy.port ?? 7897,
    protocol: proxy.protocol ?? "http",
    no_proxy: proxy.no_proxy ?? ["localhost", "127.0.0.1", "::1"],
  };
}
