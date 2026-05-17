import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { parseMemYaml, type MemNode } from "../loaders/memory-compiler.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResult = {
  path: string;
  score: number;
  snippet: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Memory subdirectories to search (excludes runtime/ and sync/). */
const SEARCH_DIRS = ["stable", "profiles", "policies", "user", "architecture", "stack"];

/** Max results returned by searchMemory. */
const MAX_RESULTS = 5;

/** Min paragraph line length (chars) for Markdown extraction. */
const MIN_PARAGRAPH_LEN = 10;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Searches local memory files using TF-IDF keyword matching.
 *
 * Reads all `.md` and `.yaml` files from memory subdirectories (stable/,
 * profiles/, policies/, user/, architecture/, stack/), tokenizes content,
 * builds an in-memory TF-IDF index, and returns the top 5 matching file
 * paths sorted by relevance.
 *
 * YAML files are parsed via `parseMemYaml` then value-flattened; Markdown
 * files are preprocessed by extracting headings and paragraph text.
 *
 * @param query       - Natural-language search query (Chinese and/or English).
 * @param projectRoot - Optional project root directory (defaults to ai-share root).
 * @returns Up to 5 results ranked by TF-IDF score, each with a short snippet.
 */
export function searchMemory(query: string, projectRoot?: string): SearchResult[] {
  const root = projectRoot ?? resolve(import.meta.dirname, "..", "..");
  const memoryDir = resolve(root, "memory");

  // 1. Collect files --------------------------------------------------------
  const files = collectMemoryFiles(memoryDir);
  if (files.length === 0) return [];

  // 2. Read & tokenize documents --------------------------------------------
  const docTokens: Map<string, number>[] = [];
  const validFiles: string[] = [];

  for (const file of files) {
    const tokens = extractTextTokens(file);
    if (tokens.length === 0) continue;
    docTokens.push(freqMap(tokens));
    validFiles.push(file);
  }

  if (docTokens.length === 0) return [];

  // 3. Compute IDF ----------------------------------------------------------
  const totalDocs = docTokens.length;
  const docFreq = new Map<string, number>();
  for (const tf of docTokens) {
    for (const term of tf.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  const idf = computeIDF(docFreq, totalDocs);

  // 4. Tokenize query -------------------------------------------------------
  const queryTerms = tokenize(query);
  const queryVec = freqMap(queryTerms);

  // 5. Score & rank ---------------------------------------------------------
  const scored: SearchResult[] = [];

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    if (file === undefined) continue;
    const tf = docTokens[i];
    if (tf === undefined) continue;
    let score = 0;

    for (const [term, queryFreq] of queryVec) {
      const docF = tf.get(term);
      if (docF === undefined) continue;
      const termIdf = idf.get(term) ?? 0;
      score += docF * termIdf * queryFreq;
    }

    if (score > 0) {
      scored.push({
        path: relative(root, file).replaceAll(sep, "/"),
        score,
        snippet: buildSnippet(file, queryTerms),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS);
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function collectMemoryFiles(memoryDir: string): string[] {
  const files: string[] = [];

  for (const dir of SEARCH_DIRS) {
    const dirPath = resolve(memoryDir, dir);
    if (!existsSync(dirPath)) continue;

    const entries = readdirSync(dirPath, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (name.endsWith(".md") || name.endsWith(".yaml")) {
        files.push(resolve(dirPath, entry.name));
      }
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

function extractTextTokens(filePath: string): string[] {
  const raw = readFileSync(filePath, "utf-8");

  if (filePath.endsWith(".yaml")) {
    return extractYamlTokens(raw);
  }

  return extractMarkdownTokens(raw);
}

/** Parses YAML via parseMemYaml and recursively collects all string values. */
function extractYamlTokens(raw: string): string[] {
  try {
    const root = parseMemYaml(raw);
    return tokenize(collectYamlStrings(root));
  } catch {
    // Graceful fallback: tokenize raw text if YAML parsing fails
    return tokenize(raw);
  }
}

function collectYamlStrings(node: MemNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.join(" ");
  const obj = node as Record<string, MemNode>;
  return Object.values(obj)
    .map((v) => collectYamlStrings(v))
    .join(" ");
}

/** Extracts headings and paragraph text from Markdown. */
function extractMarkdownTokens(raw: string): string[] {
  const lines = raw.replaceAll("\r\n", "\n").split("\n");
  const parts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Heading lines (## Compaction, ## 配置机制, etc.)
    if (trimmed.startsWith("#")) {
      parts.push(trimmed.replace(/^#+\s*/, ""));
      continue;
    }

    // Skip YAML frontmatter fences, code fences, horizontal rules, list markers
    if (trimmed.startsWith("```") || trimmed.startsWith("---") || /^[-*]\s/.test(trimmed)) {
      continue;
    }

    // Paragraph text: long enough, not a markup line
    if (trimmed.length >= MIN_PARAGRAPH_LEN && !/^[>\]]/.test(trimmed)) {
      parts.push(trimmed);
    }
  }

  return tokenize(parts.join(" "));
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenizes mixed Chinese/English text.
 *
 * - Chinese (CJK Unified Ideographs): produces single-char and bigram tokens
 *   for better recall on short queries.
 * - English / ASCII words: split on non-alphanumeric, lowercased, filtered
 *   for short tokens (length >= 2).
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === undefined) break;

    if (isCJK(ch)) {
      // Collect consecutive CJK run
      const start = i;
      while (i < text.length) {
        const nc = text[i];
        if (nc === undefined || !isCJK(nc)) break;
        i++;
      }
      const run = text.slice(start, i);

      // Single chars
      for (const c of run) {
        tokens.push(c);
      }
      // Bigrams (for better matching)
      for (let j = 0; j < run.length - 1; j++) {
        tokens.push(run.slice(j, j + 2));
      }
    } else if (isAlphaNum(ch)) {
      // Collect consecutive word characters
      const start = i;
      while (i < text.length) {
        const nc = text[i];
        if (nc === undefined || !isAlphaNum(nc)) break;
        i++;
      }
      const word = text.slice(start, i).toLowerCase();
      if (word.length >= 2) tokens.push(word);
    } else {
      i++;
    }
  }

  return tokens;
}

function isCJK(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  // CJK Unified Ideographs + Extensions
  return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf);
}

function isAlphaNum(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return (
    (cp >= 0x30 && cp <= 0x39) || // 0-9
    (cp >= 0x41 && cp <= 0x5a) || // A-Z
    (cp >= 0x61 && cp <= 0x7a) // a-z
  );
}

// ---------------------------------------------------------------------------
// TF-IDF helpers
// ---------------------------------------------------------------------------

/** Converts a token list into a frequency map normalized by document length. */
function freqMap(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tokens) {
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  // Normalize by doc length (TF = count / total)
  const len = tokens.length;
  for (const [t, c] of map) {
    map.set(t, c / len);
  }
  return map;
}

/** Computes inverse document frequency: log(totalDocs / (1 + docFreq)). */
function computeIDF(docFreq: Map<string, number>, totalDocs: number): Map<string, number> {
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log(totalDocs / (1 + df)));
  }
  return idf;
}

// ---------------------------------------------------------------------------
// Snippet
// ---------------------------------------------------------------------------

/** Builds a short snippet around the first matching term. */
function buildSnippet(filePath: string, queryTerms: string[]): string {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.replaceAll("\r\n", "\n").split("\n");

  // Search for the first line containing any query term
  const lowerTerms = queryTerms.map((t) => t.toLowerCase());
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lowerTerms.some((t) => lower.includes(t))) {
      const trimmed = line.trim();
      if (trimmed.length > 120) return trimmed.slice(0, 117) + "...";
      return trimmed;
    }
  }

  // Fallback: first non-empty, non-heading line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      if (trimmed.length > 120) return trimmed.slice(0, 117) + "...";
      return trimmed;
    }
  }

  return "";
}
