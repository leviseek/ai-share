import type {
  AgentsYaml,
  AgentSource,
  BackgroundTaskSource,
  ModelRoleMap,
  ModelsYaml,
  OhMyAgent,
  OhMyOpenAgentConfig,
  ProfilesYaml,
  RuntimeFallbackSource,
} from "../../types.ts";
import { modelFallbackRefs, modelRef, resolveProviderId } from "../model-refs.ts";
import { requireRecord, requireString, requireValue, unique } from "../validation.ts";

export function buildOhMyOpenAgentConfigs(
  modelSources: ModelsYaml,
  profilesConfig: ProfilesYaml,
  agentsConfig: AgentsYaml,
): Record<string, OhMyOpenAgentConfig> {
  return Object.fromEntries(
    Object.keys(requireRecord(profilesConfig, "profiles")).map((profileId) => [
      profileId,
      buildOhMyOpenAgentConfig(modelSources, profilesConfig, agentsConfig, profileId),
    ]),
  );
}

function buildOhMyOpenAgentConfig(
  modelSources: ModelsYaml,
  profilesConfig: ProfilesYaml,
  agentsConfig: AgentsYaml,
  profileId: string,
): OhMyOpenAgentConfig {
  const profileModels = requireRecord(profilesConfig[profileId]?.models, `profiles.${profileId}.models`);

  return {
    $schema: "https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/assets/oh-my-opencode.schema.json",
    model_fallback: agentsConfig.model_fallback ?? true,
    disabled_hooks: ["auto-slash-command"],
    agents: buildConfiguredAgents(requireRecord(agentsConfig.agents, "agents"), modelSources, profileModels),
    categories: buildConfiguredAgents(
      requireRecord(agentsConfig.categories, "categories"),
      modelSources,
      profileModels,
    ),
    runtime_fallback: buildRuntimeFallback(
      requireValue(agentsConfig.runtime_fallback, "runtime_fallback"),
      modelSources,
      profileModels,
    ),
    background_task: buildBackgroundTask(
      requireValue(agentsConfig.background_task, "background_task"),
      modelSources,
      profileModels,
    ),
    tmux: { enabled: agentsConfig.tmux?.enabled ?? false },
  };
}

function buildConfiguredAgents(
  agentSources: Record<string, AgentSource>,
  modelSources: ModelsYaml,
  profileModels: ModelRoleMap,
): Record<string, OhMyAgent> {
  return Object.fromEntries(
    Object.entries(agentSources).map(([agentId, agent]) => {
      const extra: Partial<OhMyAgent> = {};
      const promptAppend = agent.prompt?.append ?? agent.prompt?.system;
      if (promptAppend) extra.prompt_append = promptAppend.trim();
      if (agent.permission) extra.permission = agent.permission;

      return [
        agentId,
        withFallback(
          modelRef(requireString(agent.model, `agents.${agentId}.model`), modelSources, profileModels),
          modelSources,
          extra,
        ),
      ];
    }),
  );
}

function buildRuntimeFallback(
  source: RuntimeFallbackSource,
  modelSources: ModelsYaml,
  profileModels: ModelRoleMap,
): OhMyOpenAgentConfig["runtime_fallback"] {
  return {
    enabled: source.enabled ?? true,
    retry_on_errors: source.retry_on_errors ?? [],
    max_fallback_attempts: source.max_fallback_attempts ?? 1,
    cooldown_seconds: source.cooldown_seconds ?? 60,
    timeout_seconds: source.timeout_seconds ?? 30,
    notify_on_fallback: source.notify_on_fallback ?? true,
    model_whitelist: unique(
      (source.model_whitelist ?? []).map((modelId) => modelRef(modelId, modelSources, profileModels)),
    ),
  };
}

function buildBackgroundTask(
  source: BackgroundTaskSource,
  modelSources: ModelsYaml,
  profileModels: ModelRoleMap,
): OhMyOpenAgentConfig["background_task"] {
  return {
    providerConcurrency: buildProviderConcurrency(source.providerConcurrency ?? {}, modelSources),
    modelConcurrency: Object.fromEntries(
      Object.entries(source.modelConcurrency ?? {}).map(([modelId, concurrency]) => [
        modelRef(modelId, modelSources, profileModels),
        concurrency,
      ]),
    ),
  };
}

function buildProviderConcurrency(source: Record<string, number>, modelSources: ModelsYaml): Record<string, number> {
  const output: Record<string, number> = {};
  for (const [providerId, concurrency] of Object.entries(source)) {
    const resolvedProviderId = resolveProviderId(providerId, modelSources);
    output[resolvedProviderId] = Math.max(output[resolvedProviderId] ?? 0, concurrency);
  }
  return output;
}

function withFallback(model: string, modelSources: ModelsYaml, extra: Partial<OhMyAgent> = {}): OhMyAgent {
  const fallback_models = modelFallbackRefs(model, modelSources);
  return {
    model,
    ...(fallback_models.length > 0 ? { fallback_models } : {}),
    ...extra,
  };
}
