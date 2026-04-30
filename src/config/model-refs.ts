import type { ModelRoleMap, ModelsYaml, ProviderGroupMap, ProviderSource } from "../types.ts";
import { requireString, unique } from "./validation.ts";

export function applyProviderGroups(
  modelSources: ModelsYaml,
  providerSources: Record<string, ProviderSource>,
  providerGroups: ProviderGroupMap,
): ModelsYaml {
  for (const [groupId, providerId] of Object.entries(providerGroups)) {
    if (!providerSources[providerId]) throw new Error(`模型组 ${groupId} 指向未定义提供商：${providerId}`);
  }

  return Object.fromEntries(
    Object.entries(modelSources).map(([modelId, model]) => [
      modelId,
      model.provider_group ? { ...model, provider: requireProviderGroup(model.provider_group, providerGroups) } : model,
    ]),
  );
}

export function modelProviderGroups(modelSources: ModelsYaml): string[] {
  return unique(Object.values(modelSources).map((model) => model.provider_group ?? model.provider ?? "未分组"));
}

export function modelRef(modelId: string, modelSources: ModelsYaml, profileModels: ModelRoleMap = {}): string {
  const resolvedModelId = profileModels[modelId] ?? modelId;
  if (profileModels[resolvedModelId]) {
    throw new Error(`profile 模型别名不能递归引用：${modelId}`);
  }

  const provider = modelSources[resolvedModelId]?.provider;
  if (!provider) throw new Error(`模型缺少 provider 或未定义：${resolvedModelId}`);
  return `${provider}/${resolvedModelId}`;
}

export function modelFallbackRefs(model: string, modelSources: ModelsYaml): string[] {
  const modelId = model.split("/").at(-1) ?? model;
  const fallback = modelSources[modelId]?.fallback ?? [];
  return fallback.map((fallbackModel) => modelRef(fallbackModel, modelSources));
}

export function resolveProviderId(providerId: string, modelSources: ModelsYaml): string {
  const groupProvider = Object.values(modelSources).find((model) => model.provider_group === providerId)?.provider;
  return groupProvider ?? providerId;
}

function requireProviderGroup(groupId: string, providerGroups: ProviderGroupMap): string {
  return requireString(providerGroups[groupId], `provider_group.${groupId}`);
}
