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
  overview: AiNodeSummaryOverview;
  details: AiNodeSummaryDetails;
  model: string;
  provider: string;
  cached: boolean;
  generatedAt: string;
  cacheKey: string;
  inputHash: string;
  fileContext?: AiNodeSummaryFileContext;
  diagnostics: string[];
};

export type AiNodeSummaryOverview = {
  intent: string;
  dependencyCount: number;
  dependentCount: number;
  date?: string;
  author?: string;
};

export type AiNodeSummaryDetails = {
  description: string;
  exposed: AiNodeSummaryExposedSymbol[];
};

export type AiNodeSummaryExposedSymbol = {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "module" | "unknown";
  typeInference: string;
  implemented: boolean;
  intent: string;
  inputs: string;
  outputs: string;
  usage: string;
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
  updatedAt?: string;
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

type AiNodeSummaryOverviewDraft = Omit<AiNodeSummaryOverview, "date" | "author"> & {
  date: string | undefined;
  author: string | undefined;
};

const PROMPT_VERSION = "rie-ai-node-summary-v3";
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
  if (cached?.overview !== undefined && cached.details !== undefined) return cached;

  const aiSummary = await requestAiNodeSummary(promptInput, modelConfig, input.fetchImpl ?? fetch);
  const content = parseAiNodeSummaryContent(aiSummary, promptInput);
  const result: AiNodeSummaryResult = {
    nodeId: input.nodeId,
    summary: normalizeAiSummaryText(content.summary),
    overview: content.overview,
    details: content.details,
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
          "请根据用户提供的节点、边、一跳邻居信息和可选文件片段，生成结构化简体中文节点 summary。",
          "必须只输出 JSON 对象，不要 Markdown，不要代码围栏。",
          "JSON 字段：summary:string；overview:{intent:string,dependencyCount:number,dependentCount:number,date?:string,author?:string}；details:{description:string,exposed:Array<{name:string,kind:string,typeInference:string,implemented:boolean,intent:string,inputs:string,outputs:string,usage:string}>}。",
          "overview 用于默认折叠态，必须简洁；dependencyCount 表示 outgoing 边数量，被依赖数 dependentCount 表示 incoming 边数量；date/author 只能来自输入节点或 metadata，未知则写 unknown。",
          "details.exposed 只列出暴露给外部使用的全局变量、导出函数、类、interface、type、模块入口等。",
          "变量：typeInference 必须写类型推断；inputs/outputs 写 unknown 即可，前端不会展示变量输入输出。",
          "函数/接口/类/type/模块：inputs 与 outputs 必须尽量包含类型推断；如果只有声明没有实现，implemented=false。",
          "未知字段写 unknown，不要编造。",
          "总内容控制在 2000 字以内；保留代码标识符、路径和 API 名称；不要输出密钥、token、cookie、password 或无法从输入推出的信息。",
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
  if (node.updatedAt !== undefined) promptNode.updatedAt = node.updatedAt;
  if (node.summary !== undefined) promptNode.summary = normalizeSummaryText(node.summary);
  return promptNode;
}

function parseAiNodeSummaryContent(
  value: string,
  promptInput: PromptInput,
): Pick<AiNodeSummaryResult, "summary" | "overview" | "details"> {
  const parsed = parseJsonObject(value);
  const fallbackSummary = normalizeAiSummaryText(value);
  const summary = readString(parsed?.summary) ?? fallbackSummary;
  const fallbackOverview = buildFallbackOverview(promptInput, summary);
  const overviewRecord = isRecord(parsed?.overview) ? parsed.overview : undefined;
  const detailsRecord = isRecord(parsed?.details) ? parsed.details : undefined;
  return {
    summary,
    overview: buildOverview({
      intent: readString(overviewRecord?.intent) ?? fallbackOverview.intent,
      dependencyCount: readNumber(overviewRecord?.dependencyCount) ?? fallbackOverview.dependencyCount,
      dependentCount: readNumber(overviewRecord?.dependentCount) ?? fallbackOverview.dependentCount,
      date: readOptionalKnownString(overviewRecord?.date) ?? fallbackOverview.date,
      author: readOptionalKnownString(overviewRecord?.author) ?? fallbackOverview.author,
    }),
    details: {
      description: readString(detailsRecord?.description) ?? summary,
      exposed: readExposedSymbols(detailsRecord?.exposed, promptInput),
    },
  };
}

function buildFallbackOverview(promptInput: PromptInput, summary: string): AiNodeSummaryOverview {
  const inferredIntent = firstSentence(summary);
  return buildOverview({
    intent:
      inferredIntent.length > 0
        ? inferredIntent
        : (promptInput.node.summary ?? `${promptInput.node.label} 的节点用途待进一步分析。`),
    dependencyCount: promptInput.outgoing.length,
    dependentCount: promptInput.incoming.length,
    date: promptInput.node.updatedAt,
    author: readAuthor(promptInput.node.metadata),
  });
}

function buildOverview(input: AiNodeSummaryOverviewDraft): AiNodeSummaryOverview {
  return {
    intent: input.intent,
    dependencyCount: input.dependencyCount,
    dependentCount: input.dependentCount,
    ...(input.date === undefined ? {} : { date: input.date }),
    ...(input.author === undefined ? {} : { author: input.author }),
  };
}

function readExposedSymbols(value: unknown, promptInput: PromptInput): AiNodeSummaryExposedSymbol[] {
  if (!Array.isArray(value)) return inferExposedSymbols(promptInput);
  const symbols = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = readString(item.name);
    if (name === undefined) return [];
    return [
      {
        name,
        kind: normalizeExposedKind(readString(item.kind)),
        typeInference: readString(item.typeInference) ?? "unknown",
        implemented: readBoolean(item.implemented) ?? true,
        intent: readString(item.intent) ?? "unknown",
        inputs: readString(item.inputs) ?? "unknown",
        outputs: readString(item.outputs) ?? "unknown",
        usage: readString(item.usage) ?? "unknown",
      },
    ];
  });
  return symbols.length === 0 ? inferExposedSymbols(promptInput) : symbols.slice(0, 24);
}

