import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ConfigValidationError } from "./config/load.ts";
import { runGeneration } from "./generate-user-config.ts";

describe("generation security boundary", () => {
  test("force never bypasses secret validation or creates partial output", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-security-"));
    const home = join(root, "home");
    const codexHome = join(root, "codex-home");
    try {
      writeConfigFixture(root, "variables:\n  API_TOKEN: placeholder-only\n");
      const result = await runGeneration({
        argv: ["bun", "script", "--force"],
        env: { HOME: home, CODEX_HOME: codexHome },
        projectRoot: root,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(ConfigValidationError);
      expect(existsSync(codexHome)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("compiles the CLI task instead of AI_SHARE_TASK into this generation", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-task-"));
    const home = join(root, "home");
    const codexHome = join(root, "codex-home");
    try {
      writeConfigFixture(root, "variables: {}\n");
      writeMemoryFixture(root);
      const result = await runGeneration({
        argv: ["bun", "script", "--task", "cli-parser-command"],
        env: { HOME: home, CODEX_HOME: codexHome, AI_SHARE_TASK: "proxy-runtime-variable" },
        projectRoot: root,
      });

      expect(result.ok).toBe(true);
      const instructions = readFileSync(join(codexHome, "AGENTS.md"), "utf8");
      expect(instructions).toContain(join(root, "memory", "architecture", "cli.md"));
      expect(instructions).not.toContain(join(root, "memory", "architecture", "env.md"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("prompts for a provider when --provider is omitted", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-provider-prompt-"));
    try {
      writeConfigFixture(root, "variables: {}\n");
      let receivedIds: string[] = [];
      let initialProvider = "";
      const result = await runGeneration({
        argv: ["bun", "script", "--dry-run"],
        env: {
          HOME: join(root, "home"),
          CODEX_HOME: join(root, "codex-home"),
          AI_SHARE_PROVIDER: "missing-provider",
        },
        projectRoot: root,
        providerSelector: (choices, initialId) => {
          receivedIds = choices.map((choice) => choice.id);
          initialProvider = initialId;
          return Promise.resolve("provider-b");
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.providerId).toBe("provider-b");
      expect(receivedIds).toEqual(["provider-a", "provider-b"]);
      expect(initialProvider).toBe("provider-a");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("uses an explicit --provider without opening the selector", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-provider-explicit-"));
    try {
      writeConfigFixture(root, "variables: {}\n");
      let selectorCalls = 0;
      const result = await runGeneration({
        argv: ["bun", "script", "--dry-run", "--provider", "provider-b"],
        env: { HOME: join(root, "home"), CODEX_HOME: join(root, "codex-home") },
        projectRoot: root,
        providerSelector: () => {
          selectorCalls += 1;
          return Promise.resolve("provider-a");
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.providerId).toBe("provider-b");
      expect(selectorCalls).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeConfigFixture(root: string, envYaml: string): void {
  const configDir = join(root, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "global.yaml"), "model: model-a\nprovider: provider-a\n", "utf8");
  writeFileSync(
    join(configDir, "provider.yaml"),
    [
      "providers:",
      "  provider-a:",
      "    base_url: https://example.test/v1",
      "    api_key: ${EXAMPLE_API_KEY}",
      "  provider-b:",
      "    name: Provider B",
      "    base_url: https://example.test/v1",
      "    api_key: ${EXAMPLE_B_API_KEY}",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(configDir, "models.yaml"), "model-a:\n  model_name: upstream-model\n", "utf8");
  writeFileSync(join(configDir, "mcp.yaml"), "servers: {}\n", "utf8");
  writeFileSync(join(configDir, "env.yaml"), envYaml, "utf8");
  writeFileSync(join(configDir, "agents.yaml"), "agents: {}\n", "utf8");
}

function writeMemoryFixture(root: string): void {
  const files: Record<string, string> = {
    "AI_GUIDELINES.md": "# Guidelines\n",
    "memory/policies/ai-execution-contract.md": "# Contract\n",
    "memory/policies/memory-lifecycle.md": "# Lifecycle\n",
    "memory/stable/user.yaml": "identity: fixture\n",
    "memory/stable/workflows.yaml": "workflow: fixture\n",
    "memory/stable/devices.yaml": "devices: []\n",
    "memory/architecture/cli.md": "# CLI\ncli-parser-command\n",
    "memory/architecture/env.md": "# Env\nproxy-runtime-variable\n",
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
}
