import type {
  AgentsYaml,
  EnvYaml,
  GlobalYaml,
  McpYaml,
  ModelsYaml,
  PluginsYaml,
  ProviderYaml,
  ToolsYaml,
} from "../types.ts";
import { isSensitiveName } from "../security/secret-patterns.ts";
import type { ValidationError } from "./validators/common.ts";
import { isRecord, isStringArray } from "./validators/common.ts";
import { validateOpenCodeEnv } from "./validators/env.ts";
import { validateMcpServers } from "./validators/mcp.ts";
import { validatePlugins } from "./validators/plugins.ts";
import { validateYamlSchemaShapes } from "./validators/schema-shape.ts";
import { validateTools } from "./validators/tools.ts";

export type { ValidationError } from "./validators/common.ts";

export type ConfigSet = {
  global: GlobalYaml;
  providers: ProviderYaml;
  models: ModelsYaml;
  mcp: McpYaml;
  env: EnvYaml;
  agents: AgentsYaml;
  plugins: PluginsYaml;
  tools: ToolsYaml;
};

export type RawConfigSet = {
  global: unknown;
  providers: unknown;
  models: unknown;
  mcp: unknown;
  env: unknown;
  agents: unknown;
  plugins: unknown;
  tools: unknown;
};

export type ConfigValidationResult =
  | { ok: true; config: ConfigSet; errors: [] }
  | { ok: false; errors: ValidationError[] };

export function validateConfigSet(input: RawConfigSet): ConfigValidationResult {
  const errors = validateYamlConsistency(
    input.models,
    input.providers,
    input.global,
    input.mcp,
    input.env,
    input.agents,
    input.plugins,
    input.tools,
  );
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      global: input.global as GlobalYaml,
      providers: input.providers as ProviderYaml,
      models: input.models as ModelsYaml,
      mcp: input.mcp as McpYaml,
      env: input.env as EnvYaml,
      agents: input.agents as AgentsYaml,
      plugins: input.plugins as PluginsYaml,
      tools: input.tools as ToolsYaml,
    },
    errors: [],
  };
}

export function validateYamlConsistency(
  modelsConfig: unknown,
  providersConfig: unknown,
  globalConfig: unknown,
  mcpConfig: unknown = { servers: {} },
  envConfig: unknown = { variables: {} },
  agentsConfig: unknown = { agents: {} },
  pluginsConfig: unknown = { plugins: [] },
  toolsConfig: unknown = { tools: [] },
): ValidationError[] {
  const errors = validateYamlSchemaShapes({
    "global.yaml": globalConfig,
    "provider.yaml": providersConfig,
    "models.yaml": modelsConfig,
    "mcp.yaml": mcpConfig,
    "env.yaml": envConfig,
    "agents.yaml": agentsConfig,
    "plugins.yaml": pluginsConfig,
    "tools.yaml": toolsConfig,
  });

  validateCrossFileReferences(errors, modelsConfig, providersConfig, globalConfig, agentsConfig);
  validateProviderModels(errors, modelsConfig, providersConfig, globalConfig);
  validateProviderUrls(errors, providersConfig);
  validateMcpServers(errors, mcpConfig);
  validateOpenCodeEnv(errors, envConfig);
  validatePlugins(errors, pluginsConfig);
  validateTools(errors, toolsConfig);
  return errors;
}

