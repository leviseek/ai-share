import type { AgentsYaml, GlobalYaml, McpYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "../types.ts";
import { DEFAULT_PROVIDER_GROUPS } from "./provider-groups.ts";

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

export type ValidationError = {
  file: string;
  path: string;
  message: string;
};

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
): ValidationError[] {
  const errors: ValidationError[] = [];
  const modelIds = new Set(Object.keys(modelsConfig));
  const providerInstances = validateProviderCatalog(errors, providersConfig);

  // 1. Profile model roles completeness
  for (const [profileId, profile] of Object.entries(profilesConfig)) {
    if (!isRecord(profile)) {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}`,
        message: `profile '${profileId}' 必须是对象`,
      });
      continue;
    }

    if (profile.name !== undefined && typeof profile.name !== "string") {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}.name`,
        message: `profile '${profileId}' 的 name 必须是字符串`,
      });
    }

    const models = profile.models;
    if (models === undefined || models === null) {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}.models`,
        message: `profile '${profileId}' 缺少 'models' 字段`,
      });
      continue;
    }
    if (!isRecord(models)) {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}.models`,
        message: `profile '${profileId}' 的 models 必须是对象`,
      });
      continue;
    }
    for (const role of ["primary", "reasoning", "fast"] as const) {
      const modelId = models[role];
      if (typeof modelId !== "string" || !modelId) {
        errors.push({
          file: "profiles.yaml",
          path: `profiles.${profileId}.models.${role}`,
          message: `profile '${profileId}' 缺少 'models.${role}' 字段`,
        });
      } else if (!modelIds.has(modelId)) {
        errors.push({
          file: "profiles.yaml",
          path: `profiles.${profileId}.models.${role}`,
          message: `profile '${profileId}' 的 models.${role} 引用未定义模型 '${modelId}'`,
        });
      }
    }
  }

  // 2. Default profile exists
  const defaultProfile = globalConfig.default_profile;
  if (defaultProfile) {
    if (!profilesConfig[defaultProfile]) {
      errors.push({
        file: "global.yaml",
        path: "default_profile",
        message: `default_profile '${defaultProfile}' 在 profiles.yaml 中不存在`,
      });
    }
  }

  // 3. Compaction threshold ≤ max_input_tokens
  for (const [profileId, profile] of Object.entries(profilesConfig)) {
    if (!isRecord(profile)) continue;
    const compaction = profile.compaction;
    if (compaction === undefined) continue;
    if (!isRecord(compaction)) {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}.compaction`,
        message: `profile '${profileId}' 的 compaction 必须是对象`,
      });
      continue;
    }
    validateOptionalBoolean(errors, "profiles.yaml", `profiles.${profileId}.compaction.enabled`, compaction.enabled);
    validateOptionalBoolean(errors, "profiles.yaml", `profiles.${profileId}.compaction.prune`, compaction.prune);
    validateOptionalNumber(errors, "profiles.yaml", `profiles.${profileId}.compaction.threshold`, compaction.threshold);
    validateOptionalNumber(
      errors,
      "profiles.yaml",
      `profiles.${profileId}.compaction.max_input_tokens`,
      compaction.max_input_tokens,
    );
    validateOptionalNumber(errors, "profiles.yaml", `profiles.${profileId}.compaction.reserved`, compaction.reserved);

    if (isFiniteNumber(compaction.threshold) && isFiniteNumber(compaction.max_input_tokens)) {
      if (compaction.threshold > compaction.max_input_tokens) {
        errors.push({
          file: "profiles.yaml",
          path: `profiles.${profileId}.compaction`,
          message: `profile '${profileId}' 的 compaction.threshold (${compaction.threshold}) 超过 max_input_tokens (${compaction.max_input_tokens})`,
        });
      }
    }
    const compactionModel = compaction.model;
    if (compactionModel !== undefined && (typeof compactionModel !== "string" || !compactionModel)) {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}.compaction.model`,
        message: `profile '${profileId}' 的 compaction.model 必须是非空字符串`,
      });
    } else if (typeof compactionModel === "string" && !isKnownModelOrRole(compactionModel, modelIds)) {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}.compaction.model`,
        message: `profile '${profileId}' 的 compaction.model 引用未定义模型或角色 '${compactionModel}'`,
      });
    }
  }

  // 4. Model catalog schema and provider group references
  // provider_group in models.yaml is a logical group name (e.g. "gpt", "deepseek")
  // that maps to a concrete provider via CLI flags / env vars at runtime.
  // Validate that all referenced groups are known and resolve to existing providers.
  const knownProviderGroups: Readonly<Record<string, string>> = DEFAULT_PROVIDER_GROUPS;
  for (const [modelId, model] of Object.entries(modelsConfig)) {
    validateModelCatalogEntry(errors, modelId, model, modelIds, knownProviderGroups, providerInstances);
  }

  // 5. Agent model references
  for (const [agentId, agent] of Object.entries(agentsConfig.agents ?? {})) {
    if (!isRecord(agent)) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}`,
        message: `agent '${agentId}' 必须是对象`,
      });
      continue;
    }
    validateAgentShape(errors, agentId, agent);
    const model = agent.model;
    if (model === undefined || model === null || model === "") {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.model`,
        message: `agent '${agentId}' 缺少 model 字段`,
      });
    } else if (typeof model !== "string" || !isModelRole(model)) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.model`,
        message: `agent '${agentId}' 的 model 必须引用 primary、reasoning 或 fast 角色`,
      });
    }
  }

  // 6. MCP server shape
  const mcpServers = mcpConfig.servers;
  if (mcpServers !== undefined && !isRecord(mcpServers)) {
    errors.push({
      file: "mcp.yaml",
      path: "servers",
      message: "MCP servers 必须是对象",
    });
  }
  for (const [serverId, server] of Object.entries(isRecord(mcpServers) ? mcpServers : {})) {
    if (!isRecord(server)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}`,
        message: `MCP server '${serverId}' 必须是对象`,
      });
      continue;
    }
    validateMcpServerShape(errors, serverId, server);
    const isHttp = server.transport === "http" || server.url !== undefined;
    if (isHttp) {
      const url = typeof server.url === "string" ? server.url : undefined;
      if (!url) {
        errors.push({
          file: "mcp.yaml",
          path: `servers.${serverId}.url`,
          message: `HTTP MCP server '${serverId}' 缺少 url 字段`,
        });
      } else {
        for (const queryKey of sensitiveUrlQueryKeys(url)) {
          errors.push({
            file: "mcp.yaml",
            path: `servers.${serverId}.url`,
            message: `HTTP MCP server '${serverId}' 的 url 不应包含敏感查询参数 '${queryKey}'，请改用 bearer_token_env_var 或 OAuth 环境变量`,
          });
        }
      }
      if (server.command !== undefined) {
        errors.push({
          file: "mcp.yaml",
          path: `servers.${serverId}.command`,
          message: `HTTP MCP server '${serverId}' 不应配置 command 字段`,
        });
      }
      const bearerTokenEnvVar = server.bearer_token_env_var;
      if (bearerTokenEnvVar !== undefined && (typeof bearerTokenEnvVar !== "string" || !isEnvName(bearerTokenEnvVar))) {
        errors.push({
          file: "mcp.yaml",
          path: `servers.${serverId}.bearer_token_env_var`,
          message: `HTTP MCP server '${serverId}' 的 bearer_token_env_var 必须是环境变量名`,
        });
      }
      continue;
    }

    const command = typeof server.command === "string" ? server.command : undefined;
    if (!command) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.command`,
        message: `stdio MCP server '${serverId}' 缺少 command 字段`,
      });
    }
    if (server.url !== undefined) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.url`,
        message: `stdio MCP server '${serverId}' 不应配置 url 字段`,
      });
    }
    validateMcpEnv(errors, serverId, server.env);
  }

  return errors;
}

function isKnownModelOrRole(value: string, modelIds: ReadonlySet<string>): boolean {
  return isModelRole(value) || modelIds.has(value);
}

function validateProviderCatalog(errors: ValidationError[], providersConfig: ProviderYaml): Record<string, unknown> {
  const providers = providersConfig.providers;
  if (providers === undefined) return {};
  if (!isRecord(providers)) {
    errors.push({
      file: "provider.yaml",
      path: "providers",
      message: "providers 必须是对象",
    });
    return {};
  }

  for (const [providerId, provider] of Object.entries(providers)) {
    const pathPrefix = `providers.${providerId}`;
    if (!isRecord(provider)) {
      errors.push({
        file: "provider.yaml",
        path: pathPrefix,
        message: `provider '${providerId}' 必须是对象`,
      });
      continue;
    }

    validateRequiredProviderString(errors, providerId, provider, "base_url");
    const apiKey = validateRequiredProviderString(errors, providerId, provider, "api_key");
    if (apiKey && !isEnvReference(apiKey)) {
      errors.push({
        file: "provider.yaml",
        path: `${pathPrefix}.api_key`,
        message: `provider '${providerId}' 的 api_key 必须使用 \${ENV_NAME} 环境变量引用`,
      });
    }
    validateOptionalString(errors, "provider.yaml", `${pathPrefix}.name`, provider.name);
    validateOptionalString(errors, "provider.yaml", `${pathPrefix}.short_name`, provider.short_name);
    validateOptionalNumber(errors, "provider.yaml", `${pathPrefix}.timeout`, provider.timeout);
    validateOptionalNumber(errors, "provider.yaml", `${pathPrefix}.chunkTimeout`, provider.chunkTimeout);
  }

  return providers;
}

function validateRequiredProviderString(
  errors: ValidationError[],
  providerId: string,
  provider: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = provider[field];
  if (value === undefined || value === null) {
    errors.push({
      file: "provider.yaml",
      path: `providers.${providerId}.${field}`,
      message: `provider '${providerId}' 缺少 ${field} 字段`,
    });
    return undefined;
  }
  if (typeof value !== "string" || !value) {
    errors.push({
      file: "provider.yaml",
      path: `providers.${providerId}.${field}`,
      message: `provider '${providerId}' 的 ${field} 必须是非空字符串`,
    });
    return undefined;
  }
  return value;
}

function validateAgentShape(
  errors: ValidationError[],
  agentId: string,
  agent: Readonly<Record<string, unknown>>,
): void {
  const prompt = agent.prompt;
  if (prompt !== undefined) {
    if (!isRecord(prompt)) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.prompt`,
        message: `agent '${agentId}' 的 prompt 必须是对象`,
      });
    } else {
      validateOptionalString(errors, "agents.yaml", `agents.${agentId}.prompt.system`, prompt.system);
      validateOptionalString(errors, "agents.yaml", `agents.${agentId}.prompt.append`, prompt.append);
    }
  }

  const permission = agent.permission;
  if (permission !== undefined) {
    if (!isRecord(permission)) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.permission`,
        message: `agent '${agentId}' 的 permission 必须是对象`,
      });
      return;
    }
    for (const [permissionKey, permissionValue] of Object.entries(permission)) {
      if (typeof permissionValue !== "string" || !permissionValue) {
        errors.push({
          file: "agents.yaml",
          path: `agents.${agentId}.permission.${permissionKey}`,
          message: `agent '${agentId}' 的 permission.${permissionKey} 必须是非空字符串`,
        });
      }
    }
  }
}

function validateModelCatalogEntry(
  errors: ValidationError[],
  modelId: string,
  model: unknown,
  modelIds: ReadonlySet<string>,
  knownProviderGroups: Readonly<Record<string, string>>,
  providerInstances: Readonly<Record<string, unknown>>,
): void {
  const pathPrefix = `models.${modelId}`;
  if (!isRecord(model)) {
    errors.push({
      file: "models.yaml",
      path: pathPrefix,
      message: `模型 '${modelId}' 必须是对象`,
    });
    return;
  }

  const providerGroup = validateRequiredString(errors, model, modelId, "provider_group");
  if (providerGroup) {
    const defaultProviderId = knownProviderGroups[providerGroup];
    if (!defaultProviderId) {
      errors.push({
        file: "models.yaml",
        path: `${pathPrefix}.provider_group`,
        message: `模型 '${modelId}' 使用了未知 provider_group '${providerGroup}'`,
      });
    } else if (!providerInstances[defaultProviderId]) {
      errors.push({
        file: "models.yaml",
        path: `${pathPrefix}.provider_group`,
        message: `模型 '${modelId}' 的 provider_group '${providerGroup}' 默认指向 provider '${defaultProviderId}'，但在 provider.yaml 中未定义`,
      });
    }
  }

  validateRequiredString(errors, model, modelId, "model_name");
  validateNumberObject(errors, model, modelId, "cost", ["input", "output"]);
  validateNumberObject(errors, model, modelId, "limits", ["context_window", "max_output"]);

  const capabilities = model.capabilities;
  if (capabilities !== undefined && !isStringArray(capabilities)) {
    errors.push({
      file: "models.yaml",
      path: `${pathPrefix}.capabilities`,
      message: `模型 '${modelId}' 的 capabilities 必须是字符串数组`,
    });
  }

  const temperature = model.temperature;
  if (temperature !== undefined && !isFiniteNumber(temperature)) {
    errors.push({
      file: "models.yaml",
      path: `${pathPrefix}.temperature`,
      message: `模型 '${modelId}' 的 temperature 必须是数字`,
    });
  }

  const fallback = model.fallback;
  if (fallback === undefined) return;
  if (!isStringArray(fallback)) {
    errors.push({
      file: "models.yaml",
      path: `${pathPrefix}.fallback`,
      message: `模型 '${modelId}' 的 fallback 必须是字符串数组`,
    });
    return;
  }
  for (const fallbackModelId of fallback) {
    if (!modelIds.has(fallbackModelId)) {
      errors.push({
        file: "models.yaml",
        path: `${pathPrefix}.fallback`,
        message: `模型 '${modelId}' 的 fallback 引用未定义模型 '${fallbackModelId}'`,
      });
    }
  }
}

function validateRequiredString(
  errors: ValidationError[],
  source: Readonly<Record<string, unknown>>,
  modelId: string,
  field: string,
): string | undefined {
  const value = source[field];
  if (value === undefined || value === null) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${field}`,
      message: `模型 '${modelId}' 缺少 ${field} 字段`,
    });
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${field}`,
      message: `模型 '${modelId}' 的 ${field} 必须是非空字符串`,
    });
    return undefined;
  }
  return value;
}

function validateNumberObject(
  errors: ValidationError[],
  source: Readonly<Record<string, unknown>>,
  modelId: string,
  field: string,
  children: readonly string[],
): void {
  const value = source[field];
  if (value === undefined || value === null) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${field}`,
      message: `模型 '${modelId}' 缺少 ${field} 字段`,
    });
    return;
  }
  if (!isRecord(value)) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${field}`,
      message: `模型 '${modelId}' 的 ${field} 必须是对象`,
    });
    return;
  }
  for (const child of children) {
    validateRequiredPositiveNumber(errors, value, modelId, `${field}.${child}`);
  }
}

function validateRequiredPositiveNumber(
  errors: ValidationError[],
  source: Readonly<Record<string, unknown>>,
  modelId: string,
  fieldPath: string,
): void {
  const field = fieldPath.slice(fieldPath.lastIndexOf(".") + 1);
  const value = source[field];
  if (value === undefined || value === null) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${fieldPath}`,
      message: `模型 '${modelId}' 缺少 ${fieldPath} 字段`,
    });
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${fieldPath}`,
      message: `模型 '${modelId}' 的 ${fieldPath} 必须是正数`,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateOptionalString(errors: ValidationError[], file: string, path: string, value: unknown): void {
  if (value !== undefined && (typeof value !== "string" || !value)) {
    errors.push({
      file,
      path,
      message: `${path} 必须是非空字符串`,
    });
  }
}

function validateOptionalNumber(errors: ValidationError[], file: string, path: string, value: unknown): void {
  if (value !== undefined && !isFiniteNumber(value)) {
    errors.push({
      file,
      path,
      message: `${path} 必须是数字`,
    });
  }
}

function validateOptionalBoolean(errors: ValidationError[], file: string, path: string, value: unknown): void {
  if (value !== undefined && typeof value !== "boolean") {
    errors.push({
      file,
      path,
      message: `${path} 必须是布尔值`,
    });
  }
}

function isModelRole(value: string): boolean {
  return value === "primary" || value === "reasoning" || value === "fast";
}

function isEnvName(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(value);
}

function validateMcpServerShape(
  errors: ValidationError[],
  serverId: string,
  server: Readonly<Record<string, unknown>>,
): void {
  const transport = server.transport;
  if (transport !== undefined && transport !== "stdio" && transport !== "http") {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.transport`,
      message: `MCP server '${serverId}' 的 transport 必须是 stdio 或 http`,
    });
  }
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.command`, server.command);
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.url`, server.url);
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.bearer_token_env_var`, server.bearer_token_env_var);
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.oauth_client_id`, server.oauth_client_id);
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.oauth_resource`, server.oauth_resource);
  if (server.args !== undefined && !isStringArray(server.args)) {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.args`,
      message: `MCP server '${serverId}' 的 args 必须是字符串数组`,
    });
  }
}

