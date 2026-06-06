import type { GlobalYaml, ProfilesYaml } from "../../types.ts";
import { requireRecord, requireString } from "../validation.ts";

export function defaultProfileId(globalConfig: GlobalYaml, profilesConfig: ProfilesYaml): string {
  const profiles = requireRecord(profilesConfig, "profiles");
  const configuredDefaultProfile = globalConfig.default_profile;
  if (configuredDefaultProfile) {
    if (!profiles[configuredDefaultProfile]) {
      throw new Error(`global.default_profile 指向未定义 profile：${configuredDefaultProfile}`);
    }
    return configuredDefaultProfile;
  }

  if (profiles.balanced) return "balanced";
  return requireString(Object.keys(profiles)[0], "profiles 首个配置");
}
