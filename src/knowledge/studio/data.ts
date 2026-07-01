import { resolve } from "node:path";
import { buildContext, type BuiltContext, type ContextRequest } from "../context/builder.ts";
import type { BuildResult, GraphEdge, GraphNode, GraphSubgraph, KnowledgeObject } from "../core/types.ts";
import { buildKnowledge } from "../index.ts";
import { impactAnalysis } from "../graph/impact.ts";
import { subgraph } from "../graph/builder.ts";
import { rankByTextSimilarity } from "../embedding/ranking.ts";
import { buildStats, createJsonlKnowledgeStore, readBuildResult, writeBuildResult } from "../storage/jsonl-store.ts";

export type RepositoryTreeNode = {
  name: string;
  path: string;
  kind: "directory" | "file";
  objectIds: string[];
  children: RepositoryTreeNode[];
};

export type DashboardMetrics = {
  objects: number;
  nodes: number;
  edges: number;
  objectTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
  orphanNodes: number;
  brokenEdges: number;
  generatedArtifacts: number;
  contextCoverage: number;
};

export type CodexTraceStep = {
  name: "infer_intent" | "search" | "context" | "impact" | "answer_outline";
  input: unknown;
  output: unknown;
  durationMs: number;
};

export type CodexMockTrace = {
  prompt: string;
  intent: NonNullable<ContextRequest["intent"]>;
  steps: CodexTraceStep[];
  answerOutline: string[];
};

export type StudioSnapshot = Pick<BuildResult, "objects" | "nodes" | "edges">;

const DEFAULT_STORE_DIR = ".rie";

export async function loadStudioSnapshot(
  repoRoot: string,
  storeDir: string = DEFAULT_STORE_DIR,
): Promise<StudioSnapshot> {
  const store = createJsonlKnowledgeStore(resolve(repoRoot, storeDir));
  try {
    return await readBuildResult(store);
  } catch {
    const result = await buildKnowledge({ repoRoot });
    await writeBuildResult(store, result);
    return result;
  }
}

export function buildRepositoryTree(objects: KnowledgeObject[]): RepositoryTreeNode {
  const root: RepositoryTreeNode = {
    name: ".",
    path: "",
    kind: "directory",
    objectIds: [],
    children: [],
  };
  const nodesByPath = new Map<string, RepositoryTreeNode>([["", root]]);
  for (const object of objects) {
    if (object.path === undefined) continue;
    const parts = object.path.split("/").filter((part) => part.length > 0);
    let current = root;
    let currentPath = "";
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (part === undefined) continue;
      currentPath = currentPath.length === 0 ? part : `${currentPath}/${part}`;
      const isLeaf = index === parts.length - 1;
      const kind = isLeaf && object.type !== "Directory" ? "file" : "directory";
      let child = nodesByPath.get(currentPath);
      if (child === undefined) {
        child = { name: part, path: currentPath, kind, objectIds: [], children: [] };
        nodesByPath.set(currentPath, child);
        current.children.push(child);
      }
      if (isLeaf) child.objectIds.push(object.id);
      current = child;
    }
  }
  sortTree(root);
  return root;
}

export function buildDashboardMetrics(snapshot: StudioSnapshot, lastContext?: BuiltContext): DashboardMetrics {
  const stats = buildStats({ ...snapshot, diagnostics: [] });
  const edgeEndpoints = new Set(snapshot.edges.flatMap((edge) => [edge.from, edge.to]));
  const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
  const brokenEdges = snapshot.edges.filter((edge) => !nodeIds.has(edge.to) && !isExternalReference(edge.to)).length;
  const generatedArtifacts = snapshot.objects.filter((object) => object.type === "GeneratedArtifact").length;
  return {
    objects: snapshot.objects.length,
    nodes: snapshot.nodes.length,
    edges: snapshot.edges.length,
    objectTypes: asCountRecord(stats.objectTypes),
    edgeTypes: asCountRecord(stats.edgeTypes),
    orphanNodes: snapshot.nodes.filter((node) => !edgeEndpoints.has(node.id)).length,
    brokenEdges,
    generatedArtifacts,
    contextCoverage:
      lastContext === undefined || snapshot.objects.length === 0
        ? 0
        : Number((lastContext.objects.length / snapshot.objects.length).toFixed(4)),
  };
}

