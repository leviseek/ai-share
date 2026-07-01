import { subgraph } from "./builder.ts";
import type { GraphSubgraph } from "../core/types.ts";

export function impactAnalysis(graph: GraphSubgraph, objectId: string): GraphSubgraph {
  return subgraph(graph, [objectId], 2, [
    "contains",
    "imports",
    "depends_on",
    "references",
    "tested_by",
    "configures",
    "generated_from",
    "generates",
  ]);
}
