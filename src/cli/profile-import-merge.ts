import { validateTriRoleProfile, type TriRoleProfile } from "../protocol/tri-role.ts";

export type ProfileImportValidationResult = {
  validProfiles: TriRoleProfile[];
  errors: string[];
};

export type MergeProfileYamlResult = {
  yaml: string;
  changedProfileIds: string[];
  replacedProfileIds: string[];
  appendedProfileIds: string[];
};

type ProfileYamlChunk = {
  profileId?: string;
  text: string;
};

export function validateImportedProfiles(profiles: unknown[]): ProfileImportValidationResult {
  const errors: string[] = [];
  const validProfiles: TriRoleProfile[] = [];

  for (const obj of profiles) {
    const validationErrors = validateTriRoleProfile(obj);
    if (validationErrors.length > 0) {
      for (const error of validationErrors) {
        const profileId = importedProfileId(obj);
        errors.push(`[${profileId}] ${error.path}: ${error.message}`);
      }
    } else {
      validProfiles.push(obj as TriRoleProfile);
    }
  }

  return { validProfiles, errors };
}

export function mergeProfileYaml(existingYaml: string, profiles: TriRoleProfile[]): MergeProfileYamlResult {
  const entries = new Map(profiles.map((profile) => [profile.profile_id, buildYamlEntry(profile)]));
  const replacedProfileIds: string[] = [];
  const chunks = splitProfileYaml(existingYaml);
  const mergedChunks = chunks
    .map((chunk): string => {
      if (chunk.profileId && entries.has(chunk.profileId)) {
        replacedProfileIds.push(chunk.profileId);
        return entries.get(chunk.profileId) ?? chunk.text;
      }
      return chunk.text.trimEnd();
    })
    .filter((chunk) => chunk.trim().length > 0);

  const appendedProfileIds = profiles
    .map((profile) => profile.profile_id)
    .filter((profileId) => !replacedProfileIds.includes(profileId));
  const appendedEntries = appendedProfileIds
    .map((profileId) => entries.get(profileId))
    .filter((entry): entry is string => entry !== undefined);
  const yaml = [...mergedChunks, ...appendedEntries].join("\n\n");

  return {
    yaml: `${yaml.trimEnd()}\n`,
    changedProfileIds: profiles.map((profile) => profile.profile_id),
    replacedProfileIds,
    appendedProfileIds,
  };
}

export function buildYamlEntry(profile: TriRoleProfile): string {
  const name = profile.name ? `\n  name: ${profile.name}` : "";
  const compaction = profile.compaction ? buildYamlCompaction(profile.compaction) : "";
  return `${profile.profile_id}:${name}
  models:
    primary: ${profile.roles.primary.model}
    reasoning: ${profile.roles.reasoning.model}
    fast: ${profile.roles.fast.model}${compaction}`;
}

export function validateImportSecurity(profiles: TriRoleProfile[], modelsConfig: Record<string, unknown>): string[] {
  const validModels = new Set(Object.keys(modelsConfig));
  const warnings: string[] = [];
  const urlPattern = /:\/\/|^https?[.:]/i;

  for (const profile of profiles) {
    for (const [role, { model }] of Object.entries(profile.roles)) {
      if (!validModels.has(model)) {
        warnings.push(`[${profile.profile_id}] roles.${role}.model '${model}' 不在已知模型列表中`);
      }
      if (urlPattern.test(model)) {
        warnings.push(`[${profile.profile_id}] roles.${role}.model '${model}' 包含可疑 URL，非标准模型 ID`);
      }
    }

    const compactionModel = profile.compaction?.model_role;
    if (
      compactionModel &&
      !validModels.has(compactionModel) &&
      !["primary", "reasoning", "fast"].includes(compactionModel)
    ) {
      warnings.push(`[${profile.profile_id}] compaction.model_role '${compactionModel}' 不是已知模型或角色`);
    }
  }

  return warnings;
}

function buildYamlCompaction(c: NonNullable<TriRoleProfile["compaction"]>): string {
  let yaml = "\n  compaction:";
  if (c.threshold !== undefined) yaml += `\n    threshold: ${c.threshold}`;
  if (c.max_input_tokens !== undefined) yaml += `\n    max_input_tokens: ${c.max_input_tokens}`;
  if (c.model_role) yaml += `\n    model: ${c.model_role}`;
  return yaml;
}

function splitProfileYaml(existingYaml: string): ProfileYamlChunk[] {
  const lines = existingYaml.replaceAll("\r\n", "\n").split("\n");
  const chunks: ProfileYamlChunk[] = [];
  let startIndex = 0;
  let currentProfileId: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const profileId = topLevelProfileId(lines[index] ?? "");
    if (!profileId) continue;

    if (index > startIndex) {
      chunks.push(profileYamlChunk(currentProfileId, lines.slice(startIndex, index).join("\n")));
    }
    startIndex = index;
    currentProfileId = profileId;
  }

  if (startIndex < lines.length) {
    chunks.push(profileYamlChunk(currentProfileId, lines.slice(startIndex).join("\n")));
  }

  return chunks;
}

function profileYamlChunk(profileId: string | undefined, text: string): ProfileYamlChunk {
  return profileId ? { profileId, text } : { text };
}

function topLevelProfileId(line: string): string | undefined {
  return /^([A-Za-z0-9_-]+):\s*$/.exec(line)?.[1];
}

function importedProfileId(obj: unknown): string {
  if (typeof obj === "object" && obj !== null && typeof (obj as Record<string, unknown>).profile_id === "string") {
    return String((obj as Record<string, unknown>).profile_id);
  }
  return "unknown";
}
