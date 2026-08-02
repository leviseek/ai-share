import type { AgentsYaml, EnvYaml, GlobalYaml, McpYaml, ModelsYaml, ProviderYaml } from "../types.ts";
import { isSensitiveName } from "../security/secret-patterns.ts";
import type { ValidationError } from "./validators/common.ts";
import { isRecord } from "./validators/common.ts";
import { validateOpenCodeEnv } from "./validators/env.ts";
import { validateMcpServers } from "./validators/mcp.ts";
import { validateYamlSchemaShapes } from "./validators/schema-shape.ts";

export type { ValidationError } from "./validators/common.ts";

export type ConfigSet = {
  global: GlobalYaml;
  providers: ProviderYaml;
  models: ModelsYaml;
  mcp: McpYaml;
  env: EnvYaml;
  agents: AgentsYaml;
};

export type RawConfigSet = {
  global: unknown;
  providers: unknown;
  models: unknown;
  mcp: unknown;
  env: unknown;
  agents: unknown;
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
): ValidationError[] {
  const errors = validateYamlSchemaShapes({
    "global.yaml": globalConfig,
    "provider.yaml": providersConfig,
    "models.yaml": modelsConfig,
    "mcp.yaml": mcpConfig,
    "env.yaml": envConfig,
    "agents.yaml": agentsConfig,
  });

  validateCrossFileReferences(errors, modelsConfig, providersConfig, globalConfig, agentsConfig);
  validateProviderUrls(errors, providersConfig);
  validateMcpServers(errors, mcpConfig);
  validateOpenCodeEnv(errors, envConfig);
  return errors;
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
  if (typeof modelId === "string" && modelId && !models[modelId]) {
    errors.push({
      file: "global.yaml",
      path: "model",
      message: `global.model 引用未定义模型 '${modelId}'`,
    });
  }

  const providerId = globalConfig.provider;
  if (typeof providerId === "string" && providerId && !providers[providerId]) {
    errors.push({
      file: "global.yaml",
      path: "provider",
      message: `global.provider 引用未定义提供商 '${providerId}'`,
    });
  }

  if (!isRecord(agentsConfig) || !isRecord(agentsConfig.agents)) return;
  for (const [agentId, agent] of Object.entries(agentsConfig.agents)) {
    if (!isRecord(agent) || typeof agent.model !== "string" || !agent.model || models[agent.model]) continue;
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
