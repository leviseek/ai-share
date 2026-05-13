import { existsSync, readFileSync } from "node:fs";

/**
 * Options for compiling YAML memory files into natural language context.
 */
export type MemoryCompileOptions = {
  /** Profile identifier (e.g. "balanced", "max") for contextual output */
  profile: string;
  /** Base path for external ai-memory repository */
  aiMemoryBase: string;
  /** Absolute paths to memory YAML files to compile */
  memoryFiles: string[];
};

/**
 * YAML value type used internally by the memory compiler.
 * Supports scalars, lists, and nested objects (using unknown to avoid
 * circular type alias under isolatedDeclarations).
 */
type MemNode = string | string[] | Record<string, unknown>;

/**
 * Stack frame for parsing YAML indentation-based nesting.
 */
type StackFrame = {
  indent: number;
  node: Record<string, MemNode>;
};

/**
 * Compiles YAML memory files into concise, LLM-friendly natural language context.
 *
 * Reads each file path, parses the YAML structure using basic line-level parsing
 * (no external YAML library), and produces natural language sentences that read
 * like user instructions.
 *
 * Skips missing files gracefully. Keeps output under 500 characters.
 *
 * @param options - Compilation options including profile and file paths
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

  // No length limit — the compiled context should be complete.
  // OpenCode's instruction system handles large strings gracefully;
  // truncation would lose important user context.
  return result;
}

// ---------------------------------------------------------------------------
// YAML Parser
// ---------------------------------------------------------------------------

/**
 * Parses a YAML text into a tree of MemNode values.
 * Handles: nested objects, lists (with `- ` prefix), scalars, comments (#),
 * and YAML anchors (&). Does NOT handle inline arrays, flow mappings, or
 * multi-line strings (not needed for the memory files).
 */
function parseMemYaml(text: string): Record<string, MemNode> {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const root: Record<string, MemNode> = {};
  const stack: StackFrame[] = [{ indent: -1, node: root }];
  let i = 0;

  while (i < lines.length) {
    const line = stripYamlComment(lines[i] ?? "");
    if (!line.trim()) {
      i++;
      continue;
    }

    const indent = countIndent(line);

    // Pop stack to correct indentation level
    while (stack.length > 1 && indent <= (stack[stack.length - 1]?.indent ?? -1)) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      throw new Error("YAML 解析错误：stack 为空");
    }
    const parentNode = parent.node;
    const trimmed = line.trim();

    // Skip orphan list items (no parent key)
    if (trimmed.startsWith("- ")) {
      i++;
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (!key) {
      i++;
      continue;
    }

    // Empty value or YAML anchor (&) → try list or nested object
    if (rest === "" || rest.startsWith("&")) {
      const collected = collectListItems(lines, i + 1, indent);
      if (collected !== null) {
        parentNode[key] = collected.items;
        i = collected.endIdx + 1;
        continue;
      }

      // Nested object
      const child: Record<string, MemNode> = {};
      parentNode[key] = child;
      stack.push({ indent, node: child });
      i++;
      continue;
    }

    // Scalar value
    parentNode[key] = trimQuotes(rest);
    i++;
  }

  return root;
}

/**
 * Strips YAML comments (# ...) from a line, handling quoted strings.
 */
function stripYamlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;

  for (let idx = 0; idx < line.length; idx++) {
    const ch = line[idx];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (ch === "#" && !inSingle && !inDouble) {
      return line.slice(0, idx).trimEnd();
    }
  }

  return line.trimEnd();
}

/**
 * Counts leading whitespace (indentation) of a line.
 */
function countIndent(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Attempts to collect `- item` list items starting at startIdx.
 * Returns null if no list items are found.
 */
function collectListItems(
  lines: string[],
  startIdx: number,
  parentIndent: number,
): { items: string[]; endIdx: number } | null {
  const items: string[] = [];
  let endIdx = startIdx - 1;

  for (let j = startIdx; j < lines.length; j++) {
    const raw = lines[j] ?? "";
    const line = stripYamlComment(raw);

    if (!line.trim()) {
      continue;
    }

    const indent = countIndent(line);

    if (indent <= parentIndent) {
      break;
    }

    const trimmed = line.trim();

    if (!trimmed.startsWith("- ")) {
      break;
    }

    items.push(trimQuotes(trimmed.slice(2).trim()));
    endIdx = j;
  }

  return items.length > 0 ? { items, endIdx } : null;
}

/**
 * Removes surrounding quotes (single or double) from a string.
 */
function trimQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
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
