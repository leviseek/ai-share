import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { buildContext } from "../context/builder.ts";
import { createKnowledgeMcpTools } from "../mcp/tools.ts";
import { buildKnowledge } from "../index.ts";

async function fixtureRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rie-fixture-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "README.md"),
    "# Demo\n\nA provider workflow example for Codex.\n\n## Workflow\n\nUse config first.\n",
  );
  await writeFile(join(root, "AGENTS.md"), "# Rules\n\n## Must\n\nNever write secrets.\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "demo", scripts: { check: "tsc --noEmit" }, devDependencies: { typescript: "latest" } }),
  );
  await writeFile(
    join(root, "src", "main.ts"),
    "import { helper } from './util';\nexport function main() { return helper(); }\n",
  );
  await writeFile(join(root, "src", "util.ts"), "export function helper() { return 1; }\n");
  return root;
}

describe("RIE build", () => {
  test("builds knowledge objects and graph edges", async () => {
    const root = await fixtureRepo();
    const result = await buildKnowledge({ repoRoot: root });
    expect(result.objects.some((object) => object.type === "Agent")).toBe(true);
    expect(result.objects.some((object) => object.type === "Script" && object.title === "check")).toBe(true);
    expect(result.edges.some((edge) => edge.type === "imports")).toBe(true);
  });

  test("builds graph-first context", async () => {
    const root = await fixtureRepo();
    const result = await buildKnowledge({ repoRoot: root });
    const context = buildContext(result, { query: "provider workflow", intent: "plan" });
    expect(context.objects.length).toBeGreaterThan(0);
    expect(context.sections.length).toBeGreaterThan(0);
    expect(context.quality?.score).toBeGreaterThan(0);
  });

  test("exposes context quality through MCP tools", async () => {
    const root = await fixtureRepo();
    const result = await buildKnowledge({ repoRoot: root });
    const tools = createKnowledgeMcpTools(result);
    const request = { query: "provider workflow", intent: "plan" } as const;
    const context = tools.context(request);
    const quality = tools.contextQuality(request);
    expect(context.quality).toBeDefined();
    expect(quality.score).toBe(context.quality?.score ?? -1);
    expect(quality.recommendations.length).toBeGreaterThan(0);
  });
});
