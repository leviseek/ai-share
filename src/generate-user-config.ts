#!/usr/bin/env bun

import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentsYaml, GlobalProxy, GlobalYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "./types.ts";
import {
  applyProviderGroups,
  buildAiocOpenCodeConfigs,
  buildContextGuardConfig,
  buildContextGuardProfileConfigs,
  buildOhMyOpenAgentConfigs,
  buildOpenCodeConfigs,
  buildProfileManifest,
  buildStrategyConfigs,
  buildTuiConfig,
  defaultProfileId,
  modelProviderGroups,
  requireValue,
} from "./config-builders.ts";
import { missingProviderApiKeyEnvNames } from "./cli/api-keys.ts";
import { writeJson } from "./cli/fs.ts";
import { installLaunchers, installNativeSkills, installPlugins } from "./cli/install.ts";
import { parseCliOptions } from "./cli/options.ts";
import { printCheckSummary, printGenerationSummary } from "./cli/output.ts";
import {
  buildGeneratorPaths,
  profileContextGuardPath,
  profileAiocOpenCodePath,
  profileOhMyOpenAgentPath,
  profileOpenCodePath,
  profileStrategyPath,
} from "./cli/paths.ts";
import { agentRegistryMismatches } from "./cli/registry-check.ts";
import { parseYamlObject } from "./yaml.ts";

const cliOptions = parseCliOptions();
const { force, dryRun, checkOnly, providerGroups } = cliOptions;
const paths = buildGeneratorPaths();

const [globalConfig, providersConfig, modelsConfig, profilesConfig, agentsConfig] = await Promise.all([
  loadYaml<GlobalYaml>("global.yaml"),
  loadYaml<ProviderYaml>("provider.yaml"),
  loadYaml<ModelsYaml>("models.yaml"),
  loadYaml<ProfilesYaml>("profiles.yaml"),
  loadYaml<AgentsYaml>("agents.yaml"),
]);

const providers = providersConfig.providers ?? {};
const models = applyProviderGroups(modelsConfig, providers, providerGroups);
const openCodeConfigs = buildOpenCodeConfigs(paths.projectRoot, globalConfig, providers, models, profilesConfig);
const aiocOpenCodeConfigs = buildAiocOpenCodeConfigs(openCodeConfigs, globalConfig);
const tuiConfig = buildTuiConfig(globalConfig);
const ohMyOpenAgentConfigs = buildOhMyOpenAgentConfigs(models, profilesConfig, agentsConfig);
const strategyConfigs = buildStrategyConfigs(globalConfig, profilesConfig, agentsConfig);
const contextGuardProfileConfigs = buildContextGuardProfileConfigs(globalConfig, profilesConfig);
const selectedDefaultProfileId = defaultProfileId(globalConfig, profilesConfig);
const selectedOpenCodeConfig = requireValue(openCodeConfigs[selectedDefaultProfileId], "默认 OpenCode profile");
const missingApiKeys = missingProviderApiKeyEnvNames(providers);
const registryMismatches = await agentRegistryMismatches(paths.pluginDir, agentsConfig);

if (checkOnly) {
  printCheckSummary({
    selectedOpenCodeProviderCount: Object.keys(selectedOpenCodeConfig.provider).length,
    configuredProviderCount: Object.keys(providers).length,
    modelGroups: modelProviderGroups(modelsConfig),
    profileIds: Object.keys(ohMyOpenAgentConfigs),
    selectedDefaultProfileId,
    providerGroups,
    missingApiKeys,
    registryMismatches,
  });
  process.exit(0);
}

if (registryMismatches.length > 0) {
  throw new Error(`OMO monitor agent registry 与 config/agents.yaml 不一致：${registryMismatches.join(" / ")}`);
}

if (!dryRun) await mkdir(paths.targetConfigDir, { recursive: true });
if (!dryRun) {
  await Promise.all([
    mkdir(paths.targetOpenCodeProfileDir, { recursive: true }),
    mkdir(paths.targetAiocProfileDir, { recursive: true }),
    mkdir(paths.targetOhMyOpenAgentProfileDir, { recursive: true }),
    mkdir(paths.targetStrategyProfileDir, { recursive: true }),
    mkdir(paths.targetContextGuardProfileDir, { recursive: true }),
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
for (const [profileId, ohMyOpenAgentConfig] of Object.entries(ohMyOpenAgentConfigs)) {
  await writeJson(profileOhMyOpenAgentPath(paths.targetConfigDir, profileId), ohMyOpenAgentConfig, { dryRun, force });
}
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
await writeJson(paths.targetProxy, buildProxyConfig(globalConfig), { dryRun, force });
await installPlugins(paths, dryRun);
await installNativeSkills(paths, dryRun, force);
await installLaunchers(paths, dryRun);

printGenerationSummary({
  dryRun,
  paths,
  openCodeProfileIds: Object.keys(openCodeConfigs),
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
