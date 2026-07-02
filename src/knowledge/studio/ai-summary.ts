import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyProviderGroups } from "../../config-builders.ts";
import { loadConfigYamlSync } from "../../config/local-overlay.ts";
import { parseCliOptions } from "../../cli/options.ts";
import type { GlobalYaml, ModelsYaml, ModelSource, ProviderSource, ProviderYaml } from "../../types.ts";
import { canonicalJsonHash, contentHash, normalizePath } from "../core/ids.ts";
import type { GraphEdge, GraphNode } from "../core/types.ts";
import { normalizeSummaryText, redactSecretLikeText } from "../summary/index.ts";
import type { StudioSnapshot } from "./data.ts";

export type AiNodeSummaryResult = {
  nodeId: string;
  summary: string;
  model: string;
  provider: string;
  cached: boolean;
  generatedAt: string;
  cacheKey: string;
  inputHash: string;
  fileContext?: AiNodeSummaryFileContext;
  diagnostics: string[];
};

export type AiNodeSummaryFileSnippet = {
  lineStart: number;
  lineEnd: number;
  text: string;
};

export type AiNodeSummaryFileContext = {
  path: string;
  snippets: AiNodeSummaryFileSnippet[];
  diagnostics: string[];
  language?: string;
  sizeBytes?: number;
  hash?: string;
};

export type AiNodeSummaryModelConfig = {
  modelId: string;
  model: ModelSource;
  providerId: string;
  provider: ProviderSource;
  apiKey: string;
};

export type AiNodeSummaryCache = {
  read(cacheKey: string): Promise<AiNodeSummaryResult | undefined>;
  write(cacheKey: string, result: AiNodeSummaryResult): Promise<void>;
};

