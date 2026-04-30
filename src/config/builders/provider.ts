import type { ModelsYaml, OpenCodeModel, OpenCodeProvider, ProviderSource } from "../../types.ts";
import { requireString } from "../validation.ts";

export function buildProviders(
  providerSources: Record<string, ProviderSource>,
  modelSources: ModelsYaml,
): Record<string, OpenCodeProvider> {
  const output: Record<string, OpenCodeProvider> = {};
  for (const [providerId, provider] of Object.entries(providerSources)) {
    const providerName = provider.name ?? formatName(providerId);
    const models = buildProviderModels(providerId, provider.short_name ?? providerId, modelSources);
    if (Object.keys(models).length === 0) continue;

    const options: OpenCodeProvider["options"] = {
      baseURL: requireString(provider.base_url, `providers.${providerId}.base_url`),
      apiKey: formatApiKey(requireString(provider.api_key, `providers.${providerId}.api_key`)),
    };
    if (provider.timeout !== undefined) options.timeout = provider.timeout;
    if (provider.chunkTimeout !== undefined) options.chunkTimeout = provider.chunkTimeout;

    output[providerId] = {
      name: providerName,
      npm: provider.npm ?? "@ai-sdk/openai-compatible",
      options,
      models,
    };
  }
  return output;
}

function buildProviderModels(
  providerId: string,
  providerShortName: string,
  modelSources: ModelsYaml,
): Record<string, OpenCodeModel> {
  const output: Record<string, OpenCodeModel> = {};
  for (const [modelId, model] of Object.entries(modelSources)) {
    if (model.provider !== providerId) continue;
    output[modelId] = {
      ...(model.model_name && model.model_name !== modelId ? { id: model.model_name } : {}),
      name: `${formatName(modelId)} (${providerShortName})`,
      ...(model.parameters ? { options: model.parameters } : {}),
    };
  }
  return output;
}

function formatApiKey(value: string): string {
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(value);
  if (!match?.[1]) throw new Error(`api_key 必须使用 \${"{"}ENV_NAME} 格式：${value}`);
  return `{env:${match[1]}}`;
}

export function formatName(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join(" ");
}
