import { isRecord } from "./json.ts";

export function extractTokens(value: unknown): number {
  return scanTokenFields(value, new Set());
}

export function tokenTotal(tokens: unknown): number {
  if (!isRecord(tokens)) return 0;
  const total = numericTokenField(tokens, ["total", "totalTokens", "total_tokens"]);
  if (total !== undefined && total > 0) return total;
  const cache = isRecord(tokens.cache) ? tokens.cache : undefined;
  return sumNumbers([
    numericTokenField(tokens, ["input", "inputTokens", "input_tokens", "promptTokens", "prompt_tokens"]),
    numericTokenField(tokens, ["output", "outputTokens", "output_tokens", "completionTokens", "completion_tokens"]),
    numericTokenField(tokens, ["reasoning", "reasoningTokens", "reasoning_tokens"]),
    cache ? numericTokenField(cache, ["read", "cacheRead", "cache_read_tokens"]) : undefined,
    cache ? numericTokenField(cache, ["write", "cacheWrite", "cache_write_tokens"]) : undefined,
  ]);
}

function scanTokenFields(value: unknown, visited: Set<object>): number {
  if (typeof value !== "object" || value === null) return 0;
  if (visited.has(value)) return 0;
  visited.add(value);

  const structured = structuredTokenTotal(value);
  if (structured > 0) return structured;

  const directTotal = numericTokenField(value, ["totalTokens", "total_tokens", "tokens"]);
  if (directTotal !== undefined) return directTotal;

  const directPair =
    (numericTokenField(value, ["inputTokens", "promptTokens", "prompt_tokens"]) ?? 0) +
    (numericTokenField(value, ["outputTokens", "completionTokens", "completion_tokens"]) ?? 0);

  let sum = 0;
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === "number" && Number.isFinite(field) && /token/i.test(key)) {
      sum += Math.max(field, 0);
      continue;
    }
    if (typeof field === "object" && field !== null) {
      sum += scanTokenFields(field, visited);
    }
  }
  return Math.max(directPair, sum);
}

function structuredTokenTotal(value: unknown): number {
  const tokens =
    isRecord(value) && isRecord(value.tokens)
      ? value.tokens
      : isRecord(value) && isRecord(value.usage)
        ? value.usage
        : undefined;
  if (!tokens) return 0;
  const cache = isRecord(tokens.cache) ? tokens.cache : undefined;
  return sumNumbers([
    numericTokenField(tokens, ["input", "inputTokens", "promptTokens", "prompt_tokens"]),
    numericTokenField(tokens, ["output", "outputTokens", "completionTokens", "completion_tokens"]),
    numericTokenField(tokens, ["reasoning", "reasoningTokens", "reasoning_tokens"]),
    cache ? numericTokenField(cache, ["read", "cacheRead", "cache_read_tokens"]) : undefined,
    cache ? numericTokenField(cache, ["write", "cacheWrite", "cache_write_tokens"]) : undefined,
  ]);
}

function sumNumbers(values: (number | undefined)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function numericTokenField(value: Record<string, any>, keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(candidate, 0);
    }
  }
  return undefined;
}
