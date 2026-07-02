import type { BuiltContext } from "../context/builder.ts";
import type { ContextQualityReport } from "../context/quality.ts";
import type { GraphSubgraph } from "../core/types.ts";

export type SnapshotStatus = "missing" | "current" | "stale" | "empty" | "mismatched";

export type SnapshotSummary = {
  status: SnapshotStatus;
  repoRoot: string;
  storeDir: string;
  buildHash?: string;
  schemaVersion?: number;
  builtAt?: string;
  objectCount: number;
  edgeCount: number;
  diagnosticCount: number;
  recoveryActions: string[];
};

export type RepositoryEnvelope = {
  repoRoot: string;
  snapshot: SnapshotSummary;
};

export type SearchResultItem = {
  id: string;
  score: number;
  path?: string;
  title: string;
  summary?: string;
};

export type SearchToolResult = RepositoryEnvelope & {
  results: SearchResultItem[];
};

export type GraphToolResult = RepositoryEnvelope & GraphSubgraph;

export type ContextToolResult = RepositoryEnvelope & BuiltContext;

export type ContextQualityToolResult = RepositoryEnvelope & ContextQualityReport;

export type GraphExportToolResult = RepositoryEnvelope & {
  format: "json" | "mermaid";
  content: string;
};
