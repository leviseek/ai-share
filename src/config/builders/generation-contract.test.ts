import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import type { AgentsYaml, GlobalYaml, McpYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "../../types.ts";
import {
  applyProviderGroups,
  buildCodexAgentConfigs,
  buildCodexCliConfigs,
  buildOmxConfigs,
  buildRuntimeManifest,
  defaultProfileId,
  formatCodexConfigToml,
} from "../../config-builders.ts";
import type { GeneratorPaths } from "../../cli/paths.ts";
import { parseYamlObject } from "../../yaml.ts";

const projectRoot = resolve(import.meta.dir, "..", "..", "..");

describe("Codex/OMX generation contract", () => {
  test("formats the coding Codex profile TOML in the expected shape", () => {
    const fixture = loadFixture();
    const models = applyProviderGroups(fixture.models, fixture.providers.providers ?? {}, {
      gpt: "codexapis",
      deepseek: "deepseek",
    });

    const codexConfigs = buildCodexCliConfigs(
      fixture.providers.providers ?? {},
      models,
      fixture.profiles,
      fixture.mcp,
      (profileId) => `/codex/${profileId}.AGENTS.md`,
    );

    expect(defaultProfileId(fixture.global, fixture.profiles)).toBe("balanced");
    expect(formatCodexConfigToml(required(codexConfigs.coding))).toBe(`model = "gpt-5.3-codex"
model_provider = "codexapis"
model_reasoning_effort = "high"
model_instructions_file = "/codex/coding.AGENTS.md"

[agents]
max_threads = 6
max_depth = 2
job_max_runtime_seconds = 600

[model_providers.codexapis]
name = "Codex APIs"
base_url = "https://www.codexapis.com/v1"
env_key = "CODEXAPIS_API_KEY"

[model_providers.packyapi]
name = "Packy API"
base_url = "https://www.packyapi.com/v1"
env_key = "PACKYAPI_API_KEY"

[model_providers.axasapi]
name = "Axas API"
base_url = "https://api.asxs.top/v1"
env_key = "AXASAPI_API_KEY"

[model_providers.deepseek]
name = "DeepSeek"
base_url = "https://api.deepseek.com"
env_key = "DEEPSEEK_API_KEY"
`);
  });

  test("resolves provider-group overrides without changing profile semantics", () => {
    const fixture = loadFixture();
    const models = applyProviderGroups(fixture.models, fixture.providers.providers ?? {}, {
      gpt: "packyapi",
      deepseek: "deepseek",
    });

    const codexConfigs = buildCodexCliConfigs(
      fixture.providers.providers ?? {},
      models,
      fixture.profiles,
      fixture.mcp,
      (profileId) => `/codex/${profileId}.AGENTS.md`,
    );

    const balanced = required(codexConfigs.balanced);
    expect(balanced.model).toBe("gpt-5.5");
    expect(balanced.model_provider).toBe("packyapi");
    expect(balanced.model_providers.packyapi?.env_key).toBe("PACKYAPI_API_KEY");
  });

  test("maps profile roles into OMX model slots and Codex agent configs", () => {
    const fixture = loadFixture();
    const models = applyProviderGroups(fixture.models, fixture.providers.providers ?? {}, {
      gpt: "codexapis",
      deepseek: "deepseek",
    });

    expect(buildOmxConfigs(models, fixture.profiles)["ds-max"]).toEqual({
      env: {
        OMX_DEFAULT_FRONTIER_MODEL: "deepseek-v4-pro",
        OMX_DEFAULT_STANDARD_MODEL: "deepseek-v4-pro",
        OMX_DEFAULT_SPARK_MODEL: "deepseek-v4-flash",
      },
      models: {
        default: "deepseek-v4-pro",
        team: "deepseek-v4-pro",
        autopilot: "deepseek-v4-pro",
        ralph: "deepseek-v4-pro",
        team_low_complexity: "deepseek-v4-flash",
      },
      agentReasoning: {
        prometheus: "high",
        oracle: "high",
        metis: "high",
        momus: "low",
      },
    });

    const agents = buildCodexAgentConfigs(fixture.agents, models, fixture.profiles, "balanced");
    expect(agents.explorer).toMatchObject({
      name: "explorer",
      model: "gpt-5.4-mini",
      sandbox_mode: "read-only",
    });
    expect(agents.sisyphus?.developer_instructions).toContain("AI_GUIDELINES.md");
  });

  test("builds the runtime manifest with Codex/OMX ownership only", () => {
    const manifest = buildRuntimeManifest({
      paths: fakePaths(),
      defaultProfileId: "balanced",
      profileIds: ["balanced", "coding"],
      agentIds: ["sisyphus", "explorer"],
      mcpServerIds: ["filesystem"],
      skillIds: ["git-master", "ai-share-generator"],
      instructionFilesByProfile: {
        balanced: ["/repo/AI_GUIDELINES.md", "/repo/memory/user/profile.md"],
        coding: ["/repo/AI_GUIDELINES.md", "/repo/memory/profiles/coding.yaml"],
      },
    });

    expect(manifest).toEqual({
      version: 2,
      scope: "user",
      primary_stack: "codex+omx",
      default_profile: "balanced",
      platforms: ["windows", "linux", "macos"],
      memory: {
        v1: "load-existing-memory",
        v2: "proposal-distillation-review",
      },
      paths: {
        codex_home: "/home/user/.codex",
        bin: "/home/user/.local/bin",
        codex_skills: "/home/user/.codex/skills",
      },
      managed: {
        codex_profiles: ["balanced", "coding"],
        omx_profiles: ["balanced", "coding"],
        codex_agents: ["sisyphus", "explorer"],
        mcp_servers: ["filesystem"],
        skills: ["git-master", "ai-share-generator"],
        instruction_files: ["/repo/AI_GUIDELINES.md", "/repo/memory/user/profile.md"],
        profile_instruction_files: {
          balanced: ["/repo/AI_GUIDELINES.md", "/repo/memory/user/profile.md"],
          coding: ["/repo/AI_GUIDELINES.md", "/repo/memory/profiles/coding.yaml"],
        },
      },
    });
  });
});

function loadFixture(): {
  global: GlobalYaml;
  providers: ProviderYaml;
  models: ModelsYaml;
  profiles: ProfilesYaml;
  agents: AgentsYaml;
  mcp: McpYaml;
} {
  return {
    global: loadYaml("global.yaml") as GlobalYaml,
    providers: loadYaml("provider.yaml") as ProviderYaml,
    models: loadYaml("models.yaml") as ModelsYaml,
    profiles: loadYaml("profiles.yaml") as ProfilesYaml,
    agents: loadYaml("agents.yaml") as AgentsYaml,
    mcp: loadYaml("mcp.yaml") as McpYaml,
  };
}

function loadYaml(fileName: string): unknown {
  return parseYamlObject(readFileSync(resolve(projectRoot, "config", fileName), "utf8"));
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing contract fixture value");
  return value;
}

function fakePaths(): GeneratorPaths {
  return {
    projectRoot: "/repo",
    configDir: "/repo/config",
    binDir: "/repo/bin",
    aiWorkspaceDir: "/home/user/ai-workspace",
    workspaceAiShareDir: "/home/user/ai-workspace/ai-share",
    homeDir: "/home/user",
    targetCodexConfigDir: "/home/user/.codex",
    targetCodexAgentDir: "/home/user/.codex/agents",
    targetCodexConfig: "/home/user/.codex/config.toml",
    targetCodexInstructions: "/home/user/.codex/AGENTS.md",
    targetOmxConfig: "/home/user/.codex/.omx-config.json",
    targetRuntimeManifest: "/home/user/.codex/ai-share.runtime.json",
    targetBinDir: "/home/user/.local/bin",
    targetCodexSkillsDir: "/home/user/.codex/skills",
  };
}
