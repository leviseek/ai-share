#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, cp, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AgentsYaml,
  AgentSource,
  BackgroundTaskSource,
  CliOptions,
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
  ProviderYaml,
  RuntimeFallbackSource,
  SharedStrategyConfig,
  TuiConfig,
} from "./types.ts";
import { parseYamlObject } from "./yaml.ts";

const cliOptions = parseCliOptions();
const { force, dryRun, checkOnly, providerGroups } = cliOptions;
const projectRoot = resolve(import.meta.dir, "..");
const configDir = resolve(projectRoot, "config");
const binDir = resolve(projectRoot, "bin");
const pluginDir = resolve(projectRoot, "plugins");
const homeDir = resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "");
const targetConfigDir = resolve(homeDir, ".config", "opencode");
const targetOpenCode = resolve(targetConfigDir, "opencode.json");
const targetTui = resolve(targetConfigDir, "tui.json");
const targetOhMyOpenAgent = resolve(targetConfigDir, "oh-my-openagent.json");
const targetProfileManifest = resolve(targetConfigDir, ".omo-profiles.json");
const targetContextGuard = resolve(targetConfigDir, "context-guard.json");
const targetContextGuardProfile = contextGuardProfilePath("profile");
const targetStrategy = resolve(targetConfigDir, "strategy.json");
const targetBinDir = resolve(homeDir, ".local", "bin");
const targetPluginDir = resolve(targetConfigDir, "plugins");
const targetSkillsDir = resolve(targetConfigDir, "skills");

if (!targetConfigDir.startsWith(homeDir)) {
  throw new Error("无法解析用户级 OpenCode 配置目录。请检查 HOME 或 USERPROFILE 环境变量。");
}

const [globalConfig, providersConfig, modelsConfig, profilesConfig, agentsConfig] = await Promise.all([
  loadYaml<GlobalYaml>("global.yaml"),
  loadYaml<ProviderYaml>("provider.yaml"),
  loadYaml<ModelsYaml>("models.yaml"),
  loadYaml<ProfilesYaml>("profiles.yaml"),
  loadYaml<AgentsYaml>("agents.yaml"),
]);

const providers = providersConfig.providers ?? {};
const models = applyProviderGroups(modelsConfig, providers, providerGroups);
const defaultModel = modelRef(pickDefaultModel(globalConfig, models), models);
const smallModel = modelRef(pickSmallModel(globalConfig, models), models);
const openCodeConfigs = buildOpenCodeConfigs(globalConfig, providers, models, profilesConfig, defaultModel, smallModel);
const tuiConfig = buildTuiConfig(globalConfig);
const ohMyOpenAgentConfigs = buildOhMyOpenAgentConfigs(models, profilesConfig, agentsConfig);
const strategyConfigs = buildStrategyConfigs(globalConfig, profilesConfig, agentsConfig);
const contextGuardProfileConfigs = buildContextGuardProfileConfigs(globalConfig, profilesConfig);
const selectedDefaultProfileId = defaultProfileId(globalConfig, profilesConfig);
const selectedOpenCodeConfig = requireValue(openCodeConfigs[selectedDefaultProfileId], "默认 OpenCode profile");

if (checkOnly) {
  const missingApiKeys = missingProviderApiKeyEnvNames(providers);
  console.log("配置检查通过。");
  console.log(`OpenCode provider 数量：${Object.keys(selectedOpenCodeConfig.provider).length}`);
  console.log(`已配置 provider 数量：${Object.keys(providers).length}`);
  console.log(`模型分组：${modelProviderGroups(modelsConfig).join(" / ")}`);
  console.log(`OMO 编排级别：${Object.keys(ohMyOpenAgentConfigs).join(" / ")}`);
  console.log(`默认 OMO 编排级别：${selectedDefaultProfileId}`);
  console.log(
    `模型组提供商：${Object.entries(providerGroups)
      .map(([groupId, providerId]) => `${groupId}=${providerId}`)
      .join(" / ")}`,
  );
  if (missingApiKeys.length > 0) {
    console.warn(`API Key 环境变量未设置：${missingApiKeys.join(" / ")}`);
    process.exit(1);
  } else {
    console.log("API Key 环境变量已设置。");
  }
  process.exit(0);
}

