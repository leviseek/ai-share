import { buildContext, type BuiltContext, type ContextRequest } from "../context/builder.ts";
import type { ContextQualityReport } from "../context/quality.ts";
import type { BuildResult, GraphSubgraph } from "../core/types.ts";
import { rankByTextSimilarity } from "../embedding/ranking.ts";
import { neighbors } from "../graph/builder.ts";
import { exportGraph } from "../graph/export.ts";
import { impactAnalysis } from "../graph/impact.ts";
import type { RepositorySelectionInput } from "./repository.ts";
import { buildRieMcpReadinessReport, type RieMcpReadinessReport } from "./readiness.ts";
import { loadRepositorySnapshot } from "./snapshot.ts";
import type {
  ContextQualityToolResult,
  ContextToolResult,
  GraphExportToolResult,
  GraphToolResult,
  SearchToolResult,
} from "./types.ts";

export type KnowledgeMcpTools = {
  search(query: string): unknown;
  graph(seedIds?: string[], depth?: number): GraphSubgraph;
  neighbors(objectId: string): GraphSubgraph;
  context(request: ContextRequest): BuiltContext;
  contextQuality(request: ContextRequest): ContextQualityReport;
  impact(objectId: string): GraphSubgraph;
  explain(objectId: string): BuiltContext;
  graphExport(format: "json" | "mermaid"): string;
};

export type RepositoryMcpTools = {
  search(input: { query: string; limit?: number; repoRoot?: string }): Promise<SearchToolResult>;
  graph(input?: { seedIds?: string[]; depth?: number; repoRoot?: string }): Promise<GraphToolResult>;
  neighbors(input: { objectId: string; repoRoot?: string }): Promise<GraphToolResult>;
  context(input: ContextRequest & { repoRoot?: string }): Promise<ContextToolResult>;
  contextQuality(input: ContextRequest & { repoRoot?: string }): Promise<ContextQualityToolResult>;
  impact(input: { objectId: string; repoRoot?: string }): Promise<GraphToolResult>;
  explain(input: { objectId: string; repoRoot?: string }): Promise<ContextToolResult>;
  graphExport(input: { format: "json" | "mermaid"; repoRoot?: string }): Promise<GraphExportToolResult>;
  readiness(input?: { repoRoot?: string; refresh?: boolean }): Promise<RieMcpReadinessReport>;
};

export type McpToolDefinition = {
  name: string;
  description: string;
};

export const RIE_MCP_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  { name: "rie.search", description: "Search repository knowledge objects by text query." },
  { name: "rie.context", description: "Build a repository context bundle for a query or seeds." },
  { name: "rie.graph", description: "Return the repository knowledge graph or a seeded subgraph." },
  { name: "rie.neighbors", description: "Return graph neighbors for one repository object." },
  { name: "rie.impact", description: "Return impact graph for one repository object." },
  { name: "rie.explain", description: "Build explanation-focused context for one repository object." },
  { name: "rie.context_quality", description: "Return the quality report for a context request." },
  { name: "rie.graph_export", description: "Export the repository graph as json or mermaid." },
  { name: "rie.readiness", description: "Diagnose whether RIE MCP injection and repository snapshot are ready." },
];

export function createKnowledgeMcpTools(result: Pick<BuildResult, "objects" | "nodes" | "edges">): KnowledgeMcpTools {
  const graph = { nodes: result.nodes, edges: result.edges };
  return {
    search(query: string): unknown {
      return rankByTextSimilarity(result.objects, query)
        .slice(0, 10)
        .map((item) => ({ id: item.object.id, score: item.score, path: item.object.path, title: item.object.title }));
    },
    graph(seedIds: string[] = [], depth = 1): GraphSubgraph {
      if (seedIds.length === 0) return graph;
      return importSubgraph(graph, seedIds, depth);
    },
    neighbors(objectId: string): GraphSubgraph {
      return neighbors(graph, objectId);
    },
    context(request: ContextRequest): BuiltContext {
      return buildContext(result, request);
    },
    contextQuality(request: ContextRequest): ContextQualityReport {
      const quality = buildContext(result, request).quality;
      if (quality === undefined) throw new Error("Context quality report is unavailable.");
      return quality;
    },
    impact(objectId: string): GraphSubgraph {
      return impactAnalysis(graph, objectId);
    },
    explain(objectId: string): BuiltContext {
      return buildContext(result, { query: objectId, objectIds: [objectId], intent: "explain" });
    },
    graphExport(format: "json" | "mermaid"): string {
      return exportGraph(graph, format);
    },
  };
}

