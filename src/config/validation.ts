import type {
  AgentsYaml,
  EnvYaml,
  GlobalYaml,
  McpYaml,
  ModelsYaml,
  ProfileEvalYaml,
  ProfilesYaml,
  ProviderYaml,
} from "../types.ts";
import { validateAgents } from "./validators/agents.ts";
import type { ValidationError } from "./validators/common.ts";
import { validateCodexEnv } from "./validators/env.ts";
import { validateMcpServers } from "./validators/mcp.ts";
import { validateModelCatalog } from "./validators/models.ts";
import { validateDefaultProfile, validateProfiles } from "./validators/profiles.ts";
import { validateProviderCatalog } from "./validators/providers.ts";
import { validateYamlSchemaShapes } from "./validators/schema-shape.ts";

export type { ValidationError } from "./validators/common.ts";

export function requireString(value: string | undefined, label: string): string {
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

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Validate business rules for YAML config files.
 *
 * Checks:
 * 1. All profiles have 3 model roles (primary/reasoning/fast)
 * 2. default_profile exists in profiles.yaml
 * 3. compaction.threshold ≤ max_input_tokens per profile
 * 4. models.yaml entries have required schema fields and valid provider groups
 * 5. Profile/agent/compaction/fallback model references exist
 *
 * Economy profile intentionally has extreme threshold/max_input_tokens
 * values to disable compaction — that's valid.
 */
export function validateYamlConsistency(
  profilesConfig: ProfilesYaml,
  modelsConfig: ModelsYaml,
  providersConfig: ProviderYaml,
  globalConfig: GlobalYaml,
  mcpConfig: McpYaml = {},
  agentsConfig: AgentsYaml = {},
  envConfig: EnvYaml = {},
  profileEvalConfig: ProfileEvalYaml = {},
): ValidationError[] {
  const errors = validateYamlSchemaShapes({
    "global.yaml": globalConfig,
    "provider.yaml": providersConfig,
    "models.yaml": modelsConfig,
    "profiles.yaml": profilesConfig,
    "agents.yaml": agentsConfig,
    "mcp.yaml": mcpConfig,
    "env.yaml": envConfig,
    "profile-eval.yaml": profileEvalConfig,
  });

  const modelIds = new Set(Object.keys(modelsConfig));
  const providerInstances = validateProviderCatalog(errors, providersConfig);

  validateProfiles(errors, profilesConfig, modelIds, modelsConfig);
  validateDefaultProfile(errors, profilesConfig, globalConfig);
  validateModelCatalog(errors, modelsConfig, modelIds, providerInstances);
  validateAgents(errors, agentsConfig);
  validateMcpServers(errors, mcpConfig);
  validateCodexEnv(errors, envConfig);

  return errors;
}
