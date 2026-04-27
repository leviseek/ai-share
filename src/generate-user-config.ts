#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseYamlObject } from "./yaml.ts";

type ProviderYaml = {
  providers?: Record<string, ProviderSource>;
};

type ProviderSource = {
  name?: string;
  short_name?: string;
  base_url?: string;
  api_key?: string;
  timeout?: number;
  chunkTimeout?: number;
};

type ModelsYaml = Record<string, ModelSource>;

type ModelSource = {
  provider?: string;
  provider_group?: string;
  model_name?: string;
  capabilities?: string[];
  limits?: {
    max_output?: number;
  };
  parameters?: Record<string, unknown>;
  fallback?: string[];
};

type AgentsYaml = {
  model_fallback?: boolean;
  agents?: Record<string, AgentSource>;
  categories?: Record<string, AgentSource>;
  runtime_fallback?: RuntimeFallbackSource;
  background_task?: BackgroundTaskSource;
  tmux?: {
    enabled?: boolean;
  };
};

type ProfilesYaml = Record<string, AgentProfileSource>;

type AgentProfileSource = {
  name?: string;
  models?: Record<string, string>;
};

type AgentSource = {
  model?: string;
  prompt?: {
    system?: string;
    append?: string;
  };
  permission?: Record<string, string>;
};

type RuntimeFallbackSource = {
  enabled?: boolean;
  retry_on_errors?: number[];
  max_fallback_attempts?: number;
  cooldown_seconds?: number;
  timeout_seconds?: number;
  notify_on_fallback?: boolean;
  model_whitelist?: string[];
};

type BackgroundTaskSource = {
  providerConcurrency?: Record<string, number>;
  modelConcurrency?: Record<string, number>;
};

type GlobalYaml = {
  default_profile?: string;
  opencode?: {
    plugins?: string[];
  };
  models?: {
    default?: string;
    small?: string;
  };
  runtime?: {
    timeout_ms?: number;
  };
  context?: {
    max_tokens?: number;
  };
  compaction?: {
    enabled?: boolean;
    threshold?: number;
    model?: string;
    max_input_tokens?: number;
  };
};

type OpenCodeConfig = {
  $schema: string;
  model: string;
  small_model: string;
  instructions: string[];
  plugin: string[];
  compaction: {
    enabled: boolean;
    threshold: number;
    model: string;
    max_input_tokens: number;
  };
  agent: Record<string, OpenCodeAgent>;
  provider: Record<string, OpenCodeProvider>;
};

type OpenCodeAgent = {
  mode?: "primary" | "subagent";
  model: string;
  max_tokens?: number;
  permission?: Record<string, string>;
};

type OpenCodeProvider = {
  name: string;
  npm: string;
  options: {
    baseURL: string;
    apiKey: string;
    timeout?: number;
    chunkTimeout?: number;
  };
  models: Record<string, OpenCodeModel>;
};

type OpenCodeModel = {
  id?: string;
  name: string;
  options?: Record<string, unknown>;
};

type OhMyOpenAgentConfig = {
  $schema: string;
  model_fallback: boolean;
  agents: Record<string, OhMyAgent>;
  categories: Record<string, OhMyAgent>;
  runtime_fallback: {
    enabled: boolean;
    retry_on_errors: number[];
    max_fallback_attempts: number;
    cooldown_seconds: number;
    timeout_seconds: number;
    notify_on_fallback: boolean;
    model_whitelist: string[];
  };
  background_task: {
    providerConcurrency: Record<string, number>;
    modelConcurrency: Record<string, number>;
  };
  tmux: {
    enabled: boolean;
  };
};

type OhMyAgent = {
  model: string;
  fallback_models?: string[];
  prompt_append?: string;
  permission?: Record<string, string>;
};

const args = new Set(Bun.argv.slice(2));
const force = args.has("--force");
const dryRun = args.has("--dry-run");
const checkOnly = args.has("--check");
const providerGroups = parseProviderGroups();
const projectRoot = resolve(import.meta.dir, "..");
const configDir = resolve(projectRoot, "config");
const binDir = resolve(projectRoot, "bin");
const homeDir = resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "");
const targetConfigDir = resolve(homeDir, ".config", "opencode");
const targetOpenCode = resolve(targetConfigDir, "opencode.json");
const targetOhMyOpenAgent = resolve(targetConfigDir, "oh-my-openagent.json");
const targetProfileManifest = resolve(targetConfigDir, ".omo-profiles.json");
const targetBinDir = resolve(homeDir, ".local", "bin");

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
const openCodeConfig = buildOpenCodeConfig(globalConfig, providers, models, defaultModel, smallModel);
const ohMyOpenAgentConfigs = buildOhMyOpenAgentConfigs(models, profilesConfig, agentsConfig);
const selectedDefaultProfileId = defaultProfileId(globalConfig, profilesConfig);