function validateMcpEnv(errors: ValidationError[], serverId: string, env: unknown): void {
  if (env === undefined) return;
  if (!isRecord(env)) {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.env`,
      message: `stdio MCP server '${serverId}' 的 env 必须是对象`,
    });
    return;
  }

  for (const [envKey, envValue] of Object.entries(env)) {
    if (!isEnvName(envKey)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.env.${envKey}`,
        message: `stdio MCP server '${serverId}' 的 env key '${envKey}' 必须是环境变量名`,
      });
    }

    if (typeof envValue !== "string") {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.env.${envKey}`,
        message: `stdio MCP server '${serverId}' 的 env '${envKey}' 必须是字符串`,
      });
      continue;
    }

    if (isSensitiveName(envKey) && !isEnvReference(envValue)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.env.${envKey}`,
        message: `stdio MCP server '${serverId}' 的敏感 env '${envKey}' 必须使用 \${ENV_NAME} 占位，不允许写入明文`,
      });
    }

    if (looksLikeSecretLiteral(envValue)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.env.${envKey}`,
        message: `stdio MCP server '${serverId}' 的 env '${envKey}' 疑似包含明文 secret，请改为 \${ENV_NAME} 环境变量引用`,
      });
    }
  }
}

function sensitiveUrlQueryKeys(url: string): string[] {
  try {
    return [...new URL(url).searchParams.keys()].filter(isSensitiveName);
  } catch {
    return [];
  }
}

function isSensitiveName(value: string): boolean {
  return /(API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|AUTH|BEARER|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)/i.test(value);
}

function isEnvReference(value: string): boolean {
  return /^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value);
}

function looksLikeSecretLiteral(value: string): boolean {
  return /^(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]{20,}|SEC[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(
    value,
  );
}
