import { resolve } from "node:path";
import type {
  GlobalYaml,
  ModelRoleMap,
  ModelsYaml,
  OmoProfileManifest,
  OpenCodeConfig,
  ProfilesYaml,
  ProviderSource,
  TuiConfig,
} from "../../types.ts";
import { modelRef } from "../model-refs.ts";
import { buildProviders } from "./provider.ts";
import { requireRecord, requireString } from "../validation.ts";

export function buildInstructionsPaths(projectRoot: string): string[] {
  const memoryBase = resolve(projectRoot, "memory");
  return [
    resolve(projectRoot, "AI_GUIDELINES.md"),
    // memory/user/
    resolve(memoryBase, "user", "profile.md"),
    resolve(memoryBase, "user", "profile.yaml"),
    resolve(memoryBase, "user", "workflow.md"),
    resolve(memoryBase, "user", "workflows.yaml"),
    resolve(memoryBase, "user", "preferences.md"),
    resolve(memoryBase, "user", "devices.md"),
    resolve(memoryBase, "user", "devices.yaml"),
    resolve(memoryBase, "user", "toolchain.md"),
    resolve(memoryBase, "user", "prompts.md"),
    resolve(memoryBase, "user", "models.yaml"),
    // memory/architecture/
    resolve(memoryBase, "architecture", "coding-philosophy.md"),
    resolve(memoryBase, "architecture", "agent-patterns.md"),
    resolve(memoryBase, "architecture", "ai-desktop.md"),
    // memory/stack/
    resolve(memoryBase, "stack", "opencode.md"),
    resolve(memoryBase, "stack", "oh-my-openagent.md"),
    resolve(memoryBase, "stack", "wsl.md"),
    resolve(memoryBase, "stack", "models.md"),
  ];
}

export function buildOpenCodeConfigs(
  projectRoot: string,
  globalConfig: GlobalYaml,
  providerSources: Record<string, ProviderSource>,
  modelSources: ModelsYaml,
  profilesConfig: ProfilesYaml,
): Record<string, OpenCodeConfig> {
  return Object.fromEntries(
    Object.keys(requireRecord(profilesConfig, "profiles")).map((profileId) => [
      profileId,
      buildOpenCodeConfig(projectRoot, globalConfig, providerSources, modelSources, profilesConfig, profileId),
    ]),
  );
}

export function buildAiocOpenCodeConfigs(
  openCodeConfigs: Record<string, OpenCodeConfig>,
  globalConfig: GlobalYaml,
): Record<string, OpenCodeConfig> {
  const excludedPlugins = new Set(globalConfig.opencode?.aioc_excluded_plugins ?? ["oh-my-openagent@3.17.5"]);
  const isExcludedPlugin = excludedPluginMatcher(excludedPlugins);
  return Object.fromEntries(
    Object.entries(openCodeConfigs).map(([profileId, openCodeConfig]) => [
      profileId,
      {
        ...openCodeConfig,
        plugin: openCodeConfig.plugin.filter((plugin) => !isExcludedPlugin(plugin)),
      },
    ]),
  );
}

function excludedPluginMatcher(excludedPlugins: Set<string>): (plugin: string) => boolean {
  return (plugin) => excludedPlugins.has(plugin) || isOmoMonitorPlugin(plugin);
}

