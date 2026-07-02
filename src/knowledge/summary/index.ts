import type { KnowledgeObject, KnowledgeRelationship, SummaryConfidence, SummaryProvenance } from "../core/types.ts";

export type SummarySignal = "type" | "title" | "path" | "tags" | "language" | "metadata" | "relationships";

export type SummaryInferenceInput = {
  object: KnowledgeObject;
  relationships: KnowledgeRelationship[];
};

export type SummaryInferenceResult = {
  summary: string;
  summaryProvenance: SummaryProvenance;
};

export const SUMMARY_MAX_LENGTH = 120;

export function inferNodeSummary(input: SummaryInferenceInput): SummaryInferenceResult {
  const object = input.object;
  const explicit = normalizeSummaryText(object.summary);
  if (explicit.length > 0) {
    return {
      summary: explicit,
      summaryProvenance: {
        source: "explicit",
        signals: ["metadata", ...safeSignals(object, input.relationships).filter((signal) => signal !== "metadata")],
        confidence: "high",
      },
    };
  }
  const signals = safeSignals(object, input.relationships);
  if (signals.length > 0) {
    return {
      summary: inferSummaryText(object, input.relationships),
      summaryProvenance: {
        source: "inferred",
        signals,
        confidence: confidenceFromSignals(signals),
      },
    };
  }
  return {
    summary: fallbackSummary(object),
    summaryProvenance: {
      source: "no-summary",
      signals: [],
      confidence: "low",
      fallbackReason: "没有足够的安全信号生成摘要",
    },
  };
}

export function applyNodeSummaries(
  objects: KnowledgeObject[],
  relationships: KnowledgeRelationship[],
): KnowledgeObject[] {
  return objects.map((object) => {
    const result = inferNodeSummary({ object, relationships });
    return { ...object, summary: result.summary, summaryProvenance: result.summaryProvenance };
  });
}

export function normalizeSummaryText(value: string | undefined): string {
  const redacted = redactSecretLikeText(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (redacted.length <= SUMMARY_MAX_LENGTH) return redacted;
  return `${redacted.slice(0, SUMMARY_MAX_LENGTH - 1).trimEnd()}…`;
}

export function redactSecretLikeText(value: string): string {
  return value.replace(
    /\b(api[_-]?key|token|cookie|password|secret)\b\s*(:|=)\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    (_match, key: string, separator: string) => `${key}${separator === "=" ? " =" : ":"} <redacted>`,
  );
}

function fallbackSummary(object: KnowledgeObject): string {
  return normalizeSummaryText(`无法为 ${object.type} ${object.title} 推理安全摘要`);
}

export function confidenceFromSignals(signals: SummarySignal[]): SummaryConfidence {
  if (signals.length >= 3) return "high";
  if (signals.length >= 1) return "medium";
  return "low";
}

function safeSignals(object: KnowledgeObject, relationships: KnowledgeRelationship[]): SummarySignal[] {
  const signals: SummarySignal[] = [];
  const hasTitle = object.title.trim().length > 0;
  const hasPath = object.path !== undefined && object.path.trim().length > 0;
  if (object.type.length > 0 && (hasTitle || hasPath)) signals.push("type");
  if (hasTitle) signals.push("title");
  if (hasPath) signals.push("path");
  if (object.tags.length > 0) signals.push("tags");
  if (object.language !== undefined && object.language.trim().length > 0) signals.push("language");
  if (safeMetadataEntries(object.metadata).length > 0) signals.push("metadata");
  if (relationships.some((relationship) => relationship.from === object.id || relationship.to === object.id))
    signals.push("relationships");
  return signals;
}

function inferSummaryText(object: KnowledgeObject, relationships: KnowledgeRelationship[]): string {
  const parts = [
    typePhrase(object),
    identityPhrase(object),
    relationshipPhrase(object, relationships),
    metadataPhrase(object),
  ]
    .filter((part) => part.length > 0)
    .join("，");
  return normalizeSummaryText(parts);
}

function typePhrase(object: KnowledgeObject): string {
  const noun = typeNoun(object.type);
  if (object.path !== undefined && object.path.trim().length > 0) return `${noun} ${object.title} 位于 ${object.path}`;
  if (object.title.trim().length > 0) return `${noun} ${object.title}`;
  return "";
}

function identityPhrase(object: KnowledgeObject): string {
  const details = [object.language ?? "", ...object.tags.filter((tag) => tag.trim().length > 0).slice(0, 2)].filter(
    (part) => part.length > 0,
  );
  return details.length === 0 ? "" : `用于识别 ${details.join("/")}`;
}

function relationshipPhrase(object: KnowledgeObject, relationships: KnowledgeRelationship[]): string {
  const outgoing = relationships.filter((relationship) => relationship.from === object.id);
  const incoming = relationships.filter((relationship) => relationship.to === object.id);
  const bits = [];
  if (outgoing.length > 0) bits.push(`${outgoing.length} 个 outgoing 关系`);
  if (incoming.length > 0) bits.push(`${incoming.length} 个 incoming 关系`);
  return bits.length === 0 ? "" : `连接 ${bits.join("、")}`;
}

function metadataPhrase(object: KnowledgeObject): string {
  const entries = safeMetadataEntries(object.metadata).slice(0, 2);
  if (entries.length === 0) return "";
  return `包含 ${entries.map(([key, value]) => `${key}=${metadataValueText(value)}`).join("、")}`;
}

function safeMetadataEntries(metadata: Record<string, unknown>): [string, unknown][] {
  return Object.entries(metadata).filter(
    ([key, value]) => !isSecretLikeKey(key) && metadataValueText(value).length > 0,
  );
}

function metadataValueText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return redactSecretLikeText(String(value)).slice(0, 30);
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object" && value !== null) return "object";
  return "";
}

function isSecretLikeKey(key: string): boolean {
  return /(api[_-]?key|token|cookie|password|secret)/i.test(key);
}

function typeNoun(type: KnowledgeObject["type"]): string {
  switch (type) {
    case "Project":
      return "项目";
    case "Directory":
      return "目录";
    case "Module":
      return "模块";
    case "File":
      return "文件";
    case "Document":
      return "文档";
    case "Section":
      return "章节";
    case "Workflow":
      return "工作流";
    case "Spec":
      return "规格";
    case "Rule":
      return "规则";
    case "Pattern":
      return "模式";
    case "Prompt":
      return "提示词";
    case "Example":
      return "示例";
    case "Task":
      return "任务";
    case "Milestone":
      return "里程碑";
    case "Agent":
      return "Agent 规则";
    case "MCP":
      return "MCP 配置";
    case "CodeFile":
      return "代码文件";
    case "CodeSymbol":
      return "代码符号";
    case "Package":
      return "包";
    case "Config":
      return "配置";
    case "Script":
      return "脚本";
    case "Test":
      return "测试文件";
    case "GeneratedArtifact":
      return "生成产物";
  }
}
