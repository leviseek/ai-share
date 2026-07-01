import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { buildContext } from "../context/builder.ts";
import { createKnowledgeMcpTools } from "../mcp/tools.ts";
import { buildKnowledge } from "../index.ts";
import { createJsonlKnowledgeStore, readBuildResult, writeBuildResult } from "../storage/jsonl-store.ts";

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
    expect(result.objects.some((object) => object.type === "Project")).toBe(true);
    expect(result.edges.some((edge) => edge.type === "imports" && edge.to === "codefile:src/util.ts")).toBe(true);
    expect(result.metadata.schemaVersion).toBe(1);
  });

  test("keeps building when files are invalid, unknown, ignored, binary, or oversized", async () => {
    const root = await fixtureRepo();
    await mkdir(join(root, "ignored-dir"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "ignored-dir/\n");
    await writeFile(join(root, "broken.json"), "{ nope");
    await writeFile(join(root, "notes.txt"), "plain text notes for unknown language\n");
    await writeFile(join(root, "binary.bin"), new Uint8Array([0, 1, 2, 3]));
    await writeFile(join(root, "large.txt"), "x".repeat(120));
    await writeFile(join(root, "ignored-dir", "secret.ts"), "export const secret = 1;\n");

    const result = await buildKnowledge({ repoRoot: root, maxFileBytes: 100 });

    expect(result.objects.some((object) => object.id === "file:notes.txt")).toBe(true);
    expect(result.objects.some((object) => object.path === "ignored-dir/secret.ts")).toBe(false);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.parser === "yaml-json" && diagnostic.path === "broken.json"),
    ).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.path === "binary.bin")).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.path === "large.txt")).toBe(true);
  });

  test("writes production snapshot files and reads them back", async () => {
    const root = await fixtureRepo();
    const result = await buildKnowledge({ repoRoot: root });
    const storeRoot = join(root, ".custom-rie");
    const store = createJsonlKnowledgeStore(storeRoot);

    await writeBuildResult(store, result);
    const reloaded = await readBuildResult(store);
    const manifest = JSON.parse(await readFile(join(storeRoot, "manifest.json"), "utf-8")) as { buildHash: string };
    const diagnostics = await readFile(join(storeRoot, "diagnostics.jsonl"), "utf-8");

    expect(reloaded.objects.length).toBe(result.objects.length);
    expect(reloaded.metadata.buildHash).toBe(result.metadata.buildHash);
    expect(manifest.buildHash).toBe(result.metadata.buildHash);
    expect(diagnostics).toBe("");
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
