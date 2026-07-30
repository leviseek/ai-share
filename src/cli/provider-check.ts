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
  canary: boolean;
  elapsed_ms: number;
  provider_groups: Record<string, string>;
  model_results: ProviderModelCheckResult[];
  canary_results: ProviderCanaryCheckResult[];
};

type FetchLike = (
  input: string,
  init: RequestInit & { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

export async function checkProviderModels(input: {
  providers: Record<string, ProviderSource>;
  models: ModelsYaml;
  env: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<ProviderModelCheckResult[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const providerModelNames = configuredModelNamesByProvider(input.models);

  return Promise.all(
    Object.entries(providerModelNames).map(([providerId, modelNames]) =>
      checkProviderModelNames(providerId, input.providers[providerId], modelNames, input.env, fetchImpl, timeoutMs),
    ),
  );
}

export async function checkProviderCanaries(input: {
  providers: Record<string, ProviderSource>;
  models: ModelsYaml;
  env: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<ProviderCanaryCheckResult[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 15_000;
  return Promise.all(
    configuredCanaryModelsByProvider(input.models).map((entry) =>
      checkProviderCanary(
        entry.providerId,
        input.providers[entry.providerId],
        entry.modelId,
        entry.model,
        input.env,
        fetchImpl,
        timeoutMs,
      ),
    ),
  );
}

function configuredModelNamesByProvider(models: ModelsYaml): Record<string, string[]> {
  const output: Record<string, Set<string>> = {};
  for (const model of Object.values(models)) {
    if (!model.provider || !model.model_name) continue;
    output[model.provider] ??= new Set();
    output[model.provider]?.add(model.model_name);
  }
  return Object.fromEntries(Object.entries(output).map(([providerId, names]) => [providerId, [...names].sort()]));
}

function configuredCanaryModelsByProvider(
  models: ModelsYaml,
): { providerId: string; modelId: string; model: ModelsYaml[string] }[] {
  const output = new Map<string, { providerId: string; modelId: string; model: ModelsYaml[string] }>();
  for (const [modelId, model] of Object.entries(models)) {
    if (!model.provider || !model.model_name) continue;
    const key = `${model.provider}:${canaryFingerprint(model)}`;
    if (!output.has(key)) output.set(key, { providerId: model.provider, modelId, model });
  }
  return [...output.values()].sort((left, right) =>
    `${left.providerId}:${left.modelId}`.localeCompare(`${right.providerId}:${right.modelId}`),
  );
}

async function checkProviderCanary(
  providerId: string,
  provider: ProviderSource | undefined,
  modelId: string,
  model: ModelsYaml[string],
  env: Record<string, string | undefined>,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<ProviderCanaryCheckResult> {
  const baseUrl = provider?.base_url ?? "";
  const modelName = model.model_name ?? modelId;
  const requestFingerprint = canaryRequestFingerprint(modelName, model);
  const apiKeyName = envReferenceName(provider?.api_key);
  const apiKey = apiKeyName ? env[apiKeyName] : undefined;

  if (!provider?.base_url || !apiKeyName || !apiKey) {
    return {
      provider: providerId,
      model_id: modelId,
      model_name: modelName,
      request_fingerprint: requestFingerprint,
      base_url: baseUrl,
      status: "missing-api-key",
      error: apiKeyName ? `缺少环境变量：${apiKeyName}` : "provider.api_key 必须是 ${ENV_NAME} 引用",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(completionsUrl(provider.base_url), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(canaryRequestBody(modelName, model)),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        provider: providerId,
        model_id: modelId,
        model_name: modelName,
        request_fingerprint: requestFingerprint,
        base_url: provider.base_url,
        status: "rejected",
        error: `HTTP ${response.status}: ${await safeResponseText(response)}`,
      };
    }

    const payload = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.choices)) {
      return {
        provider: providerId,
        model_id: modelId,
        model_name: modelName,
        request_fingerprint: requestFingerprint,
        base_url: provider.base_url,
        status: "unsupported-response",
      };
    }

    return {
      provider: providerId,
      model_id: modelId,
      model_name: modelName,
      request_fingerprint: requestFingerprint,
      base_url: provider.base_url,
      status: "ok",
    };
  } catch (error) {
    return {
      provider: providerId,
      model_id: modelId,
      model_name: modelName,
      request_fingerprint: requestFingerprint,
      base_url: provider.base_url,
      status: "unreachable",
      error: error instanceof Error ? error.message : String(error),
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
  const baseUrl = provider?.base_url ?? "";
  const apiKeyName = envReferenceName(provider?.api_key);
  const apiKey = apiKeyName ? env[apiKeyName] : undefined;

  if (!provider?.base_url || !apiKeyName || !apiKey) {
    return {
      provider: providerId,
      base_url: baseUrl,
      status: "missing-api-key",
      checked_model_names: modelNames,
      missing_model_names: modelNames,
      error: apiKeyName ? `缺少环境变量：${apiKeyName}` : "provider.api_key 必须是 ${ENV_NAME} 引用",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(modelsUrl(provider.base_url), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        provider: providerId,
        base_url: provider.base_url,
        status: "unreachable",
        checked_model_names: modelNames,
        missing_model_names: modelNames,
        error: `HTTP ${response.status}`,
      };
    }

    const ids = providerModelIds(await response.json());
    if (!ids) {
      return {
        provider: providerId,
        base_url: provider.base_url,
        status: "unsupported-response",
        checked_model_names: modelNames,
        missing_model_names: modelNames,
      };
    }

    const available = new Set(ids);
    const missing = modelNames.filter((modelName) => !available.has(modelName));
    return {
      provider: providerId,
      base_url: provider.base_url,
      status: missing.length > 0 ? "missing-models" : "ok",
      checked_model_names: modelNames,
      missing_model_names: missing,
    };
  } catch (error) {
    return {
      provider: providerId,
      base_url: provider.base_url,
      status: "unreachable",
      checked_model_names: modelNames,
      missing_model_names: modelNames,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function providerModelIds(payload: unknown): string[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return undefined;

  const ids = payload.data.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id.length === 0) return [];
    return [entry.id];
  });
  return ids.length > 0 ? ids : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

function completionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function canaryRequestBody(modelName: string, model: ModelsYaml[string]): Record<string, unknown> {
  return {
    model: modelName,
    messages: [{ role: "user", content: "Reply with ok." }],
    max_tokens: 1,
    ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
    ...canaryParameters(model.parameters ?? {}),
  };
}

function canaryFingerprint(model: ModelsYaml[string]): string {
  return JSON.stringify(canaryRequestBody(model.model_name ?? "", model));
}

function canaryRequestFingerprint(modelName: string, model: ModelsYaml[string]): string {
  return createHash("sha256")
    .update(JSON.stringify(canaryRequestBody(modelName, model)))
    .digest("hex");
}

function canaryParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (key === "reasoningEffort") {
      output.reasoning_effort = value;
    } else {
      output[key] = value;
    }
  }
  return output;
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "";
  }
}
