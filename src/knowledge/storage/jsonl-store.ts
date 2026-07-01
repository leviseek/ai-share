import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { BuildResult, GraphEdge, GraphNode, KnowledgeObject, ParserDiagnostic } from "../core/types.ts";
import type { KnowledgeBuildStore } from "./interfaces.ts";

export class JsonlKnowledgeStore implements KnowledgeBuildStore {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async writeSnapshot(input: BuildResult): Promise<void> {
    const tempRoot = `${this.root}.tmp-${process.pid}-${Date.now()}`;
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await writeJsonl(resolve(tempRoot, "objects.jsonl"), input.objects);
    await writeJsonl(resolve(tempRoot, "nodes.jsonl"), input.nodes);
    await writeJsonl(resolve(tempRoot, "edges.jsonl"), input.edges);
    await writeJsonl(resolve(tempRoot, "diagnostics.jsonl"), input.diagnostics);
    await writeFile(resolve(tempRoot, "manifest.json"), `${JSON.stringify(input.metadata, null, 2)}\n`);
    await writeFile(resolve(tempRoot, "stats.json"), `${JSON.stringify(buildStats(input), null, 2)}\n`);
    await rm(this.root, { recursive: true, force: true });
    await rename(tempRoot, this.root);
  }

  async readSnapshot(): Promise<{
    objects: KnowledgeObject[];
    nodes: GraphNode[];
    edges: GraphEdge[];
    diagnostics: ParserDiagnostic[];
    metadata: BuildResult["metadata"];
  }> {
    return {
      objects: await readJsonl<KnowledgeObject>(resolve(this.root, "objects.jsonl")),
      nodes: await readJsonl<GraphNode>(resolve(this.root, "nodes.jsonl")),
      edges: await readJsonl<GraphEdge>(resolve(this.root, "edges.jsonl")),
      diagnostics: await readJsonl<ParserDiagnostic>(resolve(this.root, "diagnostics.jsonl")),
      metadata: JSON.parse(await readFile(resolve(this.root, "manifest.json"), "utf-8")) as BuildResult["metadata"],
    };
  }
}

export function createJsonlKnowledgeStore(root: string): JsonlKnowledgeStore {
  return new JsonlKnowledgeStore(root);
}

export async function writeBuildResult(store: KnowledgeBuildStore, result: BuildResult): Promise<void> {
  await store.writeSnapshot(result);
}

export async function readBuildResult(store: KnowledgeBuildStore): Promise<BuildResult> {
  return await store.readSnapshot();
}

export function buildStats(
  result: Pick<BuildResult, "objects" | "nodes" | "edges" | "diagnostics"> & { metadata?: BuildResult["metadata"] },
): Record<string, unknown> {
  return {
    schemaVersion: result.metadata?.schemaVersion ?? 1,
    buildHash: result.metadata?.buildHash ?? "",
    builtAt: result.metadata?.builtAt ?? "",
    repoRoot: result.metadata?.repoRoot ?? "",
    resources: result.metadata?.resourceCount ?? 0,
    objects: result.objects.length,
    nodes: result.nodes.length,
    edges: result.edges.length,
    diagnostics: result.diagnostics.length,
    diagnosticSeverity: countBy(result.diagnostics.map((diagnostic) => diagnostic.severity)),
    objectTypes: countBy(result.objects.map((object) => object.type)),
    edgeTypes: countBy(result.edges.map((edge) => edge.type)),
  };
}

async function writeJsonl(path: string, values: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, values.map((value) => JSON.stringify(value)).join("\n") + (values.length > 0 ? "\n" : ""));
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const raw = await readFile(path, "utf-8");
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