if (checkOnly) {
  const missingApiKeys = missingProviderApiKeyEnvNames(providers);
  console.log("配置检查通过。");
  console.log(`OpenCode provider 数量：${Object.keys(openCodeConfig.provider).length}`);
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
await writeJson(targetOpenCode, openCodeConfig);
for (const [profileId, ohMyOpenAgentConfig] of Object.entries(ohMyOpenAgentConfigs)) {
  await writeJson(profileOhMyOpenAgentPath(profileId), ohMyOpenAgentConfig);
}
await writeJson(targetOhMyOpenAgent, requireValue(ohMyOpenAgentConfigs[selectedDefaultProfileId], "默认 OMO profile"));
await writeJson(targetProfileManifest, buildProfileManifest(profilesConfig, selectedDefaultProfileId));
await installLaunchers();

console.log(`${dryRun ? "将生成" : "已生成"} OpenCode 配置：${targetOpenCode}`);
console.log(`${dryRun ? "将生成" : "已生成"} oh-my-openagent 默认配置：${targetOhMyOpenAgent}`);
console.log(`${dryRun ? "将生成" : "已生成"} OMO 级别清单：${targetProfileManifest}`);
console.log(
  `${dryRun ? "将生成" : "已生成"} OMO 级别配置：${Object.keys(ohMyOpenAgentConfigs)
    .map((profileId) => `aiomo ${profileId}`)
    .join(" / ")}`,
);
console.log(`${dryRun ? "将安装" : "已安装"} 启动命令目录：${targetBinDir}`);
console.log(
  "说明：provider/model/profiles/agents/categories/runtime_fallback/background_task/tmux 均来自 config/*.yaml。",
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

function parseOption(name: string): string | undefined {
  const values = Bun.argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) return values[index + 1];
    if (value?.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return undefined;
}

function parseProviderGroups(): Record<string, string> {
  return {
    gpt: parseOption("--gpt-provider") ?? Bun.env.AI_SHARE_GPT_PROVIDER ?? "codexapis",
    deepseek: Bun.env.AI_SHARE_DEEPSEEK_PROVIDER ?? "deepseek",
    ...parseProviderGroupOptions(),
  };
}

function parseProviderGroupOptions(): Record<string, string> {
  const output: Record<string, string> = {};
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
  providerGroups: Record<string, string>,
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

function requireProviderGroup(groupId: string, providerGroups: Record<string, string>): string {
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

function buildOpenCodeConfig(
  globalConfig: GlobalYaml,
  providerSources: Record<string, ProviderSource>,
  modelSources: ModelsYaml,
  defaultModelRef: string,
  smallModelRef: string,
): OpenCodeConfig {
  return {
    $schema: "https://opencode.ai/config.json",
    model: defaultModelRef,
    small_model: smallModelRef,
    instructions: [resolve(projectRoot, "AI_GUIDELINES.md")],
    plugin: globalConfig.opencode?.plugins ?? ["oh-my-openagent@3.17.5"],
    compaction: buildCompactionConfig(globalConfig, modelSources, smallModelRef),
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
      compaction: { model: smallModelRef },
      title: { model: smallModelRef },
      summary: { model: smallModelRef },
    },
    provider: buildProviders(providerSources, modelSources),
  };
}

function buildCompactionConfig(
  globalConfig: GlobalYaml,
  modelSources: ModelsYaml,
  smallModelRef: string,
): OpenCodeConfig["compaction"] {
  const maxInputTokens = globalConfig.compaction?.max_input_tokens ?? globalConfig.context?.max_tokens ?? 120000;
  return {
    enabled: globalConfig.compaction?.enabled ?? true,
    threshold: globalConfig.compaction?.threshold ?? Math.min(globalConfig.context?.max_tokens ?? 120000, 80000),
    model: globalConfig.compaction?.model ? modelRef(globalConfig.compaction.model, modelSources) : smallModelRef,
    max_input_tokens: maxInputTokens,
  };
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
      npm: "@ai-sdk/openai-compatible",
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
  profileModels: Record<string, string>,
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
  profileModels: Record<string, string>,
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
  profileModels: Record<string, string>,
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

function modelRef(modelId: string, modelSources: ModelsYaml, profileModels: Record<string, string> = {}): string {
  const resolvedModelId = profileModels[modelId] ?? modelId;
  if (profileModels[resolvedModelId]) {
    throw new Error(`profile 模型别名不能递归引用：${modelId}`);
  }

  const provider = modelSources[resolvedModelId]?.provider;
  if (!provider) throw new Error(`模型缺少 provider 或未定义：${resolvedModelId}`);
  return `${provider}/${resolvedModelId}`;
}

function buildProfileManifest(profilesConfig: ProfilesYaml, selectedDefaultProfileId: string): object {
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
  const launcherFiles = process.platform === "win32" ? ["aiomo.cmd", "aiomo.ps1", "aioc.cmd"] : ["aiomo", "aioc"];
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
    await copyFile(resolve(binDir, fileName), resolve(targetBinDir, fileName));
  }

  if (process.platform === "win32") {
    ensureWindowsUserPath(targetBinDir);
  } else {
    console.log(`请确保 shell PATH 包含：${targetBinDir}`);
  }
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
