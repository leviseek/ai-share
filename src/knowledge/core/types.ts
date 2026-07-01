export type KnowledgeObjectType =
  | "Project"
  | "Directory"
  | "Module"
  | "File"
  | "Document"
  | "Section"
  | "Workflow"
  | "Spec"
  | "Rule"
  | "Pattern"
  | "Prompt"
  | "Example"
  | "Task"
  | "Milestone"
  | "Agent"
  | "MCP"
  | "CodeFile"
  | "CodeSymbol"
  | "Package"
  | "Config"
  | "Script"
  | "Test"
  | "GeneratedArtifact";

export type RelationshipType =
  | "contains"
  | "belongs_to"
  | "implements"
  | "depends_on"
  | "references"
  | "uses"
  | "extends"
  | "imports"
  | "calls"
  | "owns"
  | "related_to"
  | "supports"
  | "requires"
  | "generated_from"
  | "generates"
  | "documents"
  | "tested_by"
  | "configures"
  | "declares"
  | "exports";

export type KnowledgeRelationship = {
  from: string;
  to: string;
  type: RelationshipType;
  weight?: number;
  metadata: Record<string, unknown>;
};

export type KnowledgeObject = {
  id: string;
  type: KnowledgeObjectType;
  title: string;
  summary?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  path?: string;
  language?: string;
  relationships: KnowledgeRelationship[];
  updated_at: string;
  hash: string;
  embedding?: {
    model: string;
    vectorRef: string;
    updated_at: string;
  };
};

export type RepositoryResource = {
  path: string;
  absolutePath: string;
  kind: "file" | "directory";
  language?: string;
  size?: number;
  hash?: string;
};

export type ParserDiagnostic = {
  parser: string;
  path: string;
  severity: "info" | "warning" | "error";
  message: string;
};

export type ParseResult = {
  objects: KnowledgeObject[];
  relationships: KnowledgeRelationship[];
  diagnostics: ParserDiagnostic[];
};

export type ParserContext = {
  repoRoot: string;
  now: string;
  repositoryFiles: Set<string>;
};

export type RepositoryParser = {
  name: string;
  supports(resource: RepositoryResource): boolean;
  parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult>;
};

export type GraphNode = {
  id: string;
  objectId: string;
  type: KnowledgeObjectType;
  label: string;
  path?: string;
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  type: RelationshipType;
  weight?: number;
  metadata: Record<string, unknown>;
};

export type GraphSubgraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type BuildResult = {
  objects: KnowledgeObject[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  diagnostics: ParserDiagnostic[];
  metadata: {
    schemaVersion: number;
    repoRoot: string;
    builtAt: string;
    buildHash: string;
    resourceCount: number;
  };
};
