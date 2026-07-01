import { resolve } from "node:path";
import { buildContext, type BuiltContext, type ContextRequest } from "../context/builder.ts";
import { canonicalJsonHash } from "../core/ids.ts";
import type {
  BuildResult,
  GraphEdge,
  GraphNode,
  GraphSubgraph,
  KnowledgeObject,
  KnowledgeObjectType,
  RelationshipType,
} from "../core/types.ts";
import { rankByTextSimilarity } from "../embedding/ranking.ts";
import { subgraph } from "../graph/builder.ts";
import { impactAnalysis } from "../graph/impact.ts";
import { buildKnowledge } from "../index.ts";
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
  name:
    | "infer_intent"
    | "search"
    | "select_seeds"
    | "build_context"
    | "analyze_impact"
    | "compose_prompt_bundle"
    | "context"
    | "impact"
    | "answer_outline";
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

export type PromptBundleObject = {
  id: string;
  type: KnowledgeObject["type"];
  title: string;
  path?: string;
  summary?: string;
};

export type PromptBundle = {
  task: string;
  intent: NonNullable<ContextRequest["intent"]>;
  knowledgeObjects: PromptBundleObject[];
  relevantPaths: string[];
  impact: {
    seedId?: string;
    nodes: number;
    edges: number;
  };
  diagnostics: string[];
  markdown: string;
  hash: string;
};

export type CodexDryRun = {
  id: string;
  timestamp: string;
  prompt: string;
  intent: NonNullable<ContextRequest["intent"]>;
  selectedSeeds: string[];
  trace: CodexTraceStep[];
  context: BuiltContext;
  impact: GraphSubgraph;
  promptBundle: PromptBundle;
};

export type StudioSnapshot = Pick<BuildResult, "objects" | "nodes" | "edges">;

export type GraphViewOptions = {
  seedIds?: string[];
  depth?: number;
  nodeTypes?: KnowledgeObjectType[];
  edgeTypes?: RelationshipType[];
  query?: string;
  limit?: number;
};

const DEFAULT_GRAPH_LIMIT = 120;

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

export function buildGraphView(snapshot: StudioSnapshot, options: GraphViewOptions = {}): GraphSubgraph {
  const seedIds = options.seedIds ?? [];
  const graphDepth = normalizeDepth(options.depth ?? 1);
  const baseGraph =
    seedIds.length === 0
      ? { nodes: snapshot.nodes, edges: snapshot.edges }
      : subgraph({ nodes: snapshot.nodes, edges: snapshot.edges }, seedIds, graphDepth);
  return filterGraphView(baseGraph, options);
}

