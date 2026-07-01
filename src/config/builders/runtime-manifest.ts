import type { GeneratorPaths } from "../../cli/paths.ts";

export type RuntimeManifest = {
  version: 3;
  scope: "user";
  primary_stack: "codex";
  model: string;
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
    codex_config: string;
    codex_env_vars: string[];
    local_config_overlays: string[];
    mcp_servers: string[];
    skills: string[];
    instruction_files: string[];
  };
};

export function buildRuntimeManifest(input: {
  paths: GeneratorPaths;
  model: string;
  mcpServerIds: string[];
  codexEnvVarNames: string[];
  localConfigOverlays?: string[];
  skillIds: string[];
  instructionFiles: string[];
}): RuntimeManifest {
  return {
    version: 3,
    scope: "user",
    primary_stack: "codex",
    model: input.model,
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
      codex_config: input.paths.targetCodexConfig,
      codex_env_vars: input.codexEnvVarNames,
      local_config_overlays: input.localConfigOverlays ?? [],
      mcp_servers: input.mcpServerIds,
      skills: input.skillIds,
      instruction_files: input.instructionFiles,
    },
  };
}
