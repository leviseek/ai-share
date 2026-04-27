#!/usr/bin/env bun

import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseYamlObject } from "./yaml.ts";

type ProviderYaml = {
  providers?: Record<string, ProviderSource>;
};

type ProviderSource = {
  name?: string;
  base_url?: string;
  api_key?: string;
  timeout?: number;
  chunkTimeout?: number;
};

type ModelsYaml = Record<string, ModelSource>;

type ModelSource = {
  provider?: string;
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
  runtime?: {
    timeout_ms?: number;
  };
  context?: {
    max_tokens?: number;
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
const projectRoot = resolve(import.meta.dir, "..");
const configDir = resolve(projectRoot, "config");
const homeDir = resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "");
const targetConfigDir = resolve(homeDir, ".config", "opencode");
const targetOpenCode = resolve(targetConfigDir, "opencode.json");
const targetOhMyOpenAgent = resolve(targetConfigDir, "oh-my-openagent.json");

if (!targetConfigDir.startsWith(homeDir)) {
  throw new Error("无法解析用户级 OpenCode 配置目录。请检查 HOME 或 USERPROFILE 环境变量。");
}

const [globalConfig, providersConfig, modelsConfig, agentsConfig] = await Promise.all([
  loadYaml<GlobalYaml>("global.yaml"),
  loadYaml<ProviderYaml>("provider.yaml"),
  loadYaml<ModelsYaml>("models.yaml"),
  loadYaml<AgentsYaml>("agents.yaml"),
]);

const providers = providersConfig.providers ?? {};
const models = modelsConfig;
const defaultModel = modelRef(pickDefaultModel(models), models);
const smallModel = modelRef(pickSmallModel(models), models);
const openCodeConfig = buildOpenCodeConfig(globalConfig, providers, models, defaultModel, smallModel);
const ohMyOpenAgentConfig = buildOhMyOpenAgentConfig(models, agentsConfig);

if (!dryRun) await mkdir(targetConfigDir, { recursive: true });
await writeJson(targetOpenCode, openCodeConfig);
await writeJson(targetOhMyOpenAgent, ohMyOpenAgentConfig);

console.log(`${dryRun ? "将生成" : "已生成"} OpenCode 配置：${targetOpenCode}`);
console.log(`${dryRun ? "将生成" : "已生成"} oh-my-openagent 配置：${targetOhMyOpenAgent}`);
console.log("说明：provider/model/agents/categories/runtime_fallback/background_task/tmux 均来自 config/*.yaml。");

async function loadYaml<T extends object>(fileName: string): Promise<T> {
  const value = parseYamlObject(await readFile(resolve(configDir, fileName), "utf8"));
  return value as T;
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
    plugin: ["oh-my-openagent@3.17.5"],
    compaction: {
      enabled: true,
      threshold: Math.min(globalConfig.context?.max_tokens ?? 120000, 80000),
      model: smallModelRef,
      max_input_tokens: globalConfig.context?.max_tokens ?? 120000,
    },
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

function buildOhMyOpenAgentConfig(modelSources: ModelsYaml, agentsConfig: AgentsYaml): OhMyOpenAgentConfig {
  return {
    $schema: "https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/assets/oh-my-opencode.schema.json",
    model_fallback: agentsConfig.model_fallback ?? true,
    agents: buildConfiguredAgents(requireRecord(agentsConfig.agents, "agents"), modelSources),
    categories: buildConfiguredAgents(requireRecord(agentsConfig.categories, "categories"), modelSources),
    runtime_fallback: buildRuntimeFallback(
      requireValue(agentsConfig.runtime_fallback, "runtime_fallback"),
      modelSources,
    ),
    background_task: buildBackgroundTask(requireValue(agentsConfig.background_task, "background_task"), modelSources),
    tmux: { enabled: agentsConfig.tmux?.enabled ?? false },
  };
}

function buildProviders(
  providerSources: Record<string, ProviderSource>,
  modelSources: ModelsYaml,
): Record<string, OpenCodeProvider> {
  const output: Record<string, OpenCodeProvider> = {};
  for (const [providerId, provider] of Object.entries(providerSources)) {
    const options: OpenCodeProvider["options"] = {
      baseURL: requireString(provider.base_url, `providers.${providerId}.base_url`),
      apiKey: formatApiKey(requireString(provider.api_key, `providers.${providerId}.api_key`)),
    };
    if (provider.timeout !== undefined) options.timeout = provider.timeout;
    if (provider.chunkTimeout !== undefined) options.chunkTimeout = provider.chunkTimeout;

    output[providerId] = {
      name: provider.name ?? formatName(providerId),
      npm: "@ai-sdk/openai-compatible",
      options,
      models: buildProviderModels(providerId, modelSources),
    };
  }
  return output;
}

function buildProviderModels(providerId: string, modelSources: ModelsYaml): Record<string, OpenCodeModel> {
  const output: Record<string, OpenCodeModel> = {};
  for (const [modelId, model] of Object.entries(modelSources)) {
    if (model.provider !== providerId) continue;
    output[modelId] = {
      ...(model.model_name && model.model_name !== modelId ? { id: model.model_name } : {}),
      name: formatName(modelId),
      ...(model.parameters ? { options: model.parameters } : {}),
    };
  }
  return output;
}

function buildConfiguredAgents(
  agentSources: Record<string, AgentSource>,
  modelSources: ModelsYaml,
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
          modelRef(requireString(agent.model, `agents.${agentId}.model`), modelSources),
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
): OhMyOpenAgentConfig["runtime_fallback"] {
  return {
    enabled: source.enabled ?? true,
    retry_on_errors: source.retry_on_errors ?? [],
    max_fallback_attempts: source.max_fallback_attempts ?? 1,
    cooldown_seconds: source.cooldown_seconds ?? 60,
    timeout_seconds: source.timeout_seconds ?? 30,
    notify_on_fallback: source.notify_on_fallback ?? true,
    model_whitelist: (source.model_whitelist ?? []).map((modelId) => modelRef(modelId, modelSources)),
  };
}

function buildBackgroundTask(
  source: BackgroundTaskSource,
  modelSources: ModelsYaml,
): OhMyOpenAgentConfig["background_task"] {
  return {
    providerConcurrency: source.providerConcurrency ?? {},
    modelConcurrency: Object.fromEntries(
      Object.entries(source.modelConcurrency ?? {}).map(([modelId, concurrency]) => [
        modelRef(modelId, modelSources),
        concurrency,
      ]),
    ),
  };
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

function pickDefaultModel(modelSources: ModelsYaml): string {
  if (modelSources["gpt-5.5"]) return "gpt-5.5";
  return requireString(Object.keys(modelSources)[0], "models 首个模型");
}

function pickSmallModel(modelSources: ModelsYaml): string {
  const modelId = Object.entries(modelSources).find(
    ([, model]) => model.capabilities?.includes("cheap") ?? model.capabilities?.includes("fast") ?? false,
  )?.[0];
  return modelId ?? pickDefaultModel(modelSources);
}

function modelRef(modelId: string, modelSources: ModelsYaml): string {
  const provider = modelSources[modelId]?.provider;
  if (!provider) throw new Error(`模型缺少 provider 或未定义：${modelId}`);
  return `${provider}/${modelId}`;
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
