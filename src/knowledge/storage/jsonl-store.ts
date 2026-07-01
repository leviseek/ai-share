import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { BuildResult, GraphEdge, GraphNode, KnowledgeObject } from "../core/types.ts";
import type { KnowledgeBuildStore } from "./interfaces.ts";

export class JsonlKnowledgeStore implements KnowledgeBuildStore {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async writeSnapshot(input: { objects: KnowledgeObject[]; nodes: GraphNode[]; edges: GraphEdge[] }): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
    await mkdir(this.root, { recursive: true });
    await writeJsonl(resolve(this.root, "objects.jsonl"), input.objects);
    await writeJsonl(resolve(this.root, "nodes.jsonl"), input.nodes);
    await writeJsonl(resolve(this.root, "edges.jsonl"), input.edges);
    await writeFile(
      resolve(this.root, "stats.json"),
      `${JSON.stringify(buildStats({ ...input, diagnostics: [] }), null, 2)}\n`,
    );
  }

  async readSnapshot(): Promise<{ objects: KnowledgeObject[]; nodes: GraphNode[]; edges: GraphEdge[] }> {
    return {
      objects: await readJsonl<KnowledgeObject>(resolve(this.root, "objects.jsonl")),
      nodes: await readJsonl<GraphNode>(resolve(this.root, "nodes.jsonl")),
      edges: await readJsonl<GraphEdge>(resolve(this.root, "edges.jsonl")),
    };
  }
}

export function createJsonlKnowledgeStore(root: string): JsonlKnowledgeStore {
  return new JsonlKnowledgeStore(root);
}

export async function writeBuildResult(store: KnowledgeBuildStore, result: BuildResult): Promise<void> {
  await store.writeSnapshot(result);
}

export async function readBuildResult(
  store: KnowledgeBuildStore,
): Promise<Pick<BuildResult, "objects" | "nodes" | "edges">> {
  return await store.readSnapshot();
}

export function buildStats(
  result: Pick<BuildResult, "objects" | "nodes" | "edges" | "diagnostics">,
): Record<string, unknown> {
  return {
    objects: result.objects.length,
    nodes: result.nodes.length,
    edges: result.edges.length,
    diagnostics: result.diagnostics.length,
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
