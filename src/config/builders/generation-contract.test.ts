import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import type { AgentsYaml, EnvYaml, GlobalYaml, McpYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "../../types.ts";
import {
  applyProviderGroups,
  buildCodexAgentConfigs,
  buildCodexEnvFileWithManagedBlock,
  buildCodexCliConfigs,
  buildOmxConfigs,
  buildRuntimeManifest,
  defaultProfileId,
  formatCodexConfigToml,
  formatCodexEnvFile,
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
      fixture.agents,
      fixture.mcp,
      (profileId) => `/codex/${profileId}.AGENTS.md`,
    );

    expect(defaultProfileId(fixture.global, fixture.profiles)).toBe("balanced");
    expect(formatCodexConfigToml(required(codexConfigs.coding))).toBe(`model = "gpt-5.5"
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
      fixture.agents,
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

    expect(buildOmxConfigs(models, fixture.profiles, fixture.agents)["ds-max"]).toEqual({
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

  test("formats the generated Codex .env with non-secret runtime variables", () => {
    const fixture = loadFixture();

    expect(formatCodexEnvFile(fixture.env)).toBe(`# BEGIN ai-share managed env
# Non-secret Codex runtime environment only. Keep API keys and tokens outside this file.
HTTP_PROXY=http://127.0.0.1:7897
HTTPS_PROXY=http://127.0.0.1:7897
ALL_PROXY=socks5://127.0.0.1:7897
NO_PROXY=localhost,127.0.0.1,::1
http_proxy=http://127.0.0.1:7897
https_proxy=http://127.0.0.1:7897
all_proxy=socks5://127.0.0.1:7897
no_proxy=localhost,127.0.0.1,::1
# END ai-share managed env
`);
  });

  test("updates Codex .env managed block while preserving private content", () => {
    const fixture = loadFixture();
    const existing = `PRIVATE_FLAG=1

# BEGIN ai-share managed env
OLD=value
# END ai-share managed env

USER_NOTE=keep
`;

    expect(buildCodexEnvFileWithManagedBlock(fixture.env, existing)).toBe(`PRIVATE_FLAG=1

# BEGIN ai-share managed env
# Non-secret Codex runtime environment only. Keep API keys and tokens outside this file.
HTTP_PROXY=http://127.0.0.1:7897
HTTPS_PROXY=http://127.0.0.1:7897
ALL_PROXY=socks5://127.0.0.1:7897
NO_PROXY=localhost,127.0.0.1,::1
http_proxy=http://127.0.0.1:7897
https_proxy=http://127.0.0.1:7897
all_proxy=socks5://127.0.0.1:7897
no_proxy=localhost,127.0.0.1,::1
# END ai-share managed env

USER_NOTE=keep
`);
  });

  test("reads Codex agent runtime and OMX policy from agents.yaml", () => {
    const fixture = loadFixture();
    const models = applyProviderGroups(fixture.models, fixture.providers.providers ?? {}, {
      gpt: "codexapis",
      deepseek: "deepseek",
    });
    const agentsConfig: AgentsYaml = {
      ...fixture.agents,
      codex: {
        agents: {
          max_threads: 3,
          max_depth: 1,
          job_max_runtime_seconds: 120,
        },
      },
      omx: {
        model_slots: {
          default: "fast",
          team: "primary",
          autopilot: "reasoning",
          ralph: "fast",
          team_low_complexity: "fast",
        },
        agent_reasoning: {
          momus: "medium",
        },
      },
    };

    const codexConfigs = buildCodexCliConfigs(
      fixture.providers.providers ?? {},
      models,
      fixture.profiles,
      agentsConfig,
      fixture.mcp,
      (profileId) => `/codex/${profileId}.AGENTS.md`,
    );
    expect(required(codexConfigs.coding).agents).toEqual({
      max_threads: 3,
      max_depth: 1,
      job_max_runtime_seconds: 120,
    });

    expect(buildOmxConfigs(models, fixture.profiles, agentsConfig).coding).toMatchObject({
      models: {
        default: "gpt-5.4-mini",
        team: "gpt-5.5",
        autopilot: "deepseek-v4-pro",
        ralph: "gpt-5.4-mini",
        team_low_complexity: "gpt-5.4-mini",
      },
      agentReasoning: {
        momus: "medium",
      },
    });
  });

  test("builds the runtime manifest with Codex/OMX ownership only", () => {
    const manifest = buildRuntimeManifest({
      paths: fakePaths(),
      defaultProfileId: "balanced",
      profileIds: ["balanced", "coding"],
      agentIds: ["sisyphus", "explorer"],
      mcpServerIds: ["filesystem"],
      codexEnvVarNames: ["HTTP_PROXY", "NO_PROXY"],
      localConfigOverlays: ["config/local/global.yaml"],
      skillIds: ["git-master", "ai-share-generator"],
      profilesConfig: {
        balanced: {
          compaction: {
            enabled: true,
            threshold: 65000,
            model: "fast",
            max_input_tokens: 120000,
          },
        },
        coding: {},
      },
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
        codex_env: "/home/user/.codex/.env",
        bin: "/home/user/.local/bin",
        codex_skills: "/home/user/.codex/skills",
      },
      managed: {
        codex_profiles: ["balanced", "coding"],
        omx_profiles: ["balanced", "coding"],
        codex_agents: ["sisyphus", "explorer"],
        codex_env_vars: ["HTTP_PROXY", "NO_PROXY"],
        local_config_overlays: ["config/local/global.yaml"],
        mcp_servers: ["filesystem"],
        skills: ["git-master", "ai-share-generator"],
        instruction_files: ["/repo/AI_GUIDELINES.md", "/repo/memory/user/profile.md"],
        profile_instruction_files: {
          balanced: ["/repo/AI_GUIDELINES.md", "/repo/memory/user/profile.md"],
          coding: ["/repo/AI_GUIDELINES.md", "/repo/memory/profiles/coding.yaml"],
        },
        profile_compaction: {
          balanced: {
            enabled: true,
            threshold: 65000,
            model: "fast",
            max_input_tokens: 120000,
          },
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
  env: EnvYaml;
} {
  return {
    global: loadYaml("global.yaml") as GlobalYaml,
    providers: loadYaml("provider.yaml") as ProviderYaml,
    models: loadYaml("models.yaml") as ModelsYaml,
    profiles: loadYaml("profiles.yaml") as ProfilesYaml,
    agents: loadYaml("agents.yaml") as AgentsYaml,
    mcp: loadYaml("mcp.yaml") as McpYaml,
    env: loadYaml("env.yaml") as EnvYaml,
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
    targetCodexEnv: "/home/user/.codex/.env",
    targetCodexInstructions: "/home/user/.codex/AGENTS.md",
    targetOmxConfig: "/home/user/.codex/.omx-config.json",
    targetRuntimeManifest: "/home/user/.codex/ai-share.runtime.json",
    targetBinDir: "/home/user/.local/bin",
    targetCodexSkillsDir: "/home/user/.codex/skills",
  };
}
