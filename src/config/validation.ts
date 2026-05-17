import type { GlobalYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "../types.ts";

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
 *
 * Economy profile intentionally has extreme threshold/max_input_tokens
 * values to disable compaction — that's valid.
 */
export function validateYamlConsistency(
  profilesConfig: ProfilesYaml,
  modelsConfig: ModelsYaml,
  providersConfig: ProviderYaml,
  globalConfig: GlobalYaml,
): ValidationError[] {
  const errors: ValidationError[] = [];

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
      if (!models[role]) {
        errors.push({
          file: "profiles.yaml",
          path: `profiles.${profileId}.models.${role}`,
          message: `profile '${profileId}' 缺少 'models.${role}' 字段`,
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
  }

  return errors;
}