export function buildGraphView(snapshot: StudioSnapshot, seedIds: string[], depth: number): GraphSubgraph {
  if (seedIds.length === 0) return { nodes: snapshot.nodes, edges: snapshot.edges };
  return subgraph({ nodes: snapshot.nodes, edges: snapshot.edges }, seedIds, depth);
}

export function buildStudioContext(snapshot: StudioSnapshot, request: ContextRequest): BuiltContext {
  return buildContext(snapshot, request);
}

export function buildImpactView(snapshot: StudioSnapshot, objectId: string): GraphSubgraph {
  return impactAnalysis({ nodes: snapshot.nodes, edges: snapshot.edges }, objectId);
}

export function buildCodexMockTrace(snapshot: StudioSnapshot, prompt: string): CodexMockTrace {
  const startedAt = Date.now();
  const intent = inferIntent(prompt);
  const search = rankByTextSimilarity(snapshot.objects, prompt).slice(0, 5);
  const context = buildContext(snapshot, {
    query: prompt,
    intent,
    objectIds: search.slice(0, 3).map((item) => item.object.id),
    budget: { maxObjects: 20 },
  });
  const impactSeed = context.objects[0]?.id ?? search[0]?.object.id;
  const impact = impactSeed === undefined ? { nodes: [], edges: [] } : impactAnalysis(snapshot, impactSeed);
  const answerOutline = buildAnswerOutline(intent, context, impact);
  return {
    prompt,
    intent,
    steps: [
      {
        name: "infer_intent",
        input: { prompt },
        output: { intent },
        durationMs: 1,
      },
      {
        name: "search",
        input: { query: prompt, limit: 5 },
        output: search.map((item) => ({
          id: item.object.id,
          score: item.score,
          path: item.object.path,
          title: item.object.title,
        })),
        durationMs: Math.max(1, Date.now() - startedAt),
      },
      {
        name: "context",
        input: { intent, maxObjects: 20 },
        output: summarizeContext(context),
        durationMs: 1,
      },
      {
        name: "impact",
        input: { objectId: impactSeed },
        output: summarizeGraph(impact),
        durationMs: 1,
      },
      {
        name: "answer_outline",
        input: { contextObjects: context.objects.length, impactNodes: impact.nodes.length },
        output: answerOutline,
        durationMs: 1,
      },
    ],
    answerOutline,
  };
}

function sortTree(node: RepositoryTreeNode): void {
  node.children.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  for (const child of node.children) sortTree(child);
}

function asCountRecord(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  const counts: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number") counts[key] = item;
  }
  return counts;
}

function isExternalReference(id: string): boolean {
  return id.startsWith("module:") || id.startsWith("package:");
}

function inferIntent(query: string): NonNullable<ContextRequest["intent"]> {
  const lower = query.toLowerCase();
  if (/(debug|错误|失败|修复|bug)/.test(lower)) return "debug";
  if (/(review|审查|检查)/.test(lower)) return "review";
  if (/(test|测试)/.test(lower)) return "test";
  if (/(explain|解释|说明)/.test(lower)) return "explain";
  if (/(plan|设计|架构|规划)/.test(lower)) return "plan";
  return "implement";
}

function summarizeContext(context: BuiltContext): Record<string, unknown> {
  return {
    summary: context.summary,
    objects: context.objects.length,
    sections: context.sections.map((section) => ({ title: section.title, objects: section.objectIds.length })),
    diagnostics: context.diagnostics,
  };
}

function summarizeGraph(graph: GraphSubgraph): Record<string, number> {
  return { nodes: graph.nodes.length, edges: graph.edges.length };
}

function buildAnswerOutline(
  intent: NonNullable<ContextRequest["intent"]>,
  context: BuiltContext,
  impact: { nodes: GraphNode[]; edges: GraphEdge[] },
): string[] {
  return [
    `Intent: ${intent}`,
    `Use ${context.objects.length} context objects grouped into ${context.sections.length} sections.`,
    `Review impact surface across ${impact.nodes.length} nodes and ${impact.edges.length} edges.`,
    "Produce a repository-aware plan before editing files.",
  ];
}
