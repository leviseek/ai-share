import type { ConfigSet } from "./validation.ts";

export type ProviderModelDecision = {
  providerId: string;
  modelId: string;
  modelSource: "global-config" | "provider-default";
};

export function resolveProviderModelDecision(config: ConfigSet, providerId: string): ProviderModelDecision {
  if (!Object.hasOwn(config.providers.providers, providerId)) {
    throw new Error(`提供商未定义：${providerId}`);
  }

  const provider = config.providers.providers[providerId];
  if (!provider) throw new Error(`提供商未定义：${providerId}`);

  const isGlobalProvider = providerId === config.global.provider;
  const modelId = isGlobalProvider ? config.global.model : provider.default_model;
  const modelSource = isGlobalProvider ? "global-config" : "provider-default";

  if (!Object.hasOwn(config.models, modelId)) {
    throw new Error(`模型未定义：${modelId}`);
  }
  if (!provider.models.includes(modelId)) {
    throw new Error(`模型未关联提供商：${providerId}/${modelId}`);
  }

  return { providerId, modelId, modelSource };
}
