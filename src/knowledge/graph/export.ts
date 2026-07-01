import type { GraphSubgraph } from "../core/types.ts";

export function exportGraph(graph: GraphSubgraph, format: "json" | "mermaid"): string {
  if (format === "json") return `${JSON.stringify(graph, null, 2)}\n`;
  const lines = ["flowchart TD"];
  for (const node of graph.nodes) lines.push(`  ${safeId(node.id)}["${escapeLabel(node.label)}"]`);
  for (const edge of graph.edges) lines.push(`  ${safeId(edge.from)} -- ${edge.type} --> ${safeId(edge.to)}`);
  return `${lines.join("\n")}\n`;
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeLabel(label: string): string {
  return label.replaceAll('"', "'");
}
