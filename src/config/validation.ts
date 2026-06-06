import type { AgentsYaml, GlobalYaml, McpYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "../types.ts";

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
 * 4. Provider group references exist in provider.yaml
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

  // 1. Profile model roles completeness
  for (const [profileId, profile] of Object.entries(profilesConfig)) {
    const models = profile.models;
    if (!models) {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}.models`,
        message: `profile '${profileId}' 缺少 'models' 字段`,
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
    const compaction = profile.compaction;
    if (compaction?.threshold !== undefined && compaction?.max_input_tokens !== undefined) {
      if (compaction.threshold > compaction.max_input_tokens) {
        errors.push({
          file: "profiles.yaml",
          path: `profiles.${profileId}.compaction`,
          message: `profile '${profileId}' 的 compaction.threshold (${compaction.threshold}) 超过 max_input_tokens (${compaction.max_input_tokens})`,
        });
      }
    }
    const compactionModel = compaction?.model;
    if (compactionModel && !isKnownModelOrRole(compactionModel, modelIds)) {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}.compaction.model`,
        message: `profile '${profileId}' 的 compaction.model 引用未定义模型或角色 '${compactionModel}'`,
      });
    }
  }

  // 4. Provider group model reference
  // provider_group in models.yaml is a logical group name (e.g. "gpt", "deepseek")
  // that maps to a concrete provider via CLI flags / env vars at runtime.
  // Validate that all referenced groups are known and resolve to existing providers.
  const knownProviderGroups: Record<string, string> = {
    gpt: "codexapis",
    deepseek: "deepseek",
  };
  const providerInstances = providersConfig.providers ?? {};
  for (const [modelId, model] of Object.entries(modelsConfig)) {
    const providerGroup = model.provider_group;
    if (!providerGroup) continue;
    const defaultProviderId = knownProviderGroups[providerGroup];
    if (!defaultProviderId) {
      errors.push({
        file: "models.yaml",
        path: `models.${modelId}.provider_group`,
        message: `模型 '${modelId}' 使用了未知 provider_group '${providerGroup}'`,
      });
    } else if (!providerInstances[defaultProviderId]) {
      errors.push({
        file: "models.yaml",
        path: `models.${modelId}.provider_group`,
        message: `模型 '${modelId}' 的 provider_group '${providerGroup}' 默认指向 provider '${defaultProviderId}'，但在 provider.yaml 中未定义`,
      });
    }

    const fallback = model.fallback;
    if (fallback !== undefined) {
      if (!Array.isArray(fallback)) {
        errors.push({
          file: "models.yaml",
          path: `models.${modelId}.fallback`,
          message: `模型 '${modelId}' 的 fallback 必须是数组`,
        });
      } else {
        for (const fallbackModelId of fallback) {
          if (!modelIds.has(fallbackModelId)) {
            errors.push({
              file: "models.yaml",
              path: `models.${modelId}.fallback`,
              message: `模型 '${modelId}' 的 fallback 引用未定义模型 '${fallbackModelId}'`,
            });
          }
        }
      }
    }
  }

  // 5. Agent model references
  for (const [agentId, agent] of Object.entries(agentsConfig.agents ?? {})) {
    const model = agent.model;
    if (!model) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.model`,
        message: `agent '${agentId}' 缺少 model 字段`,
      });
    } else if (!isModelRole(model)) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.model`,
        message: `agent '${agentId}' 的 model 必须引用 primary、reasoning 或 fast 角色`,
      });
    }
  }

  // 6. MCP server shape
  for (const [serverId, server] of Object.entries(mcpConfig.servers ?? {})) {
    const isHttp = server.transport === "http" || Boolean(server.url);
    if (isHttp) {
      if (!server.url) {
        errors.push({
          file: "mcp.yaml",
          path: `servers.${serverId}.url`,
          message: `HTTP MCP server '${serverId}' 缺少 url 字段`,
        });
      } else {
        for (const queryKey of sensitiveUrlQueryKeys(server.url)) {
          errors.push({
            file: "mcp.yaml",
            path: `servers.${serverId}.url`,
            message: `HTTP MCP server '${serverId}' 的 url 不应包含敏感查询参数 '${queryKey}'，请改用 bearer_token_env_var 或 OAuth 环境变量`,
          });
        }
      }
      if (server.command) {
        errors.push({
          file: "mcp.yaml",
          path: `servers.${serverId}.command`,
          message: `HTTP MCP server '${serverId}' 不应配置 command 字段`,
        });
      }
      if (server.bearer_token_env_var && !isEnvName(server.bearer_token_env_var)) {
        errors.push({
          file: "mcp.yaml",
          path: `servers.${serverId}.bearer_token_env_var`,
          message: `HTTP MCP server '${serverId}' 的 bearer_token_env_var 必须是环境变量名`,
        });
      }
      continue;
    }

    if (!server.command) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.command`,
        message: `stdio MCP server '${serverId}' 缺少 command 字段`,
      });
    }
    if (server.url) {
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

function isModelRole(value: string): boolean {
  return value === "primary" || value === "reasoning" || value === "fast";
}

function isEnvName(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(value);
}

function validateMcpEnv(errors: ValidationError[], serverId: string, env: Record<string, string> | undefined): void {
  for (const [envKey, envValue] of Object.entries(env ?? {})) {
    if (!isEnvName(envKey)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.env.${envKey}`,
        message: `stdio MCP server '${serverId}' 的 env key '${envKey}' 必须是环境变量名`,
      });
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
