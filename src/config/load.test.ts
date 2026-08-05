import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { loadValidatedConfigWithTrace } from "./load.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("validated config loading", () => {
  test("loads tools and tracks base and overlay provenance", async () => {
    const configDir = await createConfigDirectory();
    await writeFile(
      resolve(configDir, "tools.yaml"),
      "tools:\n  - id: opencode\n    label: OpenCode\n    package: opencode-ai\n    executable: opencode\n    required: true\n    version: latest\n    platforms:\n      win32:\n        manager: bun\n",
    );
    await writeFile(
      resolve(configDir, "local", "tools.yaml"),
      "tools:\n  - id: typescript\n    label: TypeScript\n    package: typescript\n    executable: tsc\n    required: false\n    version: latest\n    platforms:\n      linux:\n        manager: bun\n",
    );

    const loaded = await loadValidatedConfigWithTrace(configDir);

    expect(loaded.config.tools.tools[0]?.id).toBe("typescript");
    expect(loaded.provenance.tools.tools).toBe("config/local/tools.yaml");
    expect(loaded.baseFiles).toContain("config/tools.yaml");
    expect(loaded.overlays).toContain("config/local/tools.yaml");
  });
});

async function createConfigDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "ai-share-tools-"));
  temporaryDirectories.push(directory);
  await mkdir(resolve(directory, "local"));
  await Promise.all([
    writeFile(resolve(directory, "global.yaml"), "model: gpt-a\nprovider: codexapis\n"),
    writeFile(
      resolve(directory, "provider.yaml"),
      "providers:\n  codexapis:\n    base_url: https://example.com/v1\n    api_key: ${CODEXAPIS_API_KEY}\n    models: [gpt-a]\n    default_model: gpt-a\n",
    ),
    writeFile(resolve(directory, "models.yaml"), "gpt-a:\n  model_name: gpt-a\n"),
    writeFile(resolve(directory, "mcp.yaml"), "servers: {}\n"),
    writeFile(resolve(directory, "env.yaml"), "variables: {}\n"),
    writeFile(resolve(directory, "agents.yaml"), "agents: {}\n"),
    writeFile(resolve(directory, "plugins.yaml"), "plugins: []\n"),
  ]);
  return directory;
}
