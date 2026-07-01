import type {
  BuildResult,
  GraphEdge,
  GraphNode,
  GraphSubgraph,
  KnowledgeObject,
  ParserDiagnostic,
  RelationshipType,
} from "../core/types.ts";

export type ObjectQuery = {
  ids?: string[];
  types?: KnowledgeObject["type"][];
  paths?: string[];
  text?: string;
};

export type NeighborQuery = {
  objectId: string;
  relationshipTypes?: RelationshipType[];
};

export type TraversalQuery = {
  seedIds: string[];
  depth: number;
  relationshipTypes?: RelationshipType[];
};

export type EmbeddingRecord = {
  objectId: string;
  model: string;
  vector: number[];
  updated_at: string;
};

export type EmbeddingQuery = {
  query: string;
  limit: number;
};

export type EmbeddingSearchResult = {
  objectId: string;
  score: number;
};

export type KnowledgeObjectStore = {
  upsert(objects: KnowledgeObject[]): Promise<void>;
  get(id: string): Promise<KnowledgeObject | undefined>;
  query(filter: ObjectQuery): Promise<KnowledgeObject[]>;
};

export type GraphStore = {
  upsertNodes(nodes: GraphNode[]): Promise<void>;
  upsertEdges(edges: GraphEdge[]): Promise<void>;
  neighbors(query: NeighborQuery): Promise<GraphSubgraph>;
  traverse(query: TraversalQuery): Promise<GraphSubgraph>;
  export(format: "json" | "mermaid"): Promise<string>;
};

export type EmbeddingStore = {
  upsert(items: EmbeddingRecord[]): Promise<void>;
  search(query: EmbeddingQuery): Promise<EmbeddingSearchResult[]>;
};

export type KnowledgeBuildStore = {
  writeSnapshot(input: BuildResult): Promise<void>;
  readSnapshot(): Promise<{
    objects: KnowledgeObject[];
    nodes: GraphNode[];
    edges: GraphEdge[];
    diagnostics: ParserDiagnostic[];
    metadata: BuildResult["metadata"];
  }>;
};
