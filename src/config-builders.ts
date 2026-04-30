import { resolve } from "node:path";
import type {
  AgentsYaml,
  AgentSource,
  BackgroundTaskSource,
  GlobalYaml,
  ModelRoleMap,
  ModelsYaml,
  OmoProfileManifest,
  OhMyAgent,
  OhMyOpenAgentConfig,
  OpenCodeConfig,
  OpenCodeModel,
  OpenCodeProvider,
  ProfilesYaml,
  ProviderGroupMap,
  ProviderSource,
  RuntimeFallbackSource,
  SharedStrategyConfig,
  TuiConfig,
} from "./types.ts";

export function applyProviderGroups(
  modelSources: ModelsYaml,
  providerSources: Record<string, ProviderSource>,
  providerGroups: ProviderGroupMap,
): ModelsYaml {
  for (const [groupId, providerId] of Object.entries(providerGroups)) {
    if (!providerSources[providerId]) throw new Error(`模型组 ${groupId} 指向未定义提供商：${providerId}`);
  }

  return Object.fromEntries(
    Object.entries(modelSources).map(([modelId, model]) => [
      modelId,
      model.provider_group ? { ...model, provider: requireProviderGroup(model.provider_group, providerGroups) } : model,
    ]),
  );
}

export function modelProviderGroups(modelSources: ModelsYaml): string[] {
  return unique(Object.values(modelSources).map((model) => model.provider_group ?? model.provider ?? "未分组"));
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

export function buildContextGuardConfig(globalConfig: GlobalYaml): Required<NonNullable<GlobalYaml["context_guard"]>> {
  const source = globalConfig.context_guard ?? {};
  return {
    enabled: source.enabled ?? true,
    warn_ratio: source.warn_ratio ?? 0.5,
    danger_ratio: source.danger_ratio ?? 0.75,
    block_ratio: source.block_ratio ?? 0.9,
    absolute_block_tokens: source.absolute_block_tokens ?? 180000,
    rescue_dir: source.rescue_dir ?? ".opencode-rescue",
    diagnostics: source.diagnostics ?? true,
    watch_interval_ms: source.watch_interval_ms ?? 5000,
    zero_output_limit: source.zero_output_limit ?? 3,
    watch_action: source.watch_action ?? "stop",
    alert_file: source.alert_file ?? ".opencode/context-guard-alert.json",
  };
}

export function buildContextGuardProfileConfigs(
  globalConfig: GlobalYaml,
  profilesConfig: ProfilesYaml,
): Record<string, { max_input_tokens: number }> {
  return Object.fromEntries(
    Object.keys(requireRecord(profilesConfig, "profiles")).map((profileId) => [
      profileId,
      { max_input_tokens: maxInputTokensForProfile(globalConfig, profilesConfig[profileId]?.compaction) },
    ]),
  );
}

export function buildTuiConfig(globalConfig: GlobalYaml): TuiConfig {
  return {
    $schema: "https://opencode.ai/tui.json",
    plugin: globalConfig.tui?.plugins ?? [],
  };
}

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

export function buildStrategyConfigs(
  globalConfig: GlobalYaml,
  profilesConfig: ProfilesYaml,
  agentsConfig: AgentsYaml,
): Record<string, SharedStrategyConfig> {
  return Object.fromEntries(
    Object.keys(requireRecord(profilesConfig, "profiles")).map((profileId) => [
      profileId,
      buildStrategyConfig(globalConfig, profilesConfig, agentsConfig, profileId),
    ]),
  );
}

export function modelRef(modelId: string, modelSources: ModelsYaml, profileModels: ModelRoleMap = {}): string {
  const resolvedModelId = profileModels[modelId] ?? modelId;
  if (profileModels[resolvedModelId]) {
    throw new Error(`profile 模型别名不能递归引用：${modelId}`);
  }

  const provider = modelSources[resolvedModelId]?.provider;
  if (!provider) throw new Error(`模型缺少 provider 或未定义：${resolvedModelId}`);
  return `${provider}/${resolvedModelId}`;
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
    instructions: [resolve(projectRoot, "AI_GUIDELINES.md")],
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

function maxInputTokensForProfile(globalConfig: GlobalYaml, profileCompaction: GlobalYaml["compaction"]): number {
  const source = { ...globalConfig.compaction, ...profileCompaction };
  return source.max_input_tokens ?? globalConfig.context?.max_tokens ?? 120000;
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

function buildProviders(
  providerSources: Record<string, ProviderSource>,
  modelSources: ModelsYaml,
): Record<string, OpenCodeProvider> {
  const output: Record<string, OpenCodeProvider> = {};
  for (const [providerId, provider] of Object.entries(providerSources)) {
    const providerName = provider.name ?? formatName(providerId);
    const models = buildProviderModels(providerId, provider.short_name ?? providerId, modelSources);
    if (Object.keys(models).length === 0) continue;

    const options: OpenCodeProvider["options"] = {
      baseURL: requireString(provider.base_url, `providers.${providerId}.base_url`),
      apiKey: formatApiKey(requireString(provider.api_key, `providers.${providerId}.api_key`)),
    };
    if (provider.timeout !== undefined) options.timeout = provider.timeout;
    if (provider.chunkTimeout !== undefined) options.chunkTimeout = provider.chunkTimeout;

    output[providerId] = {
      name: providerName,
      npm: provider.npm ?? "@ai-sdk/openai-compatible",
      options,
      models,
    };
  }
  return output;
}

function buildProviderModels(
  providerId: string,
  providerShortName: string,
  modelSources: ModelsYaml,
): Record<string, OpenCodeModel> {
  const output: Record<string, OpenCodeModel> = {};
  for (const [modelId, model] of Object.entries(modelSources)) {
    if (model.provider !== providerId) continue;
    output[modelId] = {
      ...(model.model_name && model.model_name !== modelId ? { id: model.model_name } : {}),
      name: `${formatName(modelId)} (${providerShortName})`,
      ...(model.parameters ? { options: model.parameters } : {}),
    };
  }
  return output;
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

function resolveProviderId(providerId: string, modelSources: ModelsYaml): string {
  const groupProvider = Object.values(modelSources).find((model) => model.provider_group === providerId)?.provider;
  return groupProvider ?? providerId;
}

function withFallback(model: string, modelSources: ModelsYaml, extra: Partial<OhMyAgent> = {}): OhMyAgent {
  const fallback_models = modelFallbackRefs(model, modelSources);
  return {
    model,
    ...(fallback_models.length > 0 ? { fallback_models } : {}),
    ...extra,
  };
}

function modelFallbackRefs(model: string, modelSources: ModelsYaml): string[] {
  const modelId = model.split("/").at(-1) ?? model;
  const fallback = modelSources[modelId]?.fallback ?? [];
  return fallback.map((fallbackModel) => modelRef(fallbackModel, modelSources));
}

function requireProviderGroup(groupId: string, providerGroups: ProviderGroupMap): string {
  return requireString(providerGroups[groupId], `provider_group.${groupId}`);
}

function formatApiKey(value: string): string {
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(value);
  if (!match?.[1]) throw new Error(`api_key 必须使用 \${"{"}ENV_NAME} 格式：${value}`);
  return `{env:${match[1]}}`;
}

function formatName(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join(" ");
}

function requireString(value: string | undefined, label: string): string {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}

export function requireRecord<T>(value: Record<string, T> | undefined, label: string): Record<string, T> {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}

export function requireValue<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