export function createRepositoryMcpTools(input: RepositorySelectionInput = {}): RepositoryMcpTools {
  return {
    async search(request): Promise<SearchToolResult> {
      const loaded = await loadRepositorySnapshot(repositorySnapshotInput(input, request.repoRoot));
      const results = rankByTextSimilarity(loaded.result.objects, request.query)
        .slice(0, request.limit ?? 10)
        .map((item) => ({
          id: item.object.id,
          score: item.score,
          ...(item.object.path ? { path: item.object.path } : {}),
          title: item.object.title,
          ...(item.object.summary ? { summary: item.object.summary } : {}),
        }));
      return { repoRoot: loaded.snapshot.repoRoot, snapshot: loaded.snapshot, results };
    },
    async graph(request = {}): Promise<GraphToolResult> {
      const loaded = await loadRepositorySnapshot(repositorySnapshotInput(input, request.repoRoot));
      const graph = { nodes: loaded.result.nodes, edges: loaded.result.edges };
      const output =
        request.seedIds && request.seedIds.length > 0
          ? importSubgraph(graph, request.seedIds, request.depth ?? 1)
          : graph;
      return { repoRoot: loaded.snapshot.repoRoot, snapshot: loaded.snapshot, ...output };
    },
    async neighbors(request): Promise<GraphToolResult> {
      const loaded = await loadRepositorySnapshot(repositorySnapshotInput(input, request.repoRoot));
      const output = neighbors({ nodes: loaded.result.nodes, edges: loaded.result.edges }, request.objectId);
      return { repoRoot: loaded.snapshot.repoRoot, snapshot: loaded.snapshot, ...output };
    },
    async context(request): Promise<ContextToolResult> {
      const loaded = await loadRepositorySnapshot(repositorySnapshotInput(input, request.repoRoot));
      const output = buildContext(loaded.result, request);
      return { repoRoot: loaded.snapshot.repoRoot, snapshot: loaded.snapshot, ...output };
    },
    async contextQuality(request): Promise<ContextQualityToolResult> {
      const context = await this.context(request);
      if (context.quality === undefined) throw new Error("Context quality report is unavailable.");
      return { repoRoot: context.repoRoot, snapshot: context.snapshot, ...context.quality };
    },
    async impact(request): Promise<GraphToolResult> {
      const loaded = await loadRepositorySnapshot(repositorySnapshotInput(input, request.repoRoot));
      const output = impactAnalysis({ nodes: loaded.result.nodes, edges: loaded.result.edges }, request.objectId);
      return { repoRoot: loaded.snapshot.repoRoot, snapshot: loaded.snapshot, ...output };
    },
    async explain(request): Promise<ContextToolResult> {
      return await this.context({
        query: request.objectId,
        objectIds: [request.objectId],
        intent: "explain",
        ...(request.repoRoot === undefined ? {} : { repoRoot: request.repoRoot }),
      });
    },
    async graphExport(request): Promise<GraphExportToolResult> {
      const loaded = await loadRepositorySnapshot(repositorySnapshotInput(input, request.repoRoot));
      return {
        repoRoot: loaded.snapshot.repoRoot,
        snapshot: loaded.snapshot,
        format: request.format,
        content: exportGraph({ nodes: loaded.result.nodes, edges: loaded.result.edges }, request.format),
      };
    },
    async readiness(request = {}): Promise<RieMcpReadinessReport> {
      return await buildRieMcpReadinessReport({
        mcpConfig: { servers: { rie: { transport: "stdio", command: "bun", args: ["run", "knowledge:mcp"] } } },
        codexHome: process.env.CODEX_HOME ?? "",
        ...optionalRepoRoot(request.repoRoot ?? input.repoRoot ?? input.cwd),
        ...(request.refresh === undefined ? {} : { refresh: request.refresh }),
      });
    },
  };
}

function repositorySnapshotInput(
  input: RepositorySelectionInput,
  repoRoot: string | undefined,
): RepositorySelectionInput {
  return {
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...optionalRepoRoot(repoRoot ?? input.repoRoot),
  };
}

function optionalRepoRoot(repoRoot: string | undefined): { repoRoot?: string } {
  return repoRoot === undefined ? {} : { repoRoot };
}

function importSubgraph(graph: GraphSubgraph, seedIds: string[], depth: number): GraphSubgraph {
  const seen = new Set(seedIds);
  let frontier = new Set(seedIds);
  const edges = [] as GraphSubgraph["edges"];
  for (let i = 0; i < depth; i++) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      if (!frontier.has(edge.from) && !frontier.has(edge.to)) continue;
      edges.push(edge);
      for (const id of [edge.from, edge.to]) {
        if (!seen.has(id)) {
          seen.add(id);
          next.add(id);
        }
      }
    }
    frontier = next;
  }
  return { nodes: graph.nodes.filter((node) => seen.has(node.id)), edges };
}
