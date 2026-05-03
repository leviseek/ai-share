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
  const contextCacheEnabled = globalConfig.context?.cache_enabled ?? true;
  return {
    $schema: "https://opencode.ai/ai-share-strategy.json",
    profile: profileId,
    workspace: { ignore: globalConfig.workspace?.ignore ?? [] },
    opencode: {
      dcp: buildCacheStrategy(contextCacheEnabled, globalConfig.dcp, profileStrategies?.opencode?.dcp),
      checkpoint: buildCacheStrategy(
        contextCacheEnabled,
        globalConfig.checkpoint,
        profileStrategies?.opencode?.checkpoint,
      ),
      memory: buildCacheStrategy(contextCacheEnabled, globalConfig.memory, profileStrategies?.opencode?.memory),
    },
    oh_my_openagent: {
      dcp: buildCacheStrategy(contextCacheEnabled, agentsConfig.dcp, profileStrategies?.oh_my_openagent?.dcp),
      checkpoint: buildCacheStrategy(
        contextCacheEnabled,
        agentsConfig.checkpoint,
        profileStrategies?.oh_my_openagent?.checkpoint,
      ),
      memory: buildCacheStrategy(contextCacheEnabled, agentsConfig.memory, profileStrategies?.oh_my_openagent?.memory),
    },
  };
}

function buildCacheStrategy(
  enabled: boolean,
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!enabled) return { enabled: false };
  return mergeStrategy(base, override) ?? { enabled: true };
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
