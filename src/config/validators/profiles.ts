import type { GlobalYaml, ProfilesYaml } from "../../types.ts";
import type { ValidationError } from "./common.ts";
import { isFiniteNumber, isModelRole, isRecord, validateOptionalBoolean, validateOptionalNumber } from "./common.ts";

export function validateProfiles(
  errors: ValidationError[],
  profilesConfig: ProfilesYaml,
  modelIds: ReadonlySet<string>,
): void {
  validateProfileModelRoles(errors, profilesConfig, modelIds);
  validateProfileCompaction(errors, profilesConfig, modelIds);
}

export function validateDefaultProfile(
  errors: ValidationError[],
  profilesConfig: ProfilesYaml,
  globalConfig: GlobalYaml,
): void {
  const defaultProfile = globalConfig.default_profile;
  if (defaultProfile && !profilesConfig[defaultProfile]) {
    errors.push({
      file: "global.yaml",
      path: "default_profile",
      message: `default_profile '${defaultProfile}' 在 profiles.yaml 中不存在`,
    });
  }
}

function validateProfileModelRoles(
  errors: ValidationError[],
  profilesConfig: ProfilesYaml,
  modelIds: ReadonlySet<string>,
): void {
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
}

function validateProfileCompaction(
  errors: ValidationError[],
  profilesConfig: ProfilesYaml,
  modelIds: ReadonlySet<string>,
): void {
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
}

function isKnownModelOrRole(value: string, modelIds: ReadonlySet<string>): boolean {
  return isModelRole(value) || modelIds.has(value);
}