export function filterGraphView(graph: GraphSubgraph, options: GraphViewOptions): GraphSubgraph {
  const nodeTypeSet = options.nodeTypes === undefined ? undefined : new Set(options.nodeTypes);
  const edgeTypeSet = options.edgeTypes === undefined ? undefined : new Set(options.edgeTypes);
  const query = options.query?.trim().toLowerCase();
  const queryActive = query !== undefined && query.length > 0;
  const matchingNodeIds = queryActive ? collectQueryMatchedNodeIds(graph, query) : undefined;
  const filteredNodes = graph.nodes.filter(
    (node) =>
      (nodeTypeSet === undefined || nodeTypeSet.has(node.type)) &&
      (matchingNodeIds === undefined || matchingNodeIds.has(node.id)),
  );
  const limitedNodes = filteredNodes.slice(0, normalizeLimit(options.limit));
  const nodeIds = new Set(limitedNodes.map((node) => node.id));
  const filteredEdges = graph.edges.filter(
    (edge) =>
      nodeIds.has(edge.from) && nodeIds.has(edge.to) && (edgeTypeSet === undefined || edgeTypeSet.has(edge.type)),
  );
  return { nodes: limitedNodes, edges: filteredEdges };
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

export function buildCodexDryRun(
  snapshot: StudioSnapshot,
  request: Pick<ContextRequest, "intent" | "budget"> & { prompt: string },
  now: string = new Date().toISOString(),
): CodexDryRun {
  const prompt = request.prompt.trim();
  const intent = request.intent ?? inferIntent(prompt);
  const searchStartedAt = Date.now();
  const search = rankByTextSimilarity(snapshot.objects, prompt).slice(0, 10);
  const selectedSeeds = search.slice(0, 5).map((item) => item.object.id);
  const context = buildContext(snapshot, {
    query: prompt,
    intent,
    objectIds: selectedSeeds.slice(0, 3),
    budget: request.budget ?? { maxObjects: 30 },
  });
  const impactSeed = context.objects[0]?.id ?? selectedSeeds[0];
  const impact = impactSeed === undefined ? { nodes: [], edges: [] } : impactAnalysis(snapshot, impactSeed);
  const promptBundleInput: {
    prompt: string;
    intent: NonNullable<ContextRequest["intent"]>;
    context: BuiltContext;
    impact: GraphSubgraph;
    impactSeed?: string;
  } = { prompt, intent, context, impact };
  if (impactSeed !== undefined) promptBundleInput.impactSeed = impactSeed;
  const promptBundle = buildPromptBundle(promptBundleInput);
  const id = canonicalJsonHash({ prompt, intent, now, bundleHash: promptBundle.hash }).slice(0, 16);
  return {
    id,
    timestamp: now,
    prompt,
    intent,
    selectedSeeds,
    trace: [
      {
        name: "infer_intent",
        input: { prompt },
        output: { intent },
        durationMs: 1,
      },
      {
        name: "search",
        input: { query: prompt, limit: 10 },
        output: search.map((item) => ({
          id: item.object.id,
          score: item.score,
          path: item.object.path,
          title: item.object.title,
        })),
        durationMs: Math.max(1, Date.now() - searchStartedAt),
      },
      {
        name: "select_seeds",
        input: { searchResults: search.length, seedLimit: 5 },
        output: { selectedSeeds },
        durationMs: 1,
      },
      {
        name: "build_context",
        input: { intent, maxObjects: request.budget?.maxObjects ?? 30 },
        output: summarizeContext(context),
        durationMs: 1,
      },
      {
        name: "analyze_impact",
        input: { objectId: impactSeed },
        output: summarizeGraph(impact),
        durationMs: 1,
      },
      {
        name: "compose_prompt_bundle",
        input: { contextObjects: context.objects.length, impactNodes: impact.nodes.length },
        output: { hash: promptBundle.hash, relevantPaths: promptBundle.relevantPaths.length },
        durationMs: 1,
      },
    ],
    context,
    impact,
    promptBundle,
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

function normalizeDepth(depth: number): number {
  if (!Number.isFinite(depth)) return 1;
  return Math.max(0, Math.min(5, Math.trunc(depth)));
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_GRAPH_LIMIT;
  return Math.max(1, Math.min(500, Math.trunc(limit)));
}

function collectQueryMatchedNodeIds(graph: GraphSubgraph, query: string): Set<string> {
  const directMatches = new Set(
    graph.nodes.filter((node) => graphNodeSearchText(node).includes(query)).map((node) => node.id),
  );
  const neighborMatches = graph.edges
    .filter((edge) => directMatches.has(edge.from) || directMatches.has(edge.to))
    .flatMap((edge) => [edge.from, edge.to]);
  return new Set([...directMatches, ...neighborMatches]);
}

function graphNodeSearchText(node: GraphNode): string {
  return `${node.id} ${node.objectId} ${node.type} ${node.label} ${node.path ?? ""}`.toLowerCase();
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

function buildPromptBundle(input: {
  prompt: string;
  intent: NonNullable<ContextRequest["intent"]>;
  context: BuiltContext;
  impact: GraphSubgraph;
  impactSeed?: string;
}): PromptBundle {
  const knowledgeObjects = input.context.objects.map((object): PromptBundleObject => {
    const bundleObject: PromptBundleObject = {
      id: object.id,
      type: object.type,
      title: object.title,
    };
    if (object.path !== undefined) bundleObject.path = object.path;
    if (object.summary !== undefined) bundleObject.summary = object.summary;
    return bundleObject;
  });
  const relevantPaths = [
    ...new Set(input.context.objects.map((object) => object.path).filter((path): path is string => path !== undefined)),
  ];
  const impact = {
    nodes: input.impact.nodes.length,
    edges: input.impact.edges.length,
  } as PromptBundle["impact"];
  if (input.impactSeed !== undefined) impact.seedId = input.impactSeed;
  const bundleWithoutHash: Omit<PromptBundle, "markdown" | "hash"> = {
    task: input.prompt,
    intent: input.intent,
    knowledgeObjects,
    relevantPaths,
    impact,
    diagnostics: input.context.diagnostics,
  };
  const hash = canonicalJsonHash(bundleWithoutHash);
  return {
    ...bundleWithoutHash,
    markdown: renderPromptBundleMarkdown(bundleWithoutHash),
    hash,
  };
}

function renderPromptBundleMarkdown(bundle: Omit<PromptBundle, "markdown" | "hash">): string {
  const paths = bundle.relevantPaths.map((path) => `- ${path}`).join("\n") || "- 无";
  const objects = bundle.knowledgeObjects
    .map(
      (object) =>
        `- [${object.type}] ${object.title} (${object.id})${object.path === undefined ? "" : ` — ${object.path}`}`,
    )
    .join("\n");
  const diagnostics = bundle.diagnostics.map((diagnostic) => `- ${diagnostic}`).join("\n") || "- 无";
  return [
    "# Codex Dry Run Context Bundle",
    "",
    "## Task",
    bundle.task,
    "",
    "## Intent",
    bundle.intent,
    "",
    "## Relevant Paths",
    paths,
    "",
    "## Knowledge Objects",
    objects || "- 无",
    "",
    "## Impact Surface",
    `- Seed: ${bundle.impact.seedId ?? "无"}`,
    `- Nodes: ${bundle.impact.nodes}`,
    `- Edges: ${bundle.impact.edges}`,
    "",
    "## Diagnostics",
    diagnostics,
    "",
  ].join("\n");
}
