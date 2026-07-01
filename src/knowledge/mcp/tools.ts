import { buildContext, type BuiltContext, type ContextRequest } from "../context/builder.ts";
import type { BuildResult, GraphSubgraph } from "../core/types.ts";
import { neighbors } from "../graph/builder.ts";
import { exportGraph } from "../graph/export.ts";
import { impactAnalysis } from "../graph/impact.ts";
import { rankByTextSimilarity } from "../embedding/ranking.ts";

export type KnowledgeMcpTools = {
  search(query: string): unknown;
  graph(seedIds?: string[], depth?: number): GraphSubgraph;
  neighbors(objectId: string): GraphSubgraph;
  context(request: ContextRequest): BuiltContext;
  impact(objectId: string): GraphSubgraph;
  explain(objectId: string): BuiltContext;
  graphExport(format: "json" | "mermaid"): string;
};

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

function importSubgraph(graph: GraphSubgraph, seedIds: string[], depth: number): GraphSubgraph {
  // Static import wrapper keeps MCP tool surface synchronous.
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
