#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseYamlObject } from "../yaml.ts";
import { validateTriRoleProfile, type TriRoleProfile } from "../protocol/tri-role.ts";
import type { ProfilesYaml } from "../types.ts";

function main(args: string[]) {
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const inputPath = args.find((a) => !a.startsWith("--"));

  if (!inputPath) {
    console.error("用法：bun run src/cli/profile-import.ts <path.json> [--dry-run] [--force]");
    process.exit(1);
  }

  // Read import file
  let raw: string;
  try {
    raw = readFileSync(inputPath, "utf8");
  } catch {
    console.error(`无法读取文件：${inputPath}`);
    process.exit(1);
  }

  let profiles: unknown[];
  try {
    const parsed: unknown = JSON.parse(raw);
    profiles = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    console.error("无效的 JSON 格式");
    process.exit(1);
  }

  // Validate each profile
  const errors: string[] = [];
  const validProfiles: TriRoleProfile[] = [];
  for (const obj of profiles) {
    const validationErrors = validateTriRoleProfile(obj);
    if (validationErrors.length > 0) {
      for (const e of validationErrors) {
        const profileId =
          typeof (obj as Record<string, unknown>).profile_id === "string"
            ? String((obj as Record<string, unknown>).profile_id)
            : "unknown";
        errors.push(`[${profileId}] ${e.path}: ${e.message}`);
      }
    } else {
      validProfiles.push(obj as TriRoleProfile);
    }
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    console.error(`\n${errors.length} 个验证错误。`);
    process.exit(1);
  }

  // Security validation (skip with --force)
  if (!force) {
    const configDir = resolve(import.meta.dirname, "../../config");
    const modelsRaw = readFileSync(resolve(configDir, "models.yaml"), "utf8");
    const modelsConfig = parseYamlObject(modelsRaw);

    const secWarnings = validateImportSecurity(validProfiles, modelsConfig);
    if (secWarnings.length > 0) {
      console.error("安全警告：");
      for (const w of secWarnings) console.error(`  ⚠ ${w}`);
      console.error("\n使用 --force 跳过安全校验。");
      process.exit(1);
    }
  }

  // Check against existing profiles
  const configDir = resolve(import.meta.dirname, "../../config");
  const profilesPath = resolve(configDir, "profiles.yaml");
  const existingYaml = readFileSync(profilesPath, "utf8");
  const existingConfig = parseYamlObject(existingYaml) as ProfilesYaml;

  const conflicts = validProfiles.filter((p) => existingConfig[p.profile_id]);
  if (conflicts.length > 0 && !force) {
    console.error(`以下 profile 已存在：${conflicts.map((p) => p.profile_id).join(", ")}`);
    console.error("使用 --force 覆盖。");
    process.exit(1);
  }

  // Build YAML entries for new profiles
  const newEntries = validProfiles.filter((p) => force || !existingConfig[p.profile_id]).map((p) => buildYamlEntry(p));

  if (newEntries.length === 0) {
    console.log("没有需要导入的 profile。");
    process.exit(0);
  }

  if (dryRun) {
    console.log("将导入以下 profile：");
    for (const entry of newEntries) {
      console.log(`\n${entry}\n---`);
    }
    process.exit(0);
  }

  // Append to profiles.yaml
  const fullYaml = existingYaml.trimEnd() + "\n\n" + newEntries.join("\n") + "\n";
  writeFileSync(profilesPath, fullYaml, "utf8");
  console.log(`已导入 ${newEntries.length} 个 profile 到 ${profilesPath}`);
}

function buildYamlEntry(profile: TriRoleProfile): string {
  const name = profile.name ? `\n  name: ${profile.name}` : "";
  const compaction = profile.compaction ? buildYamlCompaction(profile.compaction) : "";
  return `${profile.profile_id}:${name}
  models:
    primary: ${profile.roles.primary.model}
    reasoning: ${profile.roles.reasoning.model}
    fast: ${profile.roles.fast.model}${compaction}`;
}

function buildYamlCompaction(c: NonNullable<TriRoleProfile["compaction"]>): string {
  let yaml = "\n  compaction:";
  if (c.threshold !== undefined) yaml += `\n    threshold: ${c.threshold}`;
  if (c.max_input_tokens !== undefined) yaml += `\n    max_input_tokens: ${c.max_input_tokens}`;
  if (c.model_role) yaml += `\n    model: ${c.model_role}`;
  return yaml;
}

function validateImportSecurity(profiles: TriRoleProfile[], modelsConfig: Record<string, unknown>): string[] {
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

main(process.argv.slice(2));
