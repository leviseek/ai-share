import type { ModelSource, ModelsYaml } from "../../types.ts";
import { DEFAULT_PROVIDER_GROUPS } from "../provider-groups.ts";
import { isRecord, isStringArray, type ValidationError } from "./common.ts";

export function validateModelCatalog(
  errors: ValidationError[],
  modelsConfig: ModelsYaml,
  modelIds: ReadonlySet<string>,
  providerInstances: Readonly<Record<string, unknown>>,
): void {
  const knownProviderGroups: Readonly<Record<string, string>> = DEFAULT_PROVIDER_GROUPS;
  for (const [modelId, model] of Object.entries(modelsConfig)) {
    if (!isRecord(model)) continue;
    validateProviderGroup(errors, modelId, model, knownProviderGroups, providerInstances);
    validateFallbackReferences(errors, modelId, model, modelIds);
  }
}

function validateProviderGroup(
  errors: ValidationError[],
  modelId: string,
  model: ModelSource,
  knownProviderGroups: Readonly<Record<string, string>>,
  providerInstances: Readonly<Record<string, unknown>>,
): void {
  const providerGroup = model.provider_group;
  if (typeof providerGroup !== "string" || !providerGroup) return;

  const defaultProviderId = knownProviderGroups[providerGroup];
  if (!defaultProviderId) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.provider_group`,
      message: `模型 '${modelId}' 使用了未知 provider_group '${providerGroup}'`,
    });
    return;
  }

  if (!providerInstances[defaultProviderId]) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.provider_group`,
      message: `模型 '${modelId}' 的 provider_group '${providerGroup}' 默认指向 provider '${defaultProviderId}'，但在 provider.yaml 中未定义`,
    });
  }
}

function validateFallbackReferences(
  errors: ValidationError[],
  modelId: string,
  model: ModelSource,
  modelIds: ReadonlySet<string>,
): void {
  if (!isStringArray(model.fallback)) return;
  for (const fallbackModelId of model.fallback) {
    if (!modelIds.has(fallbackModelId)) {
      errors.push({
        file: "models.yaml",
        path: `models.${modelId}.fallback`,
        message: `模型 '${modelId}' 的 fallback 引用未定义模型 '${fallbackModelId}'`,
      });
    }
  }
}
