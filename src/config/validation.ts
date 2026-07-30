import type { EnvYaml, GlobalYaml, McpYaml, ModelsYaml, ProviderYaml } from "../types.ts";
import type { ValidationError } from "./validators/common.ts";
import { validateCodexEnv } from "./validators/env.ts";
import { validateMcpServers } from "./validators/mcp.ts";
import { validateModelCatalog } from "./validators/models.ts";
import { validateProviderCatalog } from "./validators/providers.ts";
import { validateYamlSchemaShapes } from "./validators/schema-shape.ts";

export type { ValidationError } from "./validators/common.ts";

export function requireString(value: string | undefined, label: string): string {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Validate business rules for YAML config files.
 *
 * Checks:
 * 1. global.model exists in models.yaml
 * 2. models.yaml entries have required schema fields and valid provider groups
 * 3. fallback model references exist
 * 4. MCP and Codex .env security rules hold
 */
export function validateYamlConsistency(
  modelsConfig: ModelsYaml,
  providersConfig: ProviderYaml,
  globalConfig: GlobalYaml,
  mcpConfig: McpYaml = {},
  envConfig: EnvYaml = {},
): ValidationError[] {
  const errors = validateYamlSchemaShapes({
    "global.yaml": globalConfig,
    "provider.yaml": providersConfig,
    "models.yaml": modelsConfig,
    "mcp.yaml": mcpConfig,
    "env.yaml": envConfig,
  });

  const modelIds = new Set(Object.keys(modelsConfig));
  const providerInstances = validateProviderCatalog(errors, providersConfig);

  validateGlobalModel(errors, globalConfig, modelIds, modelsConfig);
  validateModelCatalog(errors, modelsConfig, modelIds, providerInstances);
  validateMcpServers(errors, mcpConfig);
  validateCodexEnv(errors, envConfig);

  return errors;
}

function validateGlobalModel(
  errors: ValidationError[],
  globalConfig: GlobalYaml,
  modelIds: ReadonlySet<string>,
  modelsConfig: ModelsYaml,
): void {
  const modelId = globalConfig.model;
  if (typeof modelId !== "string") return;
  if (!modelIds.has(modelId)) {
    errors.push({
      file: "global.yaml",
      path: "model",
      message: `global.model 引用未定义模型 '${modelId}'`,
    });
    return;
  }

  const groupId = modelsConfig[modelId]?.provider_group;
  if (typeof groupId === "string" && groupId) return;
  errors.push({
    file: "global.yaml",
    path: "model",
    message: `global.model '${modelId}' 缺少 provider_group`,
  });
}