if (!dryRun) await mkdir(targetConfigDir, { recursive: true });
for (const [profileId, openCodeConfig] of Object.entries(openCodeConfigs)) {
  await writeJson(profileOpenCodePath(profileId), openCodeConfig);
}
await writeJson(targetOpenCode, selectedOpenCodeConfig);
await writeJson(targetTui, tuiConfig);
for (const [profileId, ohMyOpenAgentConfig] of Object.entries(ohMyOpenAgentConfigs)) {
  await writeJson(profileOhMyOpenAgentPath(profileId), ohMyOpenAgentConfig);
}
await writeJson(targetOhMyOpenAgent, requireValue(ohMyOpenAgentConfigs[selectedDefaultProfileId], "默认 OMO profile"));
for (const [profileId, strategyConfig] of Object.entries(strategyConfigs)) {
  await writeJson(profileStrategyPath(profileId), strategyConfig);
}
await writeJson(targetStrategy, requireValue(strategyConfigs[selectedDefaultProfileId], "默认共享策略 profile"));
for (const [profileId, contextGuardProfileConfig] of Object.entries(contextGuardProfileConfigs)) {
  await writeJson(profileContextGuardPath(profileId), contextGuardProfileConfig);
}
await writeJson(
  targetContextGuardProfile,
  requireValue(contextGuardProfileConfigs[selectedDefaultProfileId], "默认 context guard profile"),
);
await writeJson(targetProfileManifest, buildProfileManifest(profilesConfig, selectedDefaultProfileId));
await writeJson(targetContextGuard, buildContextGuardConfig(globalConfig));
await installPlugins();
await installNativeSkills();
await installLaunchers();

console.log(`${dryRun ? "将生成" : "已生成"} OpenCode 配置：${targetOpenCode}`);
console.log(`${dryRun ? "将生成" : "已生成"} OpenCode TUI 配置：${targetTui}`);
console.log(
  `${dryRun ? "将生成" : "已生成"} OpenCode 级别配置：${Object.keys(openCodeConfigs)
    .map((profileId) => `aiomo ${profileId}`)
    .join(" / ")}`,
);
console.log(`${dryRun ? "将生成" : "已生成"} oh-my-openagent 默认配置：${targetOhMyOpenAgent}`);
console.log(`${dryRun ? "将生成" : "已生成"} 共享策略默认配置：${targetStrategy}`);
console.log(`${dryRun ? "将生成" : "已生成"} OMO 级别清单：${targetProfileManifest}`);
console.log(`${dryRun ? "将生成" : "已生成"} 上下文守卫配置：${targetContextGuard}`);
console.log(
  `${dryRun ? "将生成" : "已生成"} OMO 级别配置：${Object.keys(ohMyOpenAgentConfigs)
    .map((profileId) => `aiomo ${profileId}`)
    .join(" / ")}`,
);
console.log(
  `${dryRun ? "将生成" : "已生成"} 共享策略级别配置：${Object.keys(strategyConfigs)
    .map((profileId) => `aiomo ${profileId}`)
    .join(" / ")}`,
);
console.log(`${dryRun ? "将安装" : "已安装"} 启动命令目录：${targetBinDir}`);
console.log(`${dryRun ? "将安装" : "已安装"} OpenCode 本地插件目录：${targetPluginDir}`);
console.log(`${dryRun ? "将安装" : "已安装"} OpenCode native skills 目录：${targetSkillsDir}`);
console.log(
  "说明：provider/model/profiles/agents/categories/runtime_fallback/background_task/tmux/plugin/strategy 均来自 config/*.yaml。",
);
console.log(
  `模型组提供商：${Object.entries(providerGroups)
    .map(([groupId, providerId]) => `${groupId}=${providerId}`)
    .join(" / ")}`,
);
console.log("启动命令：aiomo [profile] = OMO 编排模式，aioc = OpenCode 原生 Build/Plan 模式。");

async function loadYaml<T extends object>(fileName: string): Promise<T> {
  const value = parseYamlObject(await readFile(resolve(configDir, fileName), "utf8"));
  return value as T;
}

function parseCliOptions(): CliOptions {
  const args = new Set(Bun.argv.slice(2));
  return {
    force: args.has("--force"),
    dryRun: args.has("--dry-run"),
    checkOnly: args.has("--check"),
    providerGroups: parseProviderGroups(),
  };
}

function parseOption(name: string): string | undefined {
  const values = Bun.argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) return values[index + 1];
    if (value?.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return undefined;
}

function parseProviderGroups(): ProviderGroupMap {
  return {
    gpt: parseOption("--gpt-provider") ?? Bun.env.AI_SHARE_GPT_PROVIDER ?? "codexapis",
    deepseek: Bun.env.AI_SHARE_DEEPSEEK_PROVIDER ?? "deepseek",
    ...parseProviderGroupOptions(),
  };
}

