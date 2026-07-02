import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { buildContext } from "../context/builder.ts";
import { exportGraph } from "../graph/export.ts";
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
  await writeFile(join(root, "config.yaml"), "provider: demo\napi_key: should-redact\n");
  await writeFile(join(root, "notes.unknown"), "plain notes\n");
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

  test("persists display summaries and provenance for supported node types", async () => {
    const root = await fixtureRepo();
    const result = await buildKnowledge({ repoRoot: root });
    const expectedTypes = ["Directory", "CodeFile", "CodeSymbol", "Config", "Script", "Package", "Project", "File"];

    for (const type of expectedTypes)
      expect(result.objects.some((object) => object.type === type && object.summaryProvenance !== undefined)).toBe(
        true,
      );
    for (const object of result.objects) {
      expect(object.summary).toBeDefined();
      expect(object.summary?.length).toBeGreaterThan(0);
      expect(object.summaryProvenance).toBeDefined();
      expect(object.summary).not.toContain("should-redact");
    }
    for (const node of result.nodes) {
      expect(node.summary).toBeDefined();
      expect(node.summaryProvenance).toBeDefined();
    }
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

  test("round-trips summary provenance through production snapshot files", async () => {
    const root = await fixtureRepo();
    const result = await buildKnowledge({ repoRoot: root });
    const storeRoot = join(root, ".custom-rie");
    const store = createJsonlKnowledgeStore(storeRoot);

    await writeBuildResult(store, result);
    const reloaded = await readBuildResult(store);
    const object = reloaded.objects.find((item) => item.id === "codefile:src/main.ts");
    const node = reloaded.nodes.find((item) => item.id === "codefile:src/main.ts");

    expect(object?.summaryProvenance?.source).toBe("inferred");
    expect(object?.summaryProvenance?.signals).toContain("path");
    expect(node?.summaryProvenance).toEqual(object?.summaryProvenance);
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

  test("reuses persisted summaries across graph, context, impact, export, and MCP surfaces", async () => {
    const root = await fixtureRepo();
    const result = await buildKnowledge({ repoRoot: root });
    const objectId = "codefile:src/main.ts";
    const sourceNode = result.nodes.find((node) => node.id === objectId);
    const tools = createKnowledgeMcpTools(result);
    const context = buildContext(result, { query: "main", objectIds: [objectId], intent: "explain" });
    const exported = JSON.parse(exportGraph({ nodes: result.nodes, edges: result.edges }, "json")) as typeof result;

    expect(sourceNode?.summary).toBeDefined();
    expect(context.graph.nodes.find((node) => node.id === objectId)?.summary).toBe(sourceNode?.summary);
    expect(tools.graph([objectId], 1).nodes.find((node) => node.id === objectId)?.summaryProvenance).toEqual(
      sourceNode?.summaryProvenance,
    );
    expect(tools.impact(objectId).nodes.find((node) => node.id === objectId)?.summary).toBe(sourceNode?.summary);
    expect(exported.nodes.find((node) => node.id === objectId)?.summaryProvenance).toEqual(
      sourceNode?.summaryProvenance,
    );
  });
});
