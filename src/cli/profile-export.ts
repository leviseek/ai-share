#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseYamlObject } from "../yaml.ts";
import type { ProfilesYaml } from "../types.ts";

type ExportedProfile = {
  protocol: "tri-role/v1";
  profile_id: string;
  name: string | undefined;
  roles: {
    primary: { model: string };
    reasoning: { model: string };
    fast: { model: string };
  };
  compaction:
    | {
        threshold: number | undefined;
        max_input_tokens: number | undefined;
        model_role: string | undefined;
      }
    | undefined;
  strategies: Record<string, unknown> | undefined;
};

function loadProfiles(): ProfilesYaml {
  const configDir = resolve(import.meta.dirname, "../../config");
  return parseYamlObject(readFileSync(resolve(configDir, "profiles.yaml"), "utf8")) as ProfilesYaml;
}

function exportProfile(profileId: string, profilesConfig: ProfilesYaml): ExportedProfile | null {
  const profile = profilesConfig[profileId];
  if (!profile) return null;

  const models = profile.models;
  if (!models?.primary || !models?.reasoning || !models?.fast) return null;

  return {
    protocol: "tri-role/v1",
    profile_id: profileId,
    name: profile.name,
    roles: {
      primary: { model: models.primary },
      reasoning: { model: models.reasoning },
      fast: { model: models.fast },
    },
    compaction: profile.compaction
      ? {
          threshold: profile.compaction.threshold,
          max_input_tokens: profile.compaction.max_input_tokens,
          model_role: profile.compaction.model,
        }
      : undefined,
    strategies: profile.strategies as Record<string, unknown> | undefined,
  };
}

function printUsage(profilesConfig: ProfilesYaml): void {
  console.error("用法：bun run src/cli/profile-export.ts <profile-id> [--all] [--output <path>]");
  console.error(`可用 profile：${Object.keys(profilesConfig).join(", ")}`);
}

function main(args: string[]): void {
  const allFlag = args.includes("--all");
  const outputIdx = args.indexOf("--output");
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;
  // first non-flag arg is the profile id
  const profileId = args.find((a) => !a.startsWith("--") && a !== (outputIdx >= 0 ? args[outputIdx + 1] : undefined));

  const profilesConfig = loadProfiles();

  if (allFlag) {
    const all = Object.keys(profilesConfig)
      .map((id) => exportProfile(id, profilesConfig))
      .filter((p): p is ExportedProfile => p !== null);
    const json = JSON.stringify(all, null, 2);
    if (outputPath) {
      writeFileSync(outputPath, json, "utf8");
      console.error(`已导出 ${all.length} 个 profile 到 ${outputPath}`);
    } else {
      console.log(json);
    }
    return;
  }

  if (!profileId) {
    printUsage(profilesConfig);
    process.exit(1);
  }

  const profile = exportProfile(profileId, profilesConfig);
  if (!profile) {
    console.error(`未找到 profile：${profileId}`);
    printUsage(profilesConfig);
    process.exit(1);
  }

  const json = JSON.stringify(profile, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, json, "utf8");
    console.error(`已导出 profile '${profileId}' 到 ${outputPath}`);
  } else {
    console.log(json);
  }
}

main(process.argv.slice(2));