function isOmoMonitorPlugin(plugin: string): boolean {
  const normalized = plugin.replaceAll("\\", "/").replace(/^\.\//, "");
  return normalized === "plugins/omo-agent-monitor" || normalized.endsWith("/plugins/omo-agent-monitor");
}

export function buildTuiConfig(globalConfig: GlobalYaml): TuiConfig {
  return {
    $schema: "https://opencode.ai/tui.json",
    plugin: globalConfig.tui?.plugins ?? [],
  };
}

function buildOpenCodeConfig(
  projectRoot: string,
  globalConfig: GlobalYaml,
  providerSources: Record<string, ProviderSource>,
  modelSources: ModelsYaml,
  profilesConfig: ProfilesYaml,
  profileId: string,
): OpenCodeConfig {
  const profileModels = requireRecord(profilesConfig[profileId]?.models, `profiles.${profileId}.models`);
  const profilePrimaryModelRef = modelRef("primary", modelSources, profileModels);
  const profileFastModelRef = modelRef("fast", modelSources, profileModels);

  return {
    $schema: "https://opencode.ai/config.json",
    model: profilePrimaryModelRef,
    small_model: profileFastModelRef,
    instructions: buildInstructionsPaths(projectRoot),
    plugin: [
      ...(globalConfig.opencode?.plugins ?? ["oh-my-openagent@3.17.5"]),
      ...(globalConfig.opencode?.optional_plugins ?? []),
    ],
    compaction: buildCompactionConfig(globalConfig, profilesConfig[profileId]?.compaction),
    agent: {
      build: { mode: "primary", model: profilePrimaryModelRef, max_tokens: 8192 },
      plan: {
        mode: "primary",
        model: profilePrimaryModelRef,
        max_tokens: 4096,
        permission: { edit: "deny", bash: "ask" },
      },
      general: { mode: "subagent", model: profilePrimaryModelRef, max_tokens: 4096 },
      explore: { mode: "subagent", model: profileFastModelRef, max_tokens: 2048, permission: { edit: "deny" } },
      compaction: {
        model: compactionAgentModel(
          modelSources,
          profileModels,
          profilesConfig[profileId]?.compaction,
          profileFastModelRef,
        ),
      },
      title: { model: profileFastModelRef },
      summary: { model: profileFastModelRef },
    },
    provider: buildProviders(providerSources, modelSources),
  };
}

function buildCompactionConfig(
  globalConfig: GlobalYaml,
  profileCompaction: GlobalYaml["compaction"],
): OpenCodeConfig["compaction"] {
  const source = { ...globalConfig.compaction, ...profileCompaction };
  return {
    auto: source.enabled ?? true,
    prune: source.prune ?? true,
    reserved: source.reserved ?? compactionReservedTokens(globalConfig, source),
  };
}

function compactionAgentModel(
  modelSources: ModelsYaml,
  profileModels: ModelRoleMap,
  profileCompaction: GlobalYaml["compaction"],
  smallModelRef: string,
): string {
  const source = profileCompaction ?? {};
  return source.model ? modelRef(source.model, modelSources, profileModels) : smallModelRef;
}

function compactionReservedTokens(globalConfig: GlobalYaml, source: GlobalYaml["compaction"] = {}): number {
  const maxInputTokens = maxInputTokensForProfile(globalConfig, source);
  const threshold = source.threshold ?? Math.min(globalConfig.context?.max_tokens ?? 120000, 80000);
  return Math.max(0, maxInputTokens - threshold);
}

export function maxInputTokensForProfile(
  globalConfig: GlobalYaml,
  profileCompaction: GlobalYaml["compaction"],
): number {
  const source = { ...globalConfig.compaction, ...profileCompaction };
  return source.max_input_tokens ?? globalConfig.context?.max_tokens ?? 120000;
}

export function buildProfileManifest(
  profilesConfig: ProfilesYaml,
  selectedDefaultProfileId: string,
): OmoProfileManifest {
  return {
    default_profile: selectedDefaultProfileId,
    profiles: Object.keys(requireRecord(profilesConfig, "profiles")),
  };
}

export function defaultProfileId(globalConfig: GlobalYaml, profilesConfig: ProfilesYaml): string {
  const profiles = requireRecord(profilesConfig, "profiles");
  const configuredDefaultProfile = globalConfig.default_profile;
  if (configuredDefaultProfile) {
    if (!profiles[configuredDefaultProfile]) {
      throw new Error(`global.default_profile 指向未定义 OMO profile：${configuredDefaultProfile}`);
    }
    return configuredDefaultProfile;
  }

  if (profiles.balanced) return "balanced";
  return requireString(Object.keys(profiles)[0], "profiles 首个配置");
}
