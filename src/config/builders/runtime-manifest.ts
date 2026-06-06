import type { GeneratorPaths } from "../../cli/paths.ts";
import type { ProfileCompaction, ProfilesYaml } from "../../types.ts";

export type RuntimeManifest = {
  version: 2;
  scope: "user";
  primary_stack: "codex+omx";
  default_profile: string;
  platforms: ["windows", "linux", "macos"];
  memory: {
    v1: "load-existing-memory";
    v2: "proposal-distillation-review";
  };
  paths: {
    codex_home: string;
    codex_env: string;
    bin: string;
    codex_skills: string;
  };
  managed: {
    codex_profiles: string[];
    omx_profiles: string[];
    codex_agents: string[];
    codex_env_vars: string[];
    local_config_overlays: string[];
    mcp_servers: string[];
    skills: string[];
    instruction_files: string[];
    profile_instruction_files: Record<string, string[]>;
    profile_compaction: Record<string, ProfileCompaction>;
  };
};

export function buildRuntimeManifest(input: {
  paths: GeneratorPaths;
  defaultProfileId: string;
  profileIds: string[];
  agentIds: string[];
  mcpServerIds: string[];
  codexEnvVarNames: string[];
  localConfigOverlays?: string[];
  skillIds: string[];
  instructionFilesByProfile: Record<string, string[]>;
  profilesConfig: ProfilesYaml;
}): RuntimeManifest {
  return {
    version: 2,
    scope: "user",
    primary_stack: "codex+omx",
    default_profile: input.defaultProfileId,
    platforms: ["windows", "linux", "macos"],
    memory: {
      v1: "load-existing-memory",
      v2: "proposal-distillation-review",
    },
    paths: {
      codex_home: input.paths.targetCodexConfigDir,
      codex_env: input.paths.targetCodexEnv,
      bin: input.paths.targetBinDir,
      codex_skills: input.paths.targetCodexSkillsDir,
    },
    managed: {
      codex_profiles: input.profileIds,
      omx_profiles: input.profileIds,
      codex_agents: input.agentIds,
      codex_env_vars: input.codexEnvVarNames,
      local_config_overlays: input.localConfigOverlays ?? [],
      mcp_servers: input.mcpServerIds,
      skills: input.skillIds,
      instruction_files: input.instructionFilesByProfile[input.defaultProfileId] ?? [],
      profile_instruction_files: input.instructionFilesByProfile,
      profile_compaction: profileCompaction(input.profileIds, input.profilesConfig),
    },
  };
}

function profileCompaction(profileIds: string[], profilesConfig: ProfilesYaml): Record<string, ProfileCompaction> {
  return Object.fromEntries(
    profileIds.flatMap((profileId) => {
      const compaction = profilesConfig[profileId]?.compaction;
      return compaction ? [[profileId, compaction]] : [];
    }),
  );
}
