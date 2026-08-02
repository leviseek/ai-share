import { describe, expect, test } from "bun:test";
import { validateConfigSet, validateYamlConsistency } from "./validation.ts";

describe("strict config validation", () => {
  test("accepts the minimal normalized config", () => {
    const fixture = validConfig();
    const result = validateConfigSet(fixture);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.global).toEqual({ model: "model-a", provider: "provider-a" });
      expect(result.config.agents).toEqual({ agents: {} });
      expect(result.config.plugins).toEqual({ plugins: [] });
    }
  });

  test("rejects empty plugin names and unknown fields", () => {
    const fixture = validConfig();
    fixture.plugins = { plugins: ["valid-plugin", ""], unknown: true };

    const result = validateConfigSet(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("invalid plugin fixture unexpectedly passed validation");
    const paths = result.errors.map((finding) => finding.path);
    expect(paths).toContain("plugins[1]");
    expect(paths).toContain("unknown");
    expect(result.errors.every((finding) => finding.file === "plugins.yaml")).toBe(true);
  });

  test("accepts npm package specs and named git+https plugin specs", () => {
    const fixture = validConfig();
    fixture.plugins = {
      plugins: [
        "opencode-example",
        "opencode-example@latest",
        "opencode-example@^1.2.3",
        "opencode-example@~1.2.3",
        "@scope/opencode-example@1.2.3-beta.1",
        "superpowers@git+https://github.com/obra/superpowers.git",
      ],
    };

    expect(validateConfigSet(fixture).ok).toBe(true);
  });

  test("rejects npm sources outside the supported safe subset", () => {
    for (const plugin of [
      "pkg@ ",
      "pkg@|",
      "pkg@+",
      "pkg@latest ",
      "pkg@1.2.3 || ",
      "pkg@>=1.2.3",
      "pkg@^1.2",
      "pkg@1.2.3 trailing",
    ]) {
      const fixture = validConfig();
      fixture.plugins = { plugins: [plugin] };
      expect(validateConfigSet(fixture).ok).toBe(false);
    }
  });

  test("rejects unsafe plugin URLs, paths and secret literals", () => {
    const rejectedSpecs = [
      "superpowers@git+https://user:password@github.com/obra/superpowers.git",
      "superpowers@git+https://github.com/obra/superpowers.git?ref=main",
      "superpowers@git+https://github.com/obra/superpowers.git#main",
      "file:///opt/opencode/plugin.js",
      "https://user:password@example.test/plugin.js",
      "/opt/opencode/plugin.js",
      "C:\\Users\\example\\plugin.js",
      "\\\\server\\share\\plugin.js",
      "./plugin.js",
      "../plugin.js",
      "~/plugin.js",
      "sk-1234567890abcdef",
      "opencode-example@sk-1234567890abcdef",
      "@scope/sk-1234567890abcdef",
      "opencode-sk-1234567890abcdef-plugin",
      "pkg@git+https://github.com/org/sk-1234567890abcdef/repo.git",
    ];

    for (const plugin of rejectedSpecs) {
      const fixture = validConfig();
      fixture.plugins = { plugins: [plugin] };
      const result = validateConfigSet(fixture);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`unsafe plugin fixture unexpectedly passed validation: ${plugin}`);
      expect(result.errors.map((finding) => finding.path)).toContain("plugins[0]");
    }
  });

  test("validates custom agent shape and model references", () => {
    const fixture = validConfig();
    fixture.agents = {
      agents: {
        "Bad Agent": {
          description: "Commit changes",
          model: "missing-model",
          reasoning_effort: "ultra",
          mode: "invalid",
          prompt: "Create a commit.",
          unknown: true,
        },
      },
    };

    const result = validateConfigSet(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("invalid agent fixture unexpectedly passed validation");
    const findings = result.errors;
    const paths = findings.map((finding) => finding.path);
    expect(paths).toContain("agents.Bad Agent");
    expect(paths).toContain("agents.Bad Agent.reasoning_effort");
    expect(paths).toContain("agents.Bad Agent.mode");
    expect(paths).toContain("agents.Bad Agent.unknown");
    expect(findings.map((finding) => finding.message)).toContain("agent 'Bad Agent' 引用未定义模型 'missing-model'");
  });

  test("reports cross-file model and provider references", () => {
    const fixture = validConfig();
    fixture.global = { model: "missing-model", provider: "missing-provider" };
    const messages = errors(fixture);
    expect(messages).toContain("global.model 引用未定义模型 'missing-model'");
    expect(messages).toContain("global.provider 引用未定义提供商 'missing-provider'");
  });

  test("rejects unknown and removed model/provider fields", () => {
    const fixture = validConfig();
    fixture.models = {
      "model-a": { model_name: "upstream", provider_group: "gpt", cost: { input: 1, output: 2 } },
    };
    fixture.providers = {
      providers: {
        "provider-a": {
          base_url: "https://example.test/v1",
          api_key: "${EXAMPLE_API_KEY}",
          timeout: 600000,
        },
      },
    };
    const paths = validateYamlConsistency(
      fixture.models,
      fixture.providers,
      fixture.global,
      fixture.mcp,
      fixture.env,
    ).map((error) => error.path);
    expect(paths).toContain("models.model-a.provider_group");
    expect(paths).toContain("models.model-a.cost");
    expect(paths).toContain("providers.provider-a.timeout");
  });

  test("rejects generator-managed env prefixes and secret literals", () => {
    const fixture = validConfig();
    fixture.env = {
      variables: {
        AI_SHARE_PROVIDER: "provider-a",
        OPENCODE_FOO: "value",
        HOME: "/tmp/home",
        JAVA_HOME: "/tmp/java",
        TOKEN_VALUE: "plain",
        LITERAL: "sk-1234567890abcdef",
      },
    };
    const messages = errors(fixture);
    expect(messages.filter((message) => message.includes("不应写入 OpenCode .env"))).toHaveLength(4);
    expect(messages.some((message) => message.includes("敏感变量"))).toBe(true);
    expect(messages.some((message) => message.includes("明文 secret"))).toBe(true);
  });

  test("rejects removed Codex-only global settings", () => {
    const fixture = validConfig();
    fixture.global = {
      model: "model-a",
      provider: "provider-a",
      codex_allow_login_shell: false,
      codex_shell_environment_policy: { inherit: "all" },
    };
    const findings = validateYamlConsistency(
      fixture.models,
      fixture.providers,
      fixture.global,
      fixture.mcp,
      fixture.env,
    );
    expect(findings.map((finding) => finding.path)).toContain("codex_allow_login_shell");
    expect(findings.map((finding) => finding.path)).toContain("codex_shell_environment_policy");
  });

  test("enforces MCP transport-specific fields", () => {
    const fixture = validConfig();
    fixture.mcp = {
      servers: {
        http: { transport: "http", url: "https://example.test/mcp", command: "node", env: { VALUE: "x" } },
        stdio: { transport: "stdio", command: "node", bearer_token_env_var: "TOKEN" },
      },
    };
    const messages = errors(fixture);
    expect(messages).toContain("HTTP MCP server 'http' 不应配置 command 字段");
    expect(messages).toContain("HTTP MCP server 'http' 不应配置 env 字段");
    expect(messages).toContain("stdio MCP server 'stdio' 不应配置 bearer_token_env_var 字段");
  });

  test("validates ids, semver, HTTPS providers, enum values and MCP env keys", () => {
    const fixture = validConfig();
    fixture.global = { model: "Bad Model", provider: "provider-a", opencode_min_version: "1.2" };
    fixture.models = { "Bad Model": { model_name: "upstream", reasoning_effort: "ultra" } };
    fixture.providers = {
      providers: {
        "provider-a": { base_url: "http://example.test/v1", api_key: "${EXAMPLE_API_KEY}" },
      },
    };
    fixture.mcp = {
      servers: {
        "Bad Server": { transport: "stdio", command: "node", env: { "bad-key": "value" } },
      },
    };
    const findings = validateYamlConsistency(
      fixture.models,
      fixture.providers,
      fixture.global,
      fixture.mcp,
      fixture.env,
    );
    const paths = findings.map((finding) => finding.path);
    expect(paths).toContain("model");
    expect(paths).toContain("opencode_min_version");
    expect(paths).toContain("models.Bad Model");
    expect(paths).toContain("models.Bad Model.reasoning_effort");
    expect(paths).toContain("providers.provider-a.base_url");
    expect(paths).toContain("servers.Bad Server");
    expect(paths).toContain("servers.Bad Server.env.bad-key");
    expect(findings.some((finding) => finding.message.includes("有效 HTTPS URL"))).toBe(true);
  });

  test("treats explicit stdio transport with an URL as a transport conflict", () => {
    const fixture = validConfig();
    fixture.mcp = {
      servers: {
        mixed: { transport: "stdio", command: "node", url: "https://example.test/mcp" },
      },
    };
    expect(errors(fixture)).toContain("stdio MCP server 'mixed' 不应配置 url 字段");
  });

  test("rejects Provider URL credentials and sensitive query parameters", () => {
    const fixture = validConfig();
    fixture.providers = {
      providers: {
        "provider-a": {
          base_url: "https://user:password@example.test/v1?api_key=placeholder",
          api_key: "${EXAMPLE_API_KEY}",
        },
      },
    };
    const messages = errors(fixture);
    expect(messages).toContain("provider 'provider-a' 的 base_url 必须是有效 HTTPS URL");

    const queryFixture = validConfig();
    queryFixture.providers = {
      providers: {
        "provider-a": {
          base_url: "https://example.test/v1?api_key=placeholder",
          api_key: "${EXAMPLE_API_KEY}",
        },
      },
    };
    expect(errors(queryFixture)).toContain("provider 'provider-a' 的 base_url 不得包含敏感查询参数 'api_key'");
  });
});

function validConfig(): Record<"global" | "providers" | "models" | "mcp" | "env" | "agents" | "plugins", unknown> {
  return {
    global: { model: "model-a", provider: "provider-a" },
    providers: {
      providers: {
        "provider-a": { base_url: "https://example.test/v1", api_key: "${EXAMPLE_API_KEY}" },
      },
    },
    models: { "model-a": { model_name: "upstream", reasoning_effort: "medium" } },
    mcp: { servers: {} },
    env: { variables: {} },
    agents: { agents: {} },
    plugins: { plugins: [] },
  };
}

function errors(
  fixture: Record<"global" | "providers" | "models" | "mcp" | "env" | "agents" | "plugins", unknown>,
): string[] {
  return validateYamlConsistency(
    fixture.models,
    fixture.providers,
    fixture.global,
    fixture.mcp,
    fixture.env,
    fixture.agents,
    fixture.plugins,
  ).map((error) => error.message);
}
