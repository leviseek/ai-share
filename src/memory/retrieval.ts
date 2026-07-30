import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export type SearchResult = { path: string; score: number; snippet: string };

export type MemoryScoreBreakdown = {
  title: number;
  path: number;
  content: number;
};

export type MemoryMatchedTokens = {
  title: string[];
  path: string[];
  content: string[];
};

export type MemoryDecision = {
  path: string;
  rank: number;
  selected: boolean;
  total_score: number;
  score_breakdown: MemoryScoreBreakdown;
  matched_tokens: MemoryMatchedTokens;
};

export type MemoryExclusionReason = "template" | "unconfirmed-distilled" | "malformed-distilled";

export type MemoryExclusion = {
  path: string;
  reason: MemoryExclusionReason;
};

export type MemorySearchDetails = {
  query_tokens: string[];
  ranked_candidates: MemoryDecision[];
  selected: MemoryDecision[];
  policy_exclusions: MemoryExclusion[];
};

type ScoredMemoryCandidate = MemoryDecision & { snippet: string };

type SearchCorpus = {
  files: string[];
  policyExclusions: MemoryExclusion[];
};

const SEARCH_DIRS = ["architecture", "stack", "policies", "distilled"] as const;
const STATIC_PATHS = new Set(["memory/policies/ai-execution-contract.md", "memory/policies/memory-lifecycle.md"]);
const MAX_RANKED_RESULTS = 5;
const MAX_SELECTED_RESULTS = 3;

export function searchMemory(query: string, projectRoot?: string): SearchResult[] {
  const root = projectRoot ?? resolve(import.meta.dirname, "..", "..");
  const queryTokens = uniqueTokens(query);
  if (queryTokens.length === 0) return [];
  return scoredCandidates(root, queryTokens).map((result) => ({
    path: result.path,
    score: result.total_score,
    snippet: result.snippet,
  }));
}

export function searchMemoryDetailed(query: string, projectRoot?: string): MemorySearchDetails {
  const root = projectRoot ?? resolve(import.meta.dirname, "..", "..");
  const queryTokens = uniqueTokens(query);
  if (queryTokens.length === 0) {
    return { query_tokens: [], ranked_candidates: [], selected: [], policy_exclusions: [] };
  }

  const corpus = collectSearchCorpus(root);
  const rankedCandidates = scoreCandidates(root, corpus.files, queryTokens).map(stripSnippet);
  return {
    query_tokens: queryTokens,
    ranked_candidates: rankedCandidates,
    selected: rankedCandidates.filter((candidate) => candidate.selected),
    policy_exclusions: corpus.policyExclusions,
  };
}

function scoredCandidates(root: string, queryTokens: readonly string[]): ScoredMemoryCandidate[] {
  return scoreCandidates(root, collectSearchCorpus(root).files, queryTokens);
}

function scoreCandidates(
  root: string,
  files: readonly string[],
  queryTokens: readonly string[],
): ScoredMemoryCandidate[] {
  return files
    .flatMap((filePath) => scoreFile(root, filePath, queryTokens))
    .filter((result) => result.total_score > 0)
    .sort((left, right) => right.total_score - left.total_score || compareText(left.path, right.path))
    .slice(0, MAX_RANKED_RESULTS)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      selected: index < MAX_SELECTED_RESULTS,
    }));
}

function collectSearchCorpus(root: string): SearchCorpus {
  const files: string[] = [];
  for (const directory of SEARCH_DIRS) {
    const base = resolve(root, "memory", directory);
    if (existsSync(base)) files.push(...walk(base));
  }

  const searchable: string[] = [];
  const policyExclusions: MemoryExclusion[] = [];
  for (const path of files.filter((entry) => /\.(?:md|ya?ml)$/i.test(entry)).sort()) {
    const rel = normalizePath(relative(root, path));
    if (STATIC_PATHS.has(rel)) continue;
    if (rel.endsWith("/TEMPLATE.md")) {
      policyExclusions.push({ path: rel, reason: "template" });
      continue;
    }
    if (rel.startsWith("memory/distilled/")) {
      const status = distilledStatus(path, readFileSync(path, "utf8"));
      if (status !== "confirmed") {
        policyExclusions.push({
          path: rel,
          reason: status === "unconfirmed" ? "unconfirmed-distilled" : "malformed-distilled",
        });
        continue;
      }
    }
    searchable.push(path);
  }
  return { files: searchable, policyExclusions };
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
  });
}

function scoreFile(root: string, filePath: string, queryTokens: readonly string[]): ScoredMemoryCandidate[] {
  const content = readFileSync(filePath, "utf8");
  const path = normalizePath(relative(root, filePath));
  const contentTokens = new Set(uniqueTokens(content));
  const pathTokens = new Set(uniqueTokens(path));
  const titleTokens = new Set(uniqueTokens(firstHeading(content)));
  const matchedTokens = {
    title: queryTokens.filter((token) => titleTokens.has(token)),
    path: queryTokens.filter((token) => pathTokens.has(token)),
    content: queryTokens.filter((token) => contentTokens.has(token)),
  };
  const scoreBreakdown = {
    title: matchedTokens.title.length * 3,
    path: matchedTokens.path.length * 2,
    content: matchedTokens.content.length,
  };
  const totalScore = scoreBreakdown.title + scoreBreakdown.path + scoreBreakdown.content;
  return totalScore > 0
    ? [
        {
          path,
          rank: 0,
          selected: false,
          total_score: totalScore,
          score_breakdown: scoreBreakdown,
          matched_tokens: matchedTokens,
          snippet: matchingSnippet(content, queryTokens),
        },
      ]
    : [];
}

function stripSnippet(candidate: ScoredMemoryCandidate): MemoryDecision {
  return {
    path: candidate.path,
    rank: candidate.rank,
    selected: candidate.selected,
    total_score: candidate.total_score,
    score_breakdown: candidate.score_breakdown,
    matched_tokens: candidate.matched_tokens,
  };
}

function uniqueTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const rawWord of text.toLowerCase().match(/[a-z0-9][a-z0-9._-]*/g) ?? []) {
    const word = rawWord.replace(/[._-]+$/, "");
    if (word.length >= 2) tokens.add(word);
    for (const part of word.split(/[._-]+/)) {
      if (part.length >= 2) tokens.add(part);
    }
  }
  for (const run of text.match(/[\u3400-\u4dbf\u4e00-\u9fff]+/g) ?? []) {
    for (const character of run) tokens.add(character);
    for (let index = 0; index < run.length - 1; index += 1) tokens.add(run.slice(index, index + 2));
  }
  return [...tokens];
}

function firstHeading(content: string): string {
  return /^#+\s+(.+)$/m.exec(content)?.[1] ?? "";
}

function matchingSnippet(content: string, queryTokens: readonly string[]): string {
  const line = content
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry && queryTokens.some((token) => entry.toLowerCase().includes(token)));
  if (!line) return "";
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function distilledStatus(path: string, content: string): "confirmed" | "unconfirmed" | "malformed" {
  const metadata = /\.md$/i.test(path)
    ? /^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/.exec(content.replaceAll("\r\n", "\n"))?.[1]
    : content;
  if (metadata === undefined) return "malformed";
  try {
    const value: unknown = Bun.YAML.parse(metadata);
    if (!isRecord(value)) return "malformed";
    return value.confirmed_by_user === true ? "confirmed" : "unconfirmed";
  } catch {
    return "malformed";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