function parseProviderGroupOptions(): ProviderGroupMap {
  const output: ProviderGroupMap = {};
  for (const value of parseOptions("--provider-group")) {
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error(`--provider-group 必须使用 group=provider 格式：${value}`);
    }
    output[value.slice(0, separatorIndex)] = value.slice(separatorIndex + 1);
  }
  return output;
}

function parseOptions(name: string): string[] {
  const output: string[] = [];
  const values = Bun.argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) {
      const nextValue = values[index + 1];
      if (!nextValue) throw new Error(`缺少参数值：${name}`);
      output.push(nextValue);
    }
    if (value?.startsWith(`${name}=`)) output.push(value.slice(name.length + 1));
  }
  return output;
}

function applyProviderGroups(
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

function requireProviderGroup(groupId: string, providerGroups: ProviderGroupMap): string {
  return requireString(providerGroups[groupId], `provider_group.${groupId}`);
}

function missingProviderApiKeyEnvNames(providerSources: Record<string, ProviderSource>): string[] {
  return Object.values(providerSources)
    .map((provider) => apiKeyEnvName(formatApiKey(requireString(provider.api_key, "providers.*.api_key"))))
    .filter((envName): envName is string => Boolean(envName))
    .filter((envName) => !Bun.env[envName]);
}

function modelProviderGroups(modelSources: ModelsYaml): string[] {
  return unique(Object.values(modelSources).map((model) => model.provider_group ?? model.provider ?? "未分组"));
}

function apiKeyEnvName(value: string): string | undefined {
  return /^\{env:([A-Z0-9_]+)\}$/.exec(value)?.[1];
}

function buildOpenCodeConfigs(
  globalConfig: GlobalYaml,
  providerSources: Record<string, ProviderSource>,
  modelSources: ModelsYaml,
  profilesConfig: ProfilesYaml,
  defaultModelRef: string,
  smallModelRef: string,
): Record<string, OpenCodeConfig> {
  return Object.fromEntries(
    Object.keys(requireRecord(profilesConfig, "profiles")).map((profileId) => [
      profileId,
      buildOpenCodeConfig(
        globalConfig,
        providerSources,
        modelSources,
        profilesConfig,
        profileId,
        defaultModelRef,
        smallModelRef,
      ),
    ]),
  );
}

function buildOpenCodeConfig(
  globalConfig: GlobalYaml,
  providerSources: Record<string, ProviderSource>,
  modelSources: ModelsYaml,
  profilesConfig: ProfilesYaml,
  profileId: string,
  defaultModelRef: string,
  smallModelRef: string,
): OpenCodeConfig {
  const profileModels = requireRecord(profilesConfig[profileId]?.models, `profiles.${profileId}.models`);

  return {
    $schema: "https://opencode.ai/config.json",
    model: defaultModelRef,
    small_model: smallModelRef,
    instructions: [resolve(projectRoot, "AI_GUIDELINES.md")],
    plugin: [
      ...(globalConfig.opencode?.plugins ?? ["oh-my-openagent@3.17.5"]),
      ...(globalConfig.opencode?.optional_plugins ?? []),
    ],
    compaction: buildCompactionConfig(globalConfig, profilesConfig[profileId]?.compaction),
    agent: {
      build: { mode: "primary", model: defaultModelRef, max_tokens: 8192 },
      plan: {
        mode: "primary",
        model: defaultModelRef,
        max_tokens: 4096,
        permission: { edit: "deny", bash: "ask" },
      },
      general: { mode: "subagent", model: defaultModelRef, max_tokens: 4096 },
      explore: { mode: "subagent", model: smallModelRef, max_tokens: 2048, permission: { edit: "deny" } },
      compaction: {
        model: compactionAgentModel(modelSources, profileModels, profilesConfig[profileId]?.compaction, smallModelRef),
      },
      title: { model: smallModelRef },
      summary: { model: smallModelRef },
    },
    provider: buildProviders(providerSources, modelSources),
  };
}

function buildContextGuardConfig(globalConfig: GlobalYaml): Required<NonNullable<GlobalYaml["context_guard"]>> {
  const source = globalConfig.context_guard ?? {};
  return {
    enabled: source.enabled ?? true,
    warn_ratio: source.warn_ratio ?? 0.5,
    danger_ratio: source.danger_ratio ?? 0.75,
    block_ratio: source.block_ratio ?? 0.9,
    absolute_block_tokens: source.absolute_block_tokens ?? 180000,
    rescue_dir: source.rescue_dir ?? ".opencode-rescue",
    diagnostics: source.diagnostics ?? true,
  };
}

function buildContextGuardProfileConfigs(
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

function buildTuiConfig(globalConfig: GlobalYaml): TuiConfig {
  return {
    $schema: "https://opencode.ai/tui.json",
    plugin: globalConfig.tui?.plugins ?? [],
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

function buildOhMyOpenAgentConfigs(
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

function buildStrategyConfigs(
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

function pickDefaultModel(globalConfig: GlobalYaml, modelSources: ModelsYaml): string {
  if (globalConfig.models?.default) return globalConfig.models.default;
  if (modelSources["gpt-5.5"]) return "gpt-5.5";
  return requireString(Object.keys(modelSources)[0], "models 首个模型");
}

function pickSmallModel(globalConfig: GlobalYaml, modelSources: ModelsYaml): string {
  if (globalConfig.models?.small) return globalConfig.models.small;
  const modelId = Object.entries(modelSources).find(
    ([, model]) => model.capabilities?.includes("cheap") ?? model.capabilities?.includes("fast") ?? false,
  )?.[0];
  return modelId ?? pickDefaultModel(globalConfig, modelSources);
}

function modelRef(modelId: string, modelSources: ModelsYaml, profileModels: ModelRoleMap = {}): string {
  const resolvedModelId = profileModels[modelId] ?? modelId;
  if (profileModels[resolvedModelId]) {
    throw new Error(`profile 模型别名不能递归引用：${modelId}`);
  }

  const provider = modelSources[resolvedModelId]?.provider;
  if (!provider) throw new Error(`模型缺少 provider 或未定义：${resolvedModelId}`);
  return `${provider}/${resolvedModelId}`;
}

function buildProfileManifest(profilesConfig: ProfilesYaml, selectedDefaultProfileId: string): OmoProfileManifest {
  return {
    default_profile: selectedDefaultProfileId,
    profiles: Object.keys(requireRecord(profilesConfig, "profiles")),
  };
}

function defaultProfileId(globalConfig: GlobalYaml, profilesConfig: ProfilesYaml): string {
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

function profileOhMyOpenAgentPath(profileId: string): string {
  return resolve(targetConfigDir, `oh-my-openagent.${profileId}.json`);
}

function profileStrategyPath(profileId: string): string {
  return resolve(targetConfigDir, `strategy.${profileId}.json`);
}

function profileContextGuardPath(profileId: string): string {
  return contextGuardProfilePath(profileId);
}

function profileOpenCodePath(profileId: string): string {
  return resolve(targetConfigDir, `opencode.${profileId}.json`);
}

function contextGuardProfilePath(profileId: string): string {
  return resolve(targetConfigDir, `context-guard.${profileId}.json`);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
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

function requireRecord<T>(value: Record<string, T> | undefined, label: string): Record<string, T> {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (dryRun) {
    console.log(`\n--- ${path} ---\n${content}`);
    return;
  }

  if (!force && (await pathExists(path))) {
    throw new Error(`目标已存在：${path}\n如需覆盖，请运行：bun run ai:gen -- --force`);
  }

  await writeFile(path, content);
}

async function installLaunchers(): Promise<void> {
  const launcherFiles =
    process.platform === "win32"
      ? [
          "aiomo.cmd",
          "aiomo.ps1",
          "aioc.cmd",
          "aioc.ps1",
          "opencode-launcher-common.ps1",
          "opencode-context-guard.mjs",
          "aiomo-monitor.cmd",
          "aiomo-monitor.ps1",
        ]
      : ["aiomo", "aioc", "opencode-launcher-common.sh", "opencode-context-guard.mjs", "aiomo-monitor"];
  if (dryRun) {
    for (const fileName of launcherFiles) {
      console.log(`将安装启动命令：${resolve(targetBinDir, fileName)}`);
    }
    if (process.platform === "win32") {
      console.log(`将确保用户 PATH 包含：${targetBinDir}`);
    } else {
      console.log(`请确保 shell PATH 包含：${targetBinDir}`);
    }
    return;
  }

  await mkdir(targetBinDir, { recursive: true });
  for (const fileName of launcherFiles) {
    const sourcePath = resolve(binDir, fileName);
    const targetPath = resolve(targetBinDir, fileName);
    if (process.platform === "win32" && fileName.endsWith(".ps1")) {
      await writeFile(targetPath, withUtf8Bom(await readFile(sourcePath, "utf8")));
      continue;
    }
    await copyFile(sourcePath, targetPath);
  }

  if (process.platform === "win32") {
    ensureWindowsUserPath(targetBinDir);
  } else {
    console.log(`请确保 shell PATH 包含：${targetBinDir}`);
  }
}

function withUtf8Bom(content: string): string {
  return content.startsWith("\uFEFF") ? content : `\uFEFF${content}`;
}

async function installPlugins(): Promise<void> {
  const pluginDirectories = ["omo-agent-monitor"];
  if (dryRun) {
    for (const directoryName of pluginDirectories) {
      console.log(`将安装 OpenCode 本地插件：${resolve(targetPluginDir, directoryName)}`);
    }
    return;
  }

  await mkdir(targetPluginDir, { recursive: true });
  for (const directoryName of pluginDirectories) {
    await cp(resolve(pluginDir, directoryName), resolve(targetPluginDir, directoryName), {
      recursive: true,
      force: true,
    });
  }
}

async function installNativeSkills(): Promise<void> {
  const gitMasterSkillPath = resolve(targetSkillsDir, "git-master", "SKILL.md");
  const content = gitMasterSkillContent();
  if (dryRun) {
    console.log(`\n--- ${gitMasterSkillPath} ---\n${content}`);
    return;
  }

  if (!force && (await pathExists(gitMasterSkillPath))) {
    throw new Error(`目标已存在：${gitMasterSkillPath}\n如需覆盖，请运行：bun run ai:gen -- --force`);
  }

  await mkdir(resolve(targetSkillsDir, "git-master"), { recursive: true });
  await writeFile(gitMasterSkillPath, content);
}

function gitMasterSkillContent(): string {
  return `---
name: git-master
description: MUST USE for ANY git operations. Atomic commits, rebase/squash, history search (blame, bisect, log -S). STRONGLY RECOMMENDED: delegate with task(category='quick', load_skills=['git-master'], ...) when using aiomo.
---

# Git Master

Use this skill for git status, diff, add, commit, push, pull, branch, merge, rebase, squash, blame, bisect, or history search.

If the user invokes this skill with no concrete git request, respond only with:

Git Master 工作流已启用。请说明要执行的 git 操作，例如查看状态、提交、查看 diff、创建分支或分析历史。

Do not print these instructions back to the user unless asked to explain the workflow.

## Core Rules

- Inspect repository state before changing git state: run \`git status --short --branch\` and review relevant diffs.
- Never overwrite or revert user changes unless explicitly requested.
- Never run destructive commands such as \`git reset --hard\`, \`git clean -fd\`, force push, or checkout-based rollback without explicit approval.
- Do not amend commits unless explicitly requested.
- Do not skip hooks with \`--no-verify\` unless explicitly requested.
- Do not commit secrets, local env files, credentials, tokens, dependency caches, or unrelated generated artifacts.
- Prefer atomic commits that group one coherent reason for change.

## Commit Workflow

1. Gather context with \`git status --short --branch\`, \`git diff\`, \`git diff --cached\`, and recent \`git log --oneline -5\`.
2. Stage only files related to the requested change.
3. Write a concise commit message matching repository style.
4. Run the commit normally and inspect post-commit status.
5. Push only when the user explicitly asks for push.

## aiomo Delegation

When using oh-my-openagent delegation, pass this skill explicitly for git work:

\`task(category="quick", load_skills=["git-master"], run_in_background=false, prompt="...")\`

Prefer this delegation form for non-trivial git work to keep the main context small.

## History Search

- Use \`git log --oneline --decorate --graph\` for topology.
- Use \`git log -S <text> -- <path>\` or \`git log -G <regex> -- <path>\` to find when content changed.
- Use \`git blame -C -C -- <path>\` for moved/copied code attribution.
- Use \`git bisect\` only with clear good/bad boundaries and a reproducible test command.
`;
}

function ensureWindowsUserPath(path: string): void {
  const currentPath = process.env.Path ?? process.env.PATH ?? "";
  if (pathListIncludes(currentPath, path)) return;

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$pathToAdd = $env:AI_SHARE_BIN_DIR; " +
        "$current = [Environment]::GetEnvironmentVariable('Path', 'User'); " +
        "if (-not $current) { $current = '' }; " +
        "$parts = $current -split ';' | Where-Object { $_ }; " +
        "if ($parts -notcontains $pathToAdd) { " +
        "  $newPath = (@($parts) + $pathToAdd) -join ';'; " +
        "  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User') " +
        "}",
    ],
    { env: { ...process.env, AI_SHARE_BIN_DIR: path }, stdio: "pipe", encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "更新 Windows 用户 PATH 失败。");
  }
}

function pathListIncludes(pathList: string, expectedPath: string): boolean {
  return pathList
    .split(process.platform === "win32" ? ";" : ":")
    .filter(Boolean)
    .some((entry) => resolve(entry).toLowerCase() === resolve(expectedPath).toLowerCase());
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
