#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelsYaml, ProviderSource, ProviderYaml } from "../types.ts";
import { applyProviderGroups } from "../config-builders.ts";
import { parseCliOptions } from "./options.ts";
import { parseYamlObject } from "../yaml.ts";

export type ProviderModelCheckResult = {
  provider: string;
  base_url: string;
  status: "ok" | "missing-api-key" | "unreachable" | "unsupported-response" | "missing-models";
  checked_model_names: string[];
  missing_model_names: string[];
  error?: string;
};

type FetchLike = (input: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

const projectRoot = resolve(import.meta.dirname, "..", "..");

if (import.meta.main) {
  const providerConfig = loadYaml("provider.yaml") as ProviderYaml;
  const modelConfig = loadYaml("models.yaml") as ModelsYaml;
  const providerGroups = parseCliOptions().providerGroups;
  const models = applyProviderGroups(modelConfig, providerConfig.providers ?? {}, providerGroups);
  const results = await checkProviderModels({
    providers: providerConfig.providers ?? {},
    models,
    env: Bun.env,
  });
  printProviderModelResults(results);
  process.exit(results.every((result) => result.status === "ok") ? 0 : 1);
}

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

function configuredModelNamesByProvider(models: ModelsYaml): Record<string, string[]> {
  const output: Record<string, Set<string>> = {};
  for (const model of Object.values(models)) {
    if (!model.provider || !model.model_name) continue;
    output[model.provider] ??= new Set();
    output[model.provider]?.add(model.model_name);
  }
  return Object.fromEntries(Object.entries(output).map(([providerId, names]) => [providerId, [...names].sort()]));
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
  const apiKeyName = envKeyName(provider?.api_key);
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

function envKeyName(value: string | undefined): string | undefined {
  return /^\$\{([A-Z_][A-Z0-9_]*)\}$/.exec(value ?? "")?.[1];
}

function loadYaml(fileName: string): object {
  return parseYamlObject(readFileSync(resolve(projectRoot, "config", fileName), "utf8"));
}

function printProviderModelResults(results: readonly ProviderModelCheckResult[]): void {
  for (const result of results) {
    if (result.status === "ok") {
      console.log(`✓ ${result.provider}: ${result.checked_model_names.length} models available`);
      continue;
    }

    const missing = result.missing_model_names.length > 0 ? ` missing=${result.missing_model_names.join(",")}` : "";
    const error = result.error ? ` ${result.error}` : "";
    console.log(`✗ ${result.provider}: ${result.status}${missing}${error}`);
  }
}
