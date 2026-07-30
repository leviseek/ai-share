import { createHash } from "node:crypto";
import type { ModelsYaml, ProviderSource } from "../types.ts";
import { envReferenceName } from "../config/env-ref.ts";

export type ProviderModelCheckResult = {
  provider: string;
  base_url: string;
  status: "ok" | "missing-api-key" | "unreachable" | "unsupported-response" | "missing-models";
  checked_model_names: string[];
  missing_model_names: string[];
  error?: string;
};

export type ProviderCanaryCheckResult = {
  provider: string;
  model_id: string;
  model_name: string;
  request_fingerprint: string;
  base_url: string;
  status: "ok" | "missing-api-key" | "unreachable" | "rejected" | "unsupported-response";
  error?: string;
};

export type ProviderCheckReport = {
  status: "ok" | "error";
  provider: string;
  canary: boolean;
  elapsed_ms: number;
  model_results: ProviderModelCheckResult[];
  canary_results: ProviderCanaryCheckResult[];
};

type FetchLike = (
  input: string,
  init: RequestInit & { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

export async function checkProviderModels(input: {
  providerId: string;
  provider: ProviderSource | undefined;
  models: ModelsYaml;
  env: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<ProviderModelCheckResult[]> {
  return [
    await checkProviderModelNames(
      input.providerId,
      input.provider,
      configuredModelNames(input.models),
      input.env,
      input.fetchImpl ?? fetch,
      input.timeoutMs ?? 10_000,
    ),
  ];
}

export async function checkProviderCanaries(input: {
  providerId: string;
  provider: ProviderSource | undefined;
  models: ModelsYaml;
  env: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<ProviderCanaryCheckResult[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 15_000;
  return Promise.all(
    configuredCanaryModels(input.models).map((entry) =>
      checkProviderCanary(
        input.providerId,
        input.provider,
        entry.modelId,
        entry.modelName,
        input.env,
        fetchImpl,
        timeoutMs,
      ),
    ),
  );
}

function configuredModelNames(models: ModelsYaml): string[] {
  return [...new Set(Object.values(models).map((model) => model.model_name))].sort();
}

function configuredCanaryModels(models: ModelsYaml): { modelId: string; modelName: string }[] {
  const output = new Map<string, { modelId: string; modelName: string }>();
  for (const [modelId, model] of Object.entries(models)) {
    if (!output.has(model.model_name)) output.set(model.model_name, { modelId, modelName: model.model_name });
  }
  return [...output.values()].sort((left, right) => left.modelName.localeCompare(right.modelName));
}

async function checkProviderCanary(
  providerId: string,
  provider: ProviderSource | undefined,
  modelId: string,
  modelName: string,
  env: Record<string, string | undefined>,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<ProviderCanaryCheckResult> {
  const baseUrl = provider?.base_url ?? "";
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify(canaryRequestBody(modelName)))
    .digest("hex");
  const credentials = providerCredentials(provider, env);
  if (!credentials.ok) {
    return {
      provider: providerId,
      model_id: modelId,
      model_name: modelName,
      request_fingerprint: requestFingerprint,
      base_url: baseUrl,
      status: "missing-api-key",
      error: credentials.error,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint(credentials.baseUrl, "chat/completions"), {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(canaryRequestBody(modelName)),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        provider: providerId,
        model_id: modelId,
        model_name: modelName,
        request_fingerprint: requestFingerprint,
        base_url: credentials.baseUrl,
        status: "rejected",
        error: `HTTP ${response.status}`,
      };
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.choices)) {
      return {
        provider: providerId,
        model_id: modelId,
        model_name: modelName,
        request_fingerprint: requestFingerprint,
        base_url: credentials.baseUrl,
        status: "unsupported-response",
      };
    }
    return {
      provider: providerId,
      model_id: modelId,
      model_name: modelName,
      request_fingerprint: requestFingerprint,
      base_url: credentials.baseUrl,
      status: "ok",
    };
  } catch (error) {
    return {
      provider: providerId,
      model_id: modelId,
      model_name: modelName,
      request_fingerprint: requestFingerprint,
      base_url: credentials.baseUrl,
      status: "unreachable",
      error: formatError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkProviderModelNames(
  providerId: string,
  provider: ProviderSource | undefined,
  modelNames: string[],
  env: Record<string, string | undefined>,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<ProviderModelCheckResult> {
  const credentials = providerCredentials(provider, env);
  if (!credentials.ok) {
    return {
      provider: providerId,
      base_url: provider?.base_url ?? "",
      status: "missing-api-key",
      checked_model_names: modelNames,
      missing_model_names: modelNames,
      error: credentials.error,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint(credentials.baseUrl, "models"), {
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return failureModelResult(providerId, credentials.baseUrl, modelNames, "unreachable", `HTTP ${response.status}`);
    }
    const ids = providerModelIds(await response.json());
    if (!ids) return failureModelResult(providerId, credentials.baseUrl, modelNames, "unsupported-response");
    const available = new Set(ids);
    const missing = modelNames.filter((modelName) => !available.has(modelName));
    return {
      provider: providerId,
      base_url: credentials.baseUrl,
      status: missing.length > 0 ? "missing-models" : "ok",
      checked_model_names: modelNames,
      missing_model_names: missing,
    };
  } catch (error) {
    return failureModelResult(providerId, credentials.baseUrl, modelNames, "unreachable", formatError(error));
  } finally {
    clearTimeout(timer);
  }
}

function providerCredentials(
  provider: ProviderSource | undefined,
  env: Record<string, string | undefined>,
): { ok: true; baseUrl: string; apiKey: string } | { ok: false; error: string } {
  const apiKeyName = envReferenceName(provider?.api_key);
  if (!provider?.base_url || !apiKeyName) return { ok: false, error: "provider.api_key 必须是 ${ENV_NAME} 引用" };
  const apiKey = env[apiKeyName];
  return apiKey
    ? { ok: true, baseUrl: provider.base_url, apiKey }
    : { ok: false, error: `缺少环境变量：${apiKeyName}` };
}

function failureModelResult(
  provider: string,
  baseUrl: string,
  modelNames: string[],
  status: "unreachable" | "unsupported-response",
  error?: string,
): ProviderModelCheckResult {
  return {
    provider,
    base_url: baseUrl,
    status,
    checked_model_names: modelNames,
    missing_model_names: modelNames,
    ...(error ? { error } : {}),
  };
}

function providerModelIds(payload: unknown): string[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return undefined;
  const ids = payload.data.flatMap((entry) =>
    isRecord(entry) && typeof entry.id === "string" && entry.id ? [entry.id] : [],
  );
  return ids.length > 0 ? ids : undefined;
}

function canaryRequestBody(model: string): Record<string, unknown> {
  return { model, messages: [{ role: "user", content: "Reply with ok." }], max_tokens: 1 };
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
