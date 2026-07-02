import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildKnownMcpClientTargets,
  injectRieMcpIntoKnownClients,
  mergeMcpJsonConfig,
  type McpClientTarget,
} from "./mcp-client-injection.ts";
import type { McpYaml } from "../types.ts";
import type { GeneratorPaths } from "./paths.ts";

const mcp: McpYaml = {
  servers: {
    rie: {
      transport: "stdio",
      command: "bun",
      args: ["run", "--cwd", ".", "knowledge:mcp"],
    },
  },
};

describe("MCP client injection", () => {
  test("merges rie into existing mcpServers without removing other servers", () => {
    const merged = mergeMcpJsonConfig(
      {
        mcpServers: {
          docs: { command: "node", args: ["docs.js"] },
        },
        keep: true,
      },
      "rie",
      { command: "bun", args: ["run", "knowledge:mcp"] },
    );

    expect(merged.keep).toBe(true);
    expect(merged.mcpServers.docs).toEqual({ command: "node", args: ["docs.js"] });
    expect(merged.mcpServers.rie).toEqual({ command: "bun", args: ["run", "knowledge:mcp"] });
  });

  test("injects rie into installed JSON MCP clients and resolves project cwd", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-share-mcp-client-"));
    const targetFile = join(root, ".cursor", "mcp.json");
    await mkdir(join(root, ".cursor"), { recursive: true });
    await writeFile(targetFile, `${JSON.stringify({ mcpServers: { docs: { command: "node" } } })}\n`);

    const target: McpClientTarget = { id: "cursor", name: "Cursor", file: targetFile };
    const reports = await injectRieMcpIntoKnownClients(paths(root), mcp, { dryRun: false }, [target]);
    const written = JSON.parse(await readFile(targetFile, "utf8")) as {
      mcpServers: Record<string, { command: string; args?: string[] }>;
    };

    expect(reports).toEqual([{ target, status: "injected" }]);
    expect(written.mcpServers.docs).toEqual({ command: "node" });
    expect(written.mcpServers.rie).toEqual({
      command: "bun",
      args: ["run", "--cwd", join(root, "project"), "knowledge:mcp"],
    });
  });

  test("does not create home-root Claude Code config unless it already exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-share-mcp-client-"));
    const target = buildKnownMcpClientTargets(root).find((candidate) => candidate.id === "claude-code");
    if (!target) throw new Error("Claude Code target is missing.");

    const reports = await injectRieMcpIntoKnownClients(paths(root), mcp, { dryRun: false }, [target]);

    expect(reports).toEqual([{ target, status: "missing" }]);
  });
});

function paths(homeDir: string): GeneratorPaths {
  const projectRoot = join(homeDir, "project");
  const codexHome = join(homeDir, ".codex");
  return {
    projectRoot,
    configDir: join(projectRoot, "config"),
    aiWorkspaceDir: join(homeDir, "ai-workspace"),
    workspaceAiShareDir: join(homeDir, "ai-workspace", "ai-share"),
    homeDir,
    targetCodexConfigDir: codexHome,
    targetCodexConfig: join(codexHome, "config.toml"),
    targetCodexEnv: join(codexHome, ".env"),
    targetCodexInstructions: join(codexHome, "AGENTS.md"),
    targetRuntimeManifest: join(codexHome, "ai-share.runtime.json"),
    targetCodexSkillsDir: join(codexHome, "skills"),
  };
}
