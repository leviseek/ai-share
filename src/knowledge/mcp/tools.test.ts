import { describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createMcpFixtureRepo } from "./fixtures.test.ts";
import { createRepositoryMcpTools } from "./tools.ts";

describe("repository-aware RIE MCP tools", () => {
  test("search reads repository knowledge without modifying source files", async () => {
    const repoRoot = await createMcpFixtureRepo();
    const sourcePath = join(repoRoot, "src", "main.ts");
    const before = await readFile(sourcePath, "utf8");
    const tools = createRepositoryMcpTools({ cwd: repoRoot });

    const result = await tools.search({ query: "main" });
    await writeFile(join(repoRoot, ".rie", "allowed-cache-check.txt"), "allowed\n");

    expect(result.results.length).toBeGreaterThan(0);
    expect(await readFile(sourcePath, "utf8")).toBe(before);
  });
});