function inferExposedSymbols(promptInput: PromptInput): AiNodeSummaryExposedSymbol[] {
  const snippets = promptInput.fileContext?.snippets ?? [];
  const symbols: AiNodeSummaryExposedSymbol[] = [];
  for (const snippet of snippets) {
    const text = snippet.text;
    const tsMatch =
      /^\s*export\s+(?:async\s+)?function\s+([\w$]+)\s*\(([^)]*)\)/.exec(text) ??
      /^\s*export\s+(class|interface|type|const|let|var)\s+([\w$]+)(.*)$/.exec(text);
    if (tsMatch !== null) {
      const first = tsMatch[1] ?? "";
      const second = tsMatch[2] ?? "";
      const rest = tsMatch[3] ?? "";
      const isFunction = text.includes("function");
      symbols.push({
        name: isFunction ? first : second,
        kind: isFunction ? "function" : normalizeExposedKind(first),
        typeInference: isFunction ? inferFunctionType(text) : inferDeclarationType(first, rest),
        implemented: inferImplemented(text),
        intent: "由 export 暴露给外部模块使用。",
        inputs: isFunction ? inferFunctionInputs(second) : "unknown",
        outputs: isFunction ? inferFunctionOutput(text) : "unknown",
        usage: `从 ${promptInput.node.path ?? promptInput.node.label} import 后使用。`,
      });
      continue;
    }
    const luaMatch = /^\s*(?:function\s+([\w.:-]+)|([\w.:-]+)\s*=)/.exec(text);
    if (luaMatch !== null && !text.includes("local ")) {
      symbols.push({
        name: luaMatch[1] ?? luaMatch[2] ?? "unknown",
        kind: text.includes("function") ? "function" : "variable",
        typeInference: text.includes("function") ? "function" : "unknown",
        implemented: true,
        intent: "Lua 全局或模块表成员，可能被外部脚本调用。",
        inputs: "unknown",
        outputs: "unknown",
        usage: "通过 Lua require/module table 或全局命名空间使用。",
      });
    }
  }
  return uniqueExposedSymbols(symbols).slice(0, 24);
}

function uniqueExposedSymbols(symbols: AiNodeSummaryExposedSymbol[]): AiNodeSummaryExposedSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.kind}:${symbol.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeExposedKind(value: string | undefined): AiNodeSummaryExposedSymbol["kind"] {
  if (value === "function" || value === "class" || value === "interface" || value === "type") return value;
  if (value === "const" || value === "let" || value === "var" || value === "variable") return "variable";
  if (value === "module") return "module";
  return "unknown";
}

function inferFunctionType(text: string): string {
  const name = /^\s*export\s+(?:async\s+)?function\s+[\w$]+\s*(\([^)]*\)\s*(?::\s*[^({;]+)?)/.exec(text)?.[1];
  return name?.trim() ?? "function";
}

function inferFunctionInputs(params: string): string {
  const value = params.trim();
  return value.length === 0 ? "none" : value;
}

function inferFunctionOutput(text: string): string {
  return /\)\s*:\s*([^({;]+)/.exec(text)?.[1]?.trim() ?? "unknown";
}

function inferDeclarationType(kind: string, rest: string): string {
  if (kind === "interface" || kind === "type" || kind === "class") return kind;
  const explicit = /^\s*:\s*([^=;]+)/.exec(rest)?.[1]?.trim();
  if (explicit !== undefined && explicit.length > 0) return explicit;
  if (/=\s*["'`]/.test(rest)) return "string";
  if (/=\s*\d/.test(rest)) return "number";
  if (/=\s*(true|false)\b/.test(rest)) return "boolean";
  if (/=\s*\[/.test(rest)) return "array";
  if (/=\s*\{/.test(rest)) return "object";
  return "unknown";
}

function inferImplemented(text: string): boolean {
  if (/\bdeclare\b/.test(text)) return false;
  if (/^\s*export\s+interface\b/.test(text) || /^\s*export\s+type\b/.test(text)) return false;
  if (/;\s*$/.test(text) && !/[{=]/.test(text)) return false;
  return true;
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? normalizeAiSummaryText(value) : undefined;
}

function readOptionalKnownString(value: unknown): string | undefined {
  const text = readString(value);
  return text === undefined || text.toLowerCase() === "unknown" ? undefined : text;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function firstSentence(value: string): string {
  return /^[^。！？.!?]+[。！？.!?]?/.exec(value)?.[0]?.trim() ?? "";
}

function readAuthor(metadata: Record<string, unknown>): string | undefined {
  for (const key of ["author", "authors", "owner", "maintainer", "gitAuthor"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) return normalizeSummaryText(value);
    if (Array.isArray(value) && value.length > 0) return value.map(String).join(", ");
  }
  return undefined;
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