export type AiNodeSummaryInput = {
  snapshot: StudioSnapshot;
  nodeId: string;
  cache: AiNodeSummaryCache;
  repoRoot?: string;
  modelConfig?: AiNodeSummaryModelConfig;
  fetchImpl?: FetchLike;
  now?: string;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type PromptNode = {
  id: string;
  type: string;
  label: string;
  path?: string;
  language?: string;
  tags: string[];
  summary?: string;
  metadata: Record<string, unknown>;
};

type PromptEdge = {
  id: string;
  from: string;
  to: string;
  type: string;
};

type PromptInput = {
  node: PromptNode;
  incoming: PromptEdge[];
  outgoing: PromptEdge[];
  neighbors: PromptNode[];
  fileContext?: AiNodeSummaryFileContext;
};

const PROMPT_VERSION = "rie-ai-node-summary-v1";
const AI_SUMMARY_MAX_LENGTH = 2000;
const DEFAULT_MAX_TOKENS = 2600;
const MAX_FILE_CONTEXT_BYTES = 200_000;
const MAX_SNIPPET_LINES = 200;
const projectRoot = resolve(import.meta.dirname, "..", "..", "..");
const fileContextNodeTypes = new Set(["CodeFile", "Config", "Document", "Script", "Test", "File"]);

export class JsonFileAiNodeSummaryCache implements AiNodeSummaryCache {
  readonly root: string;

  constructor(repoRoot: string) {
    this.root = resolve(repoRoot, ".rie", "studio", "ai-summaries");
  }

  async read(cacheKey: string): Promise<AiNodeSummaryResult | undefined> {
    assertSafeCacheKey(cacheKey);
    try {
      const raw = await readFile(resolve(this.root, `${cacheKey}.json`), "utf-8");
      return { ...(JSON.parse(raw) as AiNodeSummaryResult), cached: true };
    } catch {
      return undefined;
    }
  }

  async write(cacheKey: string, result: AiNodeSummaryResult): Promise<void> {
    assertSafeCacheKey(cacheKey);
    await mkdir(this.root, { recursive: true });
    await writeFile(
      resolve(this.root, `${cacheKey}.json`),
      `${JSON.stringify({ ...result, cached: false }, null, 2)}\n`,
    );
  }
}

export function createAiNodeSummaryCache(repoRoot: string): AiNodeSummaryCache {
  return new JsonFileAiNodeSummaryCache(repoRoot);
}

export async function generateAiNodeSummary(input: AiNodeSummaryInput): Promise<AiNodeSummaryResult> {
  const modelConfig = input.modelConfig ?? resolveAiNodeSummaryModelConfig();
  const promptInput = await buildPromptInput(input.snapshot, input.nodeId, input.repoRoot);
  const inputHash = canonicalJsonHash(promptInput);
  const cacheKey = canonicalJsonHash({
    kind: "ai-node-summary",
    promptVersion: PROMPT_VERSION,
    inputHash,
    modelId: modelConfig.modelId,
    providerId: modelConfig.providerId,
  });
  const cached = await input.cache.read(cacheKey);
  if (cached !== undefined) return cached;

  const summary = await requestAiNodeSummary(promptInput, modelConfig, input.fetchImpl ?? fetch);
  const result: AiNodeSummaryResult = {
    nodeId: input.nodeId,
    summary: normalizeAiSummaryText(summary),
    model: modelConfig.modelId,
    provider: modelConfig.providerId,
    cached: false,
    generatedAt: input.now ?? new Date().toISOString(),
    cacheKey,
    inputHash,
    ...(promptInput.fileContext === undefined ? {} : { fileContext: promptInput.fileContext }),
    diagnostics: [],
  };
  await input.cache.write(cacheKey, result);
  return result;
}

export function resolveAiNodeSummaryModelConfig(
  env: Record<string, string | undefined> = Bun.env,
  argv: readonly string[] = Bun.argv,
): AiNodeSummaryModelConfig {
  const configDir = resolve(projectRoot, "config");
  const providersConfig = loadConfigYamlSync(configDir, "provider.yaml") as ProviderYaml;
  const modelsConfig = loadConfigYamlSync(configDir, "models.yaml") as ModelsYaml;
  const globalConfig = loadConfigYamlSync(configDir, "global.yaml") as GlobalYaml;
  const providerGroups = parseCliOptions(argv, env).providerGroups;
  const models = applyProviderGroups(modelsConfig, providersConfig.providers ?? {}, providerGroups);
  const modelId = requireNonEmptyString(globalConfig.model, "global.model");
  const model = models[modelId];
  if (model === undefined) throw new Error(`AI summary 模型未定义：${modelId}`);
  const providerId = requireNonEmptyString(model.provider, `models.${modelId}.provider`);
  const provider = providersConfig.providers?.[providerId];
  if (provider === undefined) throw new Error(`AI summary provider 未定义：${providerId}`);
  const apiKeyName = envKeyName(provider.api_key);
  if (apiKeyName === undefined) throw new Error(`provider.${providerId}.api_key 必须是 \${ENV_NAME} 引用`);
  const apiKey = env[apiKeyName];
  if (apiKey === undefined || apiKey.length === 0) throw new Error(`缺少环境变量：${apiKeyName}`);
  return { modelId, model, providerId, provider, apiKey };
}

export async function buildPromptInput(
  snapshot: StudioSnapshot,
  nodeId: string,
  repoRoot?: string,
): Promise<PromptInput> {
  const node = snapshot.nodes.find((item) => item.id === nodeId);
  if (node === undefined) throw new Error(`未找到节点：${nodeId}`);
  const incoming = snapshot.edges.filter((edge) => edge.to === nodeId);
  const outgoing = snapshot.edges.filter((edge) => edge.from === nodeId);
  const neighborIds = new Set([...incoming.map((edge) => edge.from), ...outgoing.map((edge) => edge.to)]);
  const neighbors = [...neighborIds]
    .flatMap((id) => {
      const neighbor = snapshot.nodes.find((item) => item.id === id);
      return neighbor === undefined ? [] : [toPromptNode(neighbor)];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const promptInput: PromptInput = {
    node: toPromptNode(node),
    incoming: sanitizeEdges(incoming),
    outgoing: sanitizeEdges(outgoing),
    neighbors,
  };
  const fileContext = repoRoot === undefined ? undefined : await buildFileContext(repoRoot, node);
  if (fileContext !== undefined) promptInput.fileContext = fileContext;
  return promptInput;
}

async function requestAiNodeSummary(
  promptInput: PromptInput,
  modelConfig: AiNodeSummaryModelConfig,
  fetchImpl: FetchLike,
): Promise<string> {
  const response = await fetchImpl(chatCompletionsUrl(modelConfig.provider.base_url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modelConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(chatRequestBody(promptInput, modelConfig.model)),
    signal: AbortSignal.timeout(providerTimeoutMs(modelConfig.provider)),
  });
  if (!response.ok) throw new Error(`AI summary 请求失败：HTTP ${response.status}`);
  const payload = (await response.json()) as unknown;
  const content = readCompletionContent(payload);
  if (content.length === 0) throw new Error("AI summary 响应为空。");
  return content;
}

function chatRequestBody(promptInput: PromptInput, model: ModelSource): Record<string, unknown> {
  return {
    ...modelParameters(model.parameters ?? {}),
    model: requireNonEmptyString(model.model_name, "model.model_name"),
    messages: [
      {
        role: "system",
        content: [
          "你是 Repository Intelligence Engine 的节点解释器。",
          "请根据用户提供的节点、边、一跳邻居信息和可选文件片段，生成简体中文节点 summary。",
          "要求：2000 字以内；内容可以包含节点用途、关键依赖、重要符号、文件片段依据和维护建议；保留代码标识符、路径和 API 名称；不要输出密钥、token、cookie、password 或无法从输入推出的信息。",
          "只输出 summary 正文，不要 Markdown 标题。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(promptInput, null, 2),
      },
    ],
    max_tokens: DEFAULT_MAX_TOKENS,
    ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
  };
}

function toPromptNode(node: GraphNode): PromptNode {
  const promptNode: PromptNode = {
    id: node.id,
    type: node.type,
    label: node.label,
    tags: node.tags,
    metadata: safeMetadata(node.metadata),
  };
  if (node.path !== undefined) promptNode.path = node.path;
  if (node.language !== undefined) promptNode.language = node.language;
  if (node.summary !== undefined) promptNode.summary = normalizeSummaryText(node.summary);
  return promptNode;
}

function normalizeAiSummaryText(value: string): string {
  const redacted = redactSecretLikeText(value).replace(/\s+/g, " ").trim();
  if (redacted.length <= AI_SUMMARY_MAX_LENGTH) return redacted;
  return `${redacted.slice(0, AI_SUMMARY_MAX_LENGTH - 1).trimEnd()}…`;
}

function sanitizeEdges(edges: GraphEdge[]): PromptEdge[] {
  return edges
    .map((edge) => ({ id: edge.id, from: edge.from, to: edge.to, type: edge.type }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function buildFileContext(repoRoot: string, node: GraphNode): Promise<AiNodeSummaryFileContext | undefined> {
  if (!fileContextNodeTypes.has(node.type) || node.path === undefined) return undefined;
  const contextBase: AiNodeSummaryFileContext = {
    path: node.path,
    snippets: [],
    diagnostics: [],
  };
  const root = resolve(repoRoot);
  const filePath = resolve(root, node.path);
  if (!isWithin(root, filePath)) return { ...contextBase, diagnostics: ["file context skipped: path outside repo"] };
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return { ...contextBase, diagnostics: ["file context skipped: file not found"] };
  }
  if (!fileStat.isFile()) return { ...contextBase, diagnostics: ["file context skipped: not a file"] };
  if (fileStat.size > MAX_FILE_CONTEXT_BYTES) {
    return {
      ...contextBase,
      sizeBytes: fileStat.size,
      diagnostics: [`file context skipped: oversized ${fileStat.size} bytes`],
    };
  }
  const content = await readFile(filePath);
  if (isProbablyBinary(content)) {
    return { ...contextBase, sizeBytes: fileStat.size, diagnostics: ["file context skipped: binary file"] };
  }
  return {
    ...contextBase,
    ...(node.language === undefined ? {} : { language: node.language }),
    sizeBytes: fileStat.size,
    hash: contentHash(content),
    snippets: selectFileSnippets(node, new TextDecoder().decode(content)),
  };
}

function selectFileSnippets(node: GraphNode, content: string): AiNodeSummaryFileSnippet[] {
  const lines = content.split(/\r?\n/);
  const selected = new Set<number>();
  if (node.type === "Config") {
    addLineRange(selected, 0, Math.min(lines.length, MAX_SNIPPET_LINES));
  } else if (node.type === "Document" || node.type === "File") {
    addLineRange(selected, 0, Math.min(lines.length, 120));
    addMatchingLines(selected, lines, /^\s{0,3}(#{1,6}\s|[-*]\s|\d+\.\s)/);
  } else {
    addLineRange(selected, 0, Math.min(lines.length, 80));
    addMatchingLines(
      selected,
      lines,
      /^\s*(import|export)\b|^\s*(local\s+)?function\s+[\w.:]+|^\s*(local\s+)?\w+\s*=\s*require\b|^\s*require\s*(?:\(|["'])|^\s*return\s+\{|^\s*(export\s+)?(async\s+)?function\s+\w|^\s*(export\s+)?(class|interface|type|const|let|var)\s+\w/,
    );
  }
  return [...selected]
    .sort((left, right) => left - right)
    .slice(0, MAX_SNIPPET_LINES)
    .map((index) => ({
      lineStart: index + 1,
      lineEnd: index + 1,
      text: safeFileLine(lines[index] ?? ""),
    }))
    .filter((snippet) => snippet.text.length > 0);
}

function addLineRange(selected: Set<number>, start: number, end: number): void {
  for (let index = start; index < end; index++) selected.add(index);
}

function addMatchingLines(selected: Set<number>, lines: string[], pattern: RegExp): void {
  for (let index = 0; index < lines.length; index++) {
    if (pattern.test(lines[index] ?? "")) selected.add(index);
  }
}

function safeFileLine(line: string): string {
  const redacted = redactSecretLikeText(line).replace(/\s+/g, " ").trim();
  if (redacted.length <= 300) return redacted;
  return `${redacted.slice(0, 299).trimEnd()}…`;
}

function safeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isSecretLikeKey(key)) continue;
    const safeValue = safeMetadataValue(value);
    if (safeValue !== undefined) output[key] = safeValue;
  }
  return output;
}

function safeMetadataValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return normalizeSummaryText(redactSecretLikeText(value));
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value))
    return value.slice(0, 10).flatMap((item) => {
      const safeValue = safeMetadataValue(item);
      return safeValue === undefined ? [] : [safeValue];
    });
  if (typeof value === "object") return safeMetadata(value as Record<string, unknown>);
  return undefined;
}

function isSecretLikeKey(key: string): boolean {
  return /(api[_-]?key|token|cookie|password|secret)/i.test(key);
}

function isWithin(root: string, target: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  return (
    normalizedTarget === normalizedRoot ||
    normalizePath(normalizedTarget).startsWith(`${normalizePath(normalizedRoot)}/`) ||
    normalizedTarget.startsWith(`${normalizedRoot}\\`)
  );
}

function isProbablyBinary(content: Uint8Array): boolean {
  if (content.length === 0) return false;
  const sample = content.subarray(0, Math.min(content.length, 8000));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious++;
  }
  return suspicious / sample.length > 0.3;
}

function readCompletionContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return "";
  const choices: unknown[] = payload.choices;
  const choice = choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return "";
  const content = choice.message.content;
  return typeof content === "string" ? content.trim() : "";
}

function modelParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    output[key === "reasoningEffort" ? "reasoning_effort" : key] = value;
  }
  return output;
}

function providerTimeoutMs(provider: ProviderSource): number {
  if (typeof provider.timeout !== "number" || !Number.isFinite(provider.timeout) || provider.timeout <= 0)
    return 30_000;
  return Math.trunc(provider.timeout);
}

function chatCompletionsUrl(baseUrl: string | undefined): string {
  const value = requireNonEmptyString(baseUrl, "provider.base_url");
  return `${value.replace(/\/+$/, "")}/chat/completions`;
}

function envKeyName(value: string | undefined): string | undefined {
  return /^\$\{([A-Z_][A-Z0-9_]*)\}$/.exec(value ?? "")?.[1];
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`缺少必要配置字段：${name}`);
  return value.trim();
}

function assertSafeCacheKey(cacheKey: string): void {
  if (!/^[a-f0-9]{64}$/.test(cacheKey)) throw new Error("非法 AI summary cache key。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
