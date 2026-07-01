import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import type { EnvYaml, GlobalYaml, McpYaml, ModelsYaml, ProviderYaml } from "../../types.ts";
import {
  applyProviderGroups,
  buildCodexEnvFileWithManagedBlock,
  buildCodexCliConfig,
  buildRuntimeManifest,
  formatCodexConfigToml,
  formatCodexEnvFile,
} from "../../config-builders.ts";
import type { GeneratorPaths } from "../../cli/paths.ts";
import { parseYamlObject } from "../../yaml.ts";

const projectRoot = resolve(import.meta.dir, "..", "..", "..");

describe("Codex generation contract", () => {
  test("formats the Codex config TOML in the expected shape", () => {
    const fixture = loadFixture();
    const models = applyProviderGroups(fixture.models, fixture.providers.providers ?? {}, {
      gpt: "codexapis",
    });

    const codexConfig = buildCodexCliConfig(
      fixture.providers.providers ?? {},
      models,
      fixture.global,
      fixture.mcp,
      "/codex/AGENTS.md",
    );

    expect(formatCodexConfigToml(codexConfig)).toBe(`model = "gpt-5.5"
model_provider = "codexapis"
model_reasoning_effort = "medium"
model_instructions_file = "/codex/AGENTS.md"

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
`);
  });

  test("resolves provider-group overrides without changing model semantics", () => {
    const fixture = loadFixture();
    const models = applyProviderGroups(fixture.models, fixture.providers.providers ?? {}, {
      gpt: "packyapi",
    });

    const codexConfig = buildCodexCliConfig(
      fixture.providers.providers ?? {},
      models,
      fixture.global,
      fixture.mcp,
      "/codex/AGENTS.md",
    );

    expect(codexConfig.model).toBe("gpt-5.5");
    expect(codexConfig.model_provider).toBe("packyapi");
    expect(codexConfig.model_providers.packyapi?.env_key).toBe("PACKYAPI_API_KEY");
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

  test("builds the runtime manifest with Codex ownership only", () => {
    const manifest = buildRuntimeManifest({
      paths: fakePaths(),
      model: "gpt-5.5",
      mcpServerIds: ["filesystem"],
      codexEnvVarNames: ["HTTP_PROXY", "NO_PROXY"],
      localConfigOverlays: ["config/local/global.yaml"],
      skillIds: ["git-master", "ai-share-generator"],
      instructionFiles: ["/repo/AI_GUIDELINES.md", "/repo/memory/user/profile.md"],
    });

    expect(manifest).toEqual({
      version: 4,
      scope: "user",
      primary_stack: "codex",
      model: "gpt-5.5",
      platforms: ["windows", "linux", "macos"],
      memory: {
        v1: "load-existing-memory",
        v2: "proposal-distillation-review",
      },
      paths: {
        codex_home: "/home/user/.codex",
        codex_env: "/home/user/.codex/.env",
        codex_skills: "/home/user/.codex/skills",
      },
      managed: {
        codex_config: "/home/user/.codex/config.toml",
        codex_env_vars: ["HTTP_PROXY", "NO_PROXY"],
        local_config_overlays: ["config/local/global.yaml"],
        mcp_servers: ["filesystem"],
        skills: ["git-master", "ai-share-generator"],
        instruction_files: ["/repo/AI_GUIDELINES.md", "/repo/memory/user/profile.md"],
      },
    });
  });
});

function loadFixture(): {
  global: GlobalYaml;
  providers: ProviderYaml;
  models: ModelsYaml;
  mcp: McpYaml;
  env: EnvYaml;
} {
  return {
    global: loadYaml("global.yaml") as GlobalYaml,
    providers: loadYaml("provider.yaml") as ProviderYaml,
    models: loadYaml("models.yaml") as ModelsYaml,
    mcp: loadYaml("mcp.yaml") as McpYaml,
    env: loadYaml("env.yaml") as EnvYaml,
  };
}

function loadYaml(fileName: string): unknown {
  return parseYamlObject(readFileSync(resolve(projectRoot, "config", fileName), "utf8"));
}

function fakePaths(): GeneratorPaths {
  return {
    projectRoot: "/repo",
    configDir: "/repo/config",
    aiWorkspaceDir: "/home/user/ai-workspace",
    workspaceAiShareDir: "/home/user/ai-workspace/ai-share",
    homeDir: "/home/user",
    targetCodexConfigDir: "/home/user/.codex",
    targetCodexConfig: "/home/user/.codex/config.toml",
    targetCodexEnv: "/home/user/.codex/.env",
    targetCodexInstructions: "/home/user/.codex/AGENTS.md",
    targetRuntimeManifest: "/home/user/.codex/ai-share.runtime.json",
    targetCodexSkillsDir: "/home/user/.codex/skills",
  };
}
