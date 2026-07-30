import { existsSync, readFileSync } from "node:fs";
import { parseYamlObject } from "../yaml.ts";

/**
 * Options for compiling YAML memory files into natural language context.
 */
export type MemoryCompileOptions = {
  /** Base path for this repository's memory/ directory */
  memoryBase: string;
  /** Absolute paths to memory YAML files to compile */
  memoryFiles: string[];
};

/**
 * YAML value type used internally by the memory compiler.
 * Supports scalars, lists, and nested objects (using unknown to avoid
 * circular type alias under isolatedDeclarations).
 */
export type MemNode = string | string[] | Record<string, unknown>;

/**
 * Compiles YAML memory files into concise, LLM-friendly natural language context.
 *
 * Reads each file path, parses the YAML structure using basic line-level parsing
 * (no external YAML library), and produces natural language sentences that read
 * like user instructions.
 *
 * Skips missing files gracefully. Keeps output under 500 characters.
 *
 * @param options - Compilation options including memory base and file paths
 * @returns A single formatted string with natural language context
 */
export function compileMemory(options: MemoryCompileOptions): string {
  const segments: string[] = [];

  for (const filePath of options.memoryFiles) {
    if (!existsSync(filePath)) {
      continue;
    }

    const text = readFileSync(filePath, "utf-8");
    const root = parseMemYaml(text);
    const sentences = nodeToSentences(root);

    if (sentences.length > 0) {
      segments.push(sentences.join(" "));
    }
  }

  const result = segments.join("\n");

  // No length limit: generated instructions should preserve complete user context.
  // Truncation here would silently drop important memory.
  return result;
}

/**
 * Parses a YAML text into a tree of MemNode values.
 * Reuses the repository YAML subset parser and normalizes scalar values to
 * strings because memory compilation only needs textual context.
 */
export function parseMemYaml(text: string): Record<string, MemNode> {
  return normalizeMemRecord(parseYamlObject(text));
}

function normalizeMemRecord(value: Record<string, unknown>): Record<string, MemNode> {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeMemNode(child)]));
}

function normalizeMemNode(value: unknown): MemNode {
  if (Array.isArray(value)) return value.map((item) => formatMemScalar(item));
  if (typeof value === "object" && value !== null) return normalizeMemRecord(value as Record<string, unknown>);
  return formatMemScalar(value);
}

function formatMemScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value.toString();
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Natural Language Generator
// ---------------------------------------------------------------------------

/**
 * Converts a snake_case key to natural language by replacing underscores
 * with spaces.
 */
function formatKeyName(key: string): string {
  return key.replace(/_/g, " ");
}

/**
 * Recursively walks a MemNode tree and produces natural language sentences.
 * Each meaningful section (list, principle, anti-pattern, etc.) becomes one
 * sentence. Heavily nested scalars are combined to keep output concise.
 */
function nodeToSentences(node: MemNode, path: string[] = []): string[] {
  if (typeof node === "string") {
    // Skip standalone scalars; they're handled by their parent context
    return [];
  }

  if (Array.isArray(node)) {
    return listToSentences(node, path);
  }

  // Safe cast: runtime values are MemNode by construction (all parsed values)
  return objectToSentences(node as Record<string, MemNode>, path);
}

/**
 * Generates sentences from a list node.
 */
function listToSentences(items: string[], path: string[]): string[] {
  if (items.length === 0) {
    return [];
  }

  const ctx = path[path.length - 1] ?? "";
  const joined = items.join(", ");

  if (ctx === "anti_patterns") {
    return [`Rules to NOT follow: ${joined}.`];
  }

  if (ctx === "principles") {
    return [`Coding principles: ${joined}.`];
  }

  if (ctx === "focus") {
    return [`Focus: ${joined}.`];
  }

  if (ctx === "long_term") {
    return [`Long-term: ${joined}.`];
  }

  if (ctx === "selection_rules") {
    return [`Selection rules: ${joined}.`];
  }

  return [`${formatKeyName(ctx)}: ${joined}.`];
}

/**
 * Generates sentences from an object node. Combines sibling scalars into
 * one compound sentence. Recurses into complex (object/list) children.
 */
function objectToSentences(obj: Record<string, MemNode>, path: string[]): string[] {
  const results: string[] = [];
  const entries = Object.entries(obj);

  // Separate scalar leaves from complex children
  const scalars: [string, string][] = [];
  const complex: [string, MemNode][] = [];

  for (const [key, value] of entries) {
    if (typeof value === "string") {
      scalars.push([key, value]);
    } else {
      complex.push([key, value]);
    }
  }

  // Combine sibling scalars into one compound sentence
  if (scalars.length > 0) {
    const parts = scalars.map(([k, v]) => `${formatKeyName(k)}: ${v}`);
    const ctx = path[path.length - 1] ?? "";

    if (ctx !== "") {
      results.push(`${formatKeyName(ctx)}: ${parts.join(", ")}.`);
    } else {
      results.push(`${parts.join(", ")}.`);
    }
  }

  // Recurse into complex children
  for (const [key, value] of complex) {
    const childSentences = nodeToSentences(value, [...path, key]);
    results.push(...childSentences);
  }

  return results;
}

/**
 * Serializes a MemNode tree back into a YAML string.
 * Produces 2-space indentation matching the project convention.
 * Handles scalars, lists, and nested objects.
 *
 * @param node   - The parsed memory YAML tree to serialize.
 * @param indent - Current indentation level (default 0).
 * @returns A YAML-formatted string.
 */
export function serializeMemYaml(node: Record<string, MemNode>, indent = 0): string {
  const lines: string[] = [];
  const pad = " ".repeat(indent);

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      lines.push(`${pad}${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      for (const item of value) {
        lines.push(`${pad}  - ${item}`);
      }
    } else {
      lines.push(`${pad}${key}:`);
      const nested = serializeMemYamlLines(value as Record<string, MemNode>, indent + 2);
      lines.push(...nested);
    }
  }

  return lines.join("\n");
}

function serializeMemYamlLines(node: Record<string, MemNode>, indent: number): string[] {
  const lines: string[] = [];
  const pad = " ".repeat(indent);

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      lines.push(`${pad}${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      for (const item of value) {
        lines.push(`${pad}  - ${item}`);
      }
    } else {
      lines.push(`${pad}${key}:`);
      const nested = serializeMemYamlLines(value as Record<string, MemNode>, indent + 2);
      lines.push(...nested);
    }
  }

  return lines;
}
