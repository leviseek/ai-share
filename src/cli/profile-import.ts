#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseYamlObject } from "../yaml.ts";
import type { ProfilesYaml } from "../types.ts";
import { mergeProfileYaml, validateImportedProfiles, validateImportSecurity } from "./profile-import-merge.ts";

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

  const { validProfiles, errors } = validateImportedProfiles(profiles);

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

  const profilesToImport = validProfiles.filter((profile) => force || !existingConfig[profile.profile_id]);

  if (profilesToImport.length === 0) {
    console.log("没有需要导入的 profile。");
    process.exit(0);
  }

  const merged = mergeProfileYaml(existingYaml, profilesToImport);

  if (dryRun) {
    console.log("将导入以下 profile：");
    for (const profileId of merged.replacedProfileIds) {
      console.log(`  覆盖：${profileId}`);
    }
    for (const profileId of merged.appendedProfileIds) {
      console.log(`  追加：${profileId}`);
    }
    console.log(`\n--- ${profilesPath} ---\n${merged.yaml}`);
    process.exit(0);
  }

  writeFileSync(profilesPath, merged.yaml, "utf8");
  console.log(`已导入 ${merged.changedProfileIds.length} 个 profile 到 ${profilesPath}`);
}

main(process.argv.slice(2));
