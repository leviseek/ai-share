import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { contentHash, objectId, stableAnchor } from "../core/ids.ts";
import type {
  KnowledgeObject,
  KnowledgeRelationship,
  ParseResult,
  ParserContext,
  RepositoryParser,
  RepositoryResource,
} from "../core/types.ts";

export const markdownParser: RepositoryParser = {
  name: "markdown",
  supports(resource: RepositoryResource): boolean {
    return resource.kind === "file" && resource.path.endsWith(".md");
  },
  async parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult> {
    const raw = await readFile(resource.absolutePath, "utf-8");
    const documentId = documentObjectId(resource.path);
    const objectType = classifyMarkdown(resource.path, raw);
    const objects: KnowledgeObject[] = [
      makeObject({
        id: documentId,
        type: objectType,
        title: titleFromMarkdown(resource.path, raw),
        summary: firstParagraph(raw) ?? "",
        tags: tagsForMarkdown(resource.path),
        path: resource.path,
        language: "markdown",
        hash: resource.hash ?? contentHash(raw),
        now: context.now,
      }),
    ];
    const relationships: KnowledgeRelationship[] = [];
    const parent = dirname(resource.path).replaceAll("\\", "/");
    if (parent !== ".") {
      relationships.push({ from: `dir:${parent}`, to: documentId, type: "contains", metadata: { parser: "markdown" } });
    }

    const headingStack: { level: number; id: string }[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (match === null) continue;
      const level = match[1]?.length ?? 1;
      const text = match[2]?.trim() ?? "section";
      const sectionId = objectId("section", resource.path, stableAnchor(text));
      objects.push(
        makeObject({
          id: sectionId,
          type: classifySection(text),
          title: text,
          tags: ["section"],
          path: resource.path,
          language: "markdown",
          hash: contentHash(`${resource.hash ?? contentHash(raw)}:${text}:${level}`),
          now: context.now,
          metadata: { level },
        }),
      );
      while (headingStack.length > 0 && (headingStack.at(-1)?.level ?? 0) >= level) headingStack.pop();
      const container = headingStack.at(-1)?.id ?? documentId;
      relationships.push({ from: container, to: sectionId, type: "contains", metadata: { parser: "markdown", level } });
      headingStack.push({ level, id: sectionId });
    }

    return { objects, relationships, diagnostics: [] };
  },
};

function documentObjectId(path: string): string {
  if (path.endsWith("AGENTS.md") || path.endsWith("CODEX.md")) return objectId("agent", path);
  return objectId("doc", path);
}

function classifyMarkdown(path: string, raw: string): KnowledgeObject["type"] {
  const lower = `${path}\n${raw.slice(0, 500)}`.toLowerCase();
  if (path.endsWith("AGENTS.md") || path.endsWith("CODEX.md")) return "Agent";
  if (lower.includes("workflow")) return "Workflow";
  if (lower.includes("spec")) return "Spec";
  if (lower.includes("prompt")) return "Prompt";
  if (lower.includes("example")) return "Example";
  return "Document";
}

function classifySection(title: string): KnowledgeObject["type"] {
  const lower = title.toLowerCase();
  if (lower.includes("rule") || lower.includes("规则") || lower.includes("must") || lower.includes("never"))
    return "Rule";
  if (lower.includes("workflow") || lower.includes("工作流")) return "Workflow";
  if (lower.includes("spec")) return "Spec";
  if (lower.includes("example") || lower.includes("示例")) return "Example";
  return "Section";
}

function titleFromMarkdown(path: string, raw: string): string {
  const heading = /^#\s+(.+)$/m.exec(raw)?.[1]?.trim();
  return heading ?? path.split("/").at(-1) ?? path;
}

function firstParagraph(raw: string): string | undefined {
  const paragraph = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 20 && !line.startsWith("#") && !line.startsWith("```"));
  return paragraph;
}

function tagsForMarkdown(path: string): string[] {
  const tags = ["markdown"];
  if (path.endsWith("AGENTS.md")) tags.push("agent-rules");
  if (path.endsWith("README.md")) tags.push("readme");
  return tags;
}

type ObjectInput = {
  id: string;
  type: KnowledgeObject["type"];
  title: string;
  summary?: string;
  tags: string[];
  path: string;
  language: string;
  hash: string;
  now: string;
  metadata?: Record<string, unknown>;
};

function makeObject(input: ObjectInput): KnowledgeObject {
  const base: KnowledgeObject = {
    id: input.id,
    type: input.type,
    title: input.title,
    tags: input.tags,
    metadata: input.metadata ?? {},
    path: input.path,
    language: input.language,
    relationships: [],
    updated_at: input.now,
    hash: input.hash,
  };
  if (input.summary !== undefined) return { ...base, summary: input.summary };
  return base;
}
