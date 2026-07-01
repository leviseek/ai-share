import { canonicalJsonHash } from "../core/ids.ts";
import type {
  GraphEdge,
  GraphNode,
  GraphSubgraph,
  KnowledgeObject,
  KnowledgeRelationship,
  RelationshipType,
} from "../core/types.ts";

export function buildGraph(objects: KnowledgeObject[], relationships: KnowledgeRelationship[]): GraphSubgraph {
  const nodes = objects.map((object): GraphNode => {
    const base: GraphNode = {
      id: object.id,
      objectId: object.id,
      type: object.type,
      label: object.title,
      metadata: object.metadata,
    };
    if (object.path !== undefined) return { ...base, path: object.path };
    return base;
  });
  const edges = relationships.map((relationship): GraphEdge => {
    const base: GraphEdge = {
      id: canonicalJsonHash({
        from: relationship.from,
        to: relationship.to,
        type: relationship.type,
        metadata: relationship.metadata,
      }),
      from: relationship.from,
      to: relationship.to,
      type: relationship.type,
      metadata: relationship.metadata,
    };
    if (relationship.weight !== undefined) return { ...base, weight: relationship.weight };
    return base;
  });
  return { nodes, edges };
}

export function neighbors(graph: GraphSubgraph, nodeId: string, types?: RelationshipType[]): GraphSubgraph {
  const typeSet = types === undefined ? undefined : new Set(types);
  const edges = graph.edges.filter(
    (edge) => (edge.from === nodeId || edge.to === nodeId) && (typeSet === undefined || typeSet.has(edge.type)),
  );
  const ids = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  return { nodes: graph.nodes.filter((node) => ids.has(node.id)), edges };
}

export function subgraph(
  graph: GraphSubgraph,
  seedIds: string[],
  depth: number,
  types?: RelationshipType[],
): GraphSubgraph {
  const typeSet = types === undefined ? undefined : new Set(types);
  const seen = new Set(seedIds);
  let frontier = new Set(seedIds);
  const selectedEdges: GraphEdge[] = [];
  for (let currentDepth = 0; currentDepth < depth; currentDepth++) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      if (typeSet !== undefined && !typeSet.has(edge.type)) continue;
      const touches = frontier.has(edge.from) || frontier.has(edge.to);
      if (!touches) continue;
      selectedEdges.push(edge);
      for (const id of [edge.from, edge.to]) {
        if (!seen.has(id)) {
          seen.add(id);
          next.add(id);
        }
      }
    }
    frontier = next;
  }
  return { nodes: graph.nodes.filter((node) => seen.has(node.id)), edges: uniqueEdges(selectedEdges) };
}

export function shortestPath(graph: GraphSubgraph, from: string, to: string): string[] {
  const queue: string[][] = [[from]];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const path = queue.shift();
    if (path === undefined) break;
    const last = path.at(-1);
    if (last === undefined) continue;
    if (last === to) return path;
    for (const edge of graph.edges) {
      if (edge.from !== last && edge.to !== last) continue;
      const next = edge.from === last ? edge.to : edge.from;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return [];
}

function uniqueEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (seen.has(edge.id)) return false;
    seen.add(edge.id);
    return true;
  });
}
