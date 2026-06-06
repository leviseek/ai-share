import type { ModelsYaml } from "../../types.ts";
import { DEFAULT_PROVIDER_GROUPS } from "../provider-groups.ts";
import type { ValidationError } from "./common.ts";
import { isFiniteNumber, isRecord, isStringArray } from "./common.ts";

export function validateModelCatalog(
  errors: ValidationError[],
  modelsConfig: ModelsYaml,
  modelIds: ReadonlySet<string>,
  providerInstances: Readonly<Record<string, unknown>>,
): void {
  const knownProviderGroups: Readonly<Record<string, string>> = DEFAULT_PROVIDER_GROUPS;
  for (const [modelId, model] of Object.entries(modelsConfig)) {
    validateModelCatalogEntry(errors, modelId, model, modelIds, knownProviderGroups, providerInstances);
  }
}

function validateModelCatalogEntry(
  errors: ValidationError[],
  modelId: string,
  model: unknown,
  modelIds: ReadonlySet<string>,
  knownProviderGroups: Readonly<Record<string, string>>,
  providerInstances: Readonly<Record<string, unknown>>,
): void {
  const pathPrefix = `models.${modelId}`;
  if (!isRecord(model)) {
    errors.push({
      file: "models.yaml",
      path: pathPrefix,
      message: `模型 '${modelId}' 必须是对象`,
    });
    return;
  }

  const providerGroup = validateRequiredString(errors, model, modelId, "provider_group");
  if (providerGroup) {
    const defaultProviderId = knownProviderGroups[providerGroup];
    if (!defaultProviderId) {
      errors.push({
        file: "models.yaml",
        path: `${pathPrefix}.provider_group`,
        message: `模型 '${modelId}' 使用了未知 provider_group '${providerGroup}'`,
      });
    } else if (!providerInstances[defaultProviderId]) {
      errors.push({
        file: "models.yaml",
        path: `${pathPrefix}.provider_group`,
        message: `模型 '${modelId}' 的 provider_group '${providerGroup}' 默认指向 provider '${defaultProviderId}'，但在 provider.yaml 中未定义`,
      });
    }
  }

  validateRequiredString(errors, model, modelId, "model_name");
  validateNumberObject(errors, model, modelId, "cost", ["input", "output"]);
  validateNumberObject(errors, model, modelId, "limits", ["context_window", "max_output"]);

  const capabilities = model.capabilities;
  if (capabilities !== undefined && !isStringArray(capabilities)) {
    errors.push({
      file: "models.yaml",
      path: `${pathPrefix}.capabilities`,
      message: `模型 '${modelId}' 的 capabilities 必须是字符串数组`,
    });
  }

  const temperature = model.temperature;
  if (temperature !== undefined && !isFiniteNumber(temperature)) {
    errors.push({
      file: "models.yaml",
      path: `${pathPrefix}.temperature`,
      message: `模型 '${modelId}' 的 temperature 必须是数字`,
    });
  }

  const fallback = model.fallback;
  if (fallback === undefined) return;
  if (!isStringArray(fallback)) {
    errors.push({
      file: "models.yaml",
      path: `${pathPrefix}.fallback`,
      message: `模型 '${modelId}' 的 fallback 必须是字符串数组`,
    });
    return;
  }
  for (const fallbackModelId of fallback) {
    if (!modelIds.has(fallbackModelId)) {
      errors.push({
        file: "models.yaml",
        path: `${pathPrefix}.fallback`,
        message: `模型 '${modelId}' 的 fallback 引用未定义模型 '${fallbackModelId}'`,
      });
    }
  }
}

function validateRequiredString(
  errors: ValidationError[],
  source: Readonly<Record<string, unknown>>,
  modelId: string,
  field: string,
): string | undefined {
  const value = source[field];
  if (value === undefined || value === null) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${field}`,
      message: `模型 '${modelId}' 缺少 ${field} 字段`,
    });
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${field}`,
      message: `模型 '${modelId}' 的 ${field} 必须是非空字符串`,
    });
    return undefined;
  }
  return value;
}

function validateNumberObject(
  errors: ValidationError[],
  source: Readonly<Record<string, unknown>>,
  modelId: string,
  field: string,
  children: readonly string[],
): void {
  const value = source[field];
  if (value === undefined || value === null) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${field}`,
      message: `模型 '${modelId}' 缺少 ${field} 字段`,
    });
    return;
  }
  if (!isRecord(value)) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${field}`,
      message: `模型 '${modelId}' 的 ${field} 必须是对象`,
    });
    return;
  }
  for (const child of children) {
    validateRequiredPositiveNumber(errors, value, modelId, `${field}.${child}`);
  }
}

function validateRequiredPositiveNumber(
  errors: ValidationError[],
  source: Readonly<Record<string, unknown>>,
  modelId: string,
  fieldPath: string,
): void {
  const field = fieldPath.slice(fieldPath.lastIndexOf(".") + 1);
  const value = source[field];
  if (value === undefined || value === null) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${fieldPath}`,
      message: `模型 '${modelId}' 缺少 ${fieldPath} 字段`,
    });
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push({
      file: "models.yaml",
      path: `models.${modelId}.${fieldPath}`,
      message: `模型 '${modelId}' 的 ${fieldPath} 必须是正数`,
    });
  }
}