function validateProviderModels(
  errors: ValidationError[],
  modelsConfig: unknown,
  providersConfig: unknown,
  globalConfig: unknown,
): void {
  if (!isRecord(providersConfig) || !isRecord(providersConfig.providers)) return;
  const models = isRecord(modelsConfig) ? modelsConfig : {};

  for (const [providerId, value] of Object.entries(providersConfig.providers)) {
    if (!isRecord(value)) continue;

    if (Array.isArray(value.models) && value.models.length === 0) {
      errors.push({
        file: "provider.yaml",
        path: `providers.${providerId}.models`,
        message: `provider '${providerId}' 的 models 不得为空`,
      });
    }

    if (!isStringArray(value.models)) continue;
    const seenModelIds = new Set<string>();
    value.models.forEach((modelId, index) => {
      if (seenModelIds.has(modelId)) {
        errors.push({
          file: "provider.yaml",
          path: `providers.${providerId}.models[${index}]`,
          message: `provider '${providerId}' 的 models 包含重复模型 '${modelId}'`,
        });
      } else {
        seenModelIds.add(modelId);
      }

      if (!Object.hasOwn(models, modelId)) {
        errors.push({
          file: "provider.yaml",
          path: `providers.${providerId}.models[${index}]`,
          message: `provider '${providerId}' 引用未定义模型 '${modelId}'`,
        });
      }
    });

    if (typeof value.default_model === "string" && !seenModelIds.has(value.default_model)) {
      errors.push({
        file: "provider.yaml",
        path: `providers.${providerId}.default_model`,
        message: `provider '${providerId}' 的 default_model '${value.default_model}' 不在 models 中`,
      });
    }
  }

  if (!isRecord(globalConfig)) return;
  const providerId = globalConfig.provider;
  const modelId = globalConfig.model;
  if (typeof providerId !== "string" || typeof modelId !== "string") return;
  const provider = Object.hasOwn(providersConfig.providers, providerId)
    ? providersConfig.providers[providerId]
    : undefined;
  if (!isRecord(provider) || !isStringArray(provider.models) || provider.models.includes(modelId)) return;
  errors.push({
    file: "global.yaml",
    path: "model",
    message: `global.model '${modelId}' 不在 provider '${providerId}' 的 models 中`,
  });
}

function validateProviderUrls(errors: ValidationError[], providersConfig: unknown): void {
  if (!isRecord(providersConfig) || !isRecord(providersConfig.providers)) return;
  for (const [providerId, value] of Object.entries(providersConfig.providers)) {
    if (!isRecord(value) || typeof value.base_url !== "string") continue;
    try {
      const url = new URL(value.base_url);
      if (url.protocol === "https:" && url.hostname && !url.username && !url.password) {
        const sensitiveQueryKey = [...url.searchParams.keys()].find(isSensitiveName);
        if (!sensitiveQueryKey) continue;
        errors.push({
          file: "provider.yaml",
          path: `providers.${providerId}.base_url`,
          message: `provider '${providerId}' 的 base_url 不得包含敏感查询参数 '${sensitiveQueryKey}'`,
        });
        continue;
      }
    } catch {
      // The shared error below keeps provider URL failures consistent.
    }
    errors.push({
      file: "provider.yaml",
      path: `providers.${providerId}.base_url`,
      message: `provider '${providerId}' 的 base_url 必须是有效 HTTPS URL`,
    });
  }
}

function validateCrossFileReferences(
  errors: ValidationError[],
  modelsConfig: unknown,
  providersConfig: unknown,
  globalConfig: unknown,
  agentsConfig: unknown,
): void {
  if (!isRecord(globalConfig)) return;
  const models = isRecord(modelsConfig) ? modelsConfig : {};
  const providers = isRecord(providersConfig) && isRecord(providersConfig.providers) ? providersConfig.providers : {};

  const modelId = globalConfig.model;
  if (typeof modelId === "string" && modelId && !Object.hasOwn(models, modelId)) {
    errors.push({
      file: "global.yaml",
      path: "model",
      message: `global.model 引用未定义模型 '${modelId}'`,
    });
  }

  const providerId = globalConfig.provider;
  if (typeof providerId === "string" && providerId && !Object.hasOwn(providers, providerId)) {
    errors.push({
      file: "global.yaml",
      path: "provider",
      message: `global.provider 引用未定义提供商 '${providerId}'`,
    });
  }

  if (!isRecord(agentsConfig) || !isRecord(agentsConfig.agents)) return;
  for (const [agentId, agent] of Object.entries(agentsConfig.agents)) {
    if (!isRecord(agent) || typeof agent.model !== "string" || !agent.model) continue;
    const isFullReference = agent.model.includes("/");
    if (isFullReference || Object.hasOwn(models, agent.model)) continue;
    errors.push({
      file: "agents.yaml",
      path: `agents.${agentId}.model`,
      message: `agent '${agentId}' 引用未定义模型 '${agent.model}'`,
    });
  }
}

export function requireString(value: string | undefined, label: string): string {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}
