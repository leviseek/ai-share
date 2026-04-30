import type { AgentsYaml, GlobalYaml, ProfilesYaml, SharedStrategyConfig } from "../../types.ts";

export function buildStrategyConfigs(
  globalConfig: GlobalYaml,
  profilesConfig: ProfilesYaml,
  agentsConfig: AgentsYaml,
): Record<string, SharedStrategyConfig> {
  return Object.fromEntries(
    Object.keys(profilesConfig).map((profileId) => [
      profileId,
      buildStrategyConfig(globalConfig, profilesConfig, agentsConfig, profileId),
    ]),
  );
}

function buildStrategyConfig(
  globalConfig: GlobalYaml,
  profilesConfig: ProfilesYaml,
  agentsConfig: AgentsYaml,
  profileId: string,
): SharedStrategyConfig {
  const profileStrategies = profilesConfig[profileId]?.strategies;
  return {
    $schema: "https://opencode.ai/ai-share-strategy.json",
    profile: profileId,
    workspace: { ignore: globalConfig.workspace?.ignore ?? [] },
    opencode: {
      dcp: mergeStrategy(globalConfig.dcp, profileStrategies?.opencode?.dcp) ?? {},
      checkpoint: mergeStrategy(globalConfig.checkpoint, profileStrategies?.opencode?.checkpoint) ?? {},
      memory: mergeStrategy(globalConfig.memory, profileStrategies?.opencode?.memory) ?? {},
    },
    oh_my_openagent: {
      dcp: mergeStrategy(agentsConfig.dcp, profileStrategies?.oh_my_openagent?.dcp) ?? {},
      checkpoint: mergeStrategy(agentsConfig.checkpoint, profileStrategies?.oh_my_openagent?.checkpoint) ?? {},
      memory: mergeStrategy(agentsConfig.memory, profileStrategies?.oh_my_openagent?.memory) ?? {},
    },
  };
}

function mergeStrategy(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base) return override;
  if (!override) return base;

  return deepMerge(base, override);
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = output[key];
    output[key] = isPlainObject(baseValue) && isPlainObject(value) ? deepMerge(baseValue, value) : value;
  }
  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
