import type { AgentProfileSource, GlobalYaml, ModelsYaml, ProfilesYaml } from "../../types.ts";
import { MODEL_ROLES } from "../schema-spec.ts";
import { isFiniteNumber, isModelRole, isRecord, type ValidationError } from "./common.ts";

export function validateProfiles(
  errors: ValidationError[],
  profilesConfig: ProfilesYaml,
  modelIds: ReadonlySet<string>,
  modelsConfig: ModelsYaml,
): void {
  for (const [profileId, profile] of Object.entries(profilesConfig)) {
    if (!isRecord(profile)) continue;
    validateProfileModelReferences(errors, profileId, profile, modelIds);
    validateProfileProviderGroupConsistency(errors, profileId, profile, modelsConfig);
    validateProfileCompaction(errors, profileId, profile, modelIds);
  }
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

function validateProfileModelReferences(
  errors: ValidationError[],
  profileId: string,
  profile: AgentProfileSource,
  modelIds: ReadonlySet<string>,
): void {
  for (const role of MODEL_ROLES) {
    const modelId = profile.models?.[role];
    if (typeof modelId === "string" && !modelIds.has(modelId)) {
      errors.push({
        file: "profiles.yaml",
        path: `profiles.${profileId}.models.${role}`,
        message: `profile '${profileId}' 的 models.${role} 引用未定义模型 '${modelId}'`,
      });
    }
  }
}

function validateProfileProviderGroupConsistency(
  errors: ValidationError[],
  profileId: string,
  profile: AgentProfileSource,
  modelsConfig: ModelsYaml,
): void {
  const groupsByRole = MODEL_ROLES.map((role) => {
    const modelId = profile.models?.[role];
    if (typeof modelId !== "string") return undefined;
    const groupId = modelsConfig[modelId]?.provider_group;
    if (typeof groupId !== "string" || !groupId) return undefined;
    return { role, modelId, groupId };
  }).filter(
    (entry): entry is { role: (typeof MODEL_ROLES)[number]; modelId: string; groupId: string } => entry !== undefined,
  );

  const uniqueGroups = [...new Set(groupsByRole.map((entry) => entry.groupId))];
  if (uniqueGroups.length <= 1) return;

  errors.push({
    file: "profiles.yaml",
    path: `profiles.${profileId}.models`,
    message: `profile '${profileId}' 的 primary/reasoning/fast 必须使用同一 provider_group，当前为 ${groupsByRole
      .map((entry) => `${entry.role}=${entry.modelId}(${entry.groupId})`)
      .join("、")}`,
  });
}

function validateProfileCompaction(
  errors: ValidationError[],
  profileId: string,
  profile: AgentProfileSource,
  modelIds: ReadonlySet<string>,
): void {
  const compaction = profile.compaction;
  if (!isRecord(compaction)) return;

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
  if (typeof compactionModel === "string" && !isKnownModelOrRole(compactionModel, modelIds)) {
    errors.push({
      file: "profiles.yaml",
      path: `profiles.${profileId}.compaction.model`,
      message: `profile '${profileId}' 的 compaction.model 引用未定义模型或角色 '${compactionModel}'`,
    });
  }
}

function isKnownModelOrRole(value: string, modelIds: ReadonlySet<string>): boolean {
  return isModelRole(value) || modelIds.has(value);
}
