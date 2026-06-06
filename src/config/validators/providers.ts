import type { ProviderYaml } from "../../types.ts";
import type { ValidationError } from "./common.ts";
import { isEnvReference, isRecord, validateOptionalNumber, validateOptionalString } from "./common.ts";

export function validateProviderCatalog(
  errors: ValidationError[],
  providersConfig: ProviderYaml,
): Record<string, unknown> {
  const providers = providersConfig.providers;
  if (providers === undefined) return {};
  if (!isRecord(providers)) {
    errors.push({
      file: "provider.yaml",
      path: "providers",
      message: "providers 必须是对象",
    });
    return {};
  }

  for (const [providerId, provider] of Object.entries(providers)) {
    const pathPrefix = `providers.${providerId}`;
    if (!isRecord(provider)) {
      errors.push({
        file: "provider.yaml",
        path: pathPrefix,
        message: `provider '${providerId}' 必须是对象`,
      });
      continue;
    }

    validateRequiredProviderString(errors, providerId, provider, "base_url");
    const apiKey = validateRequiredProviderString(errors, providerId, provider, "api_key");
    if (apiKey && !isEnvReference(apiKey)) {
      errors.push({
        file: "provider.yaml",
        path: `${pathPrefix}.api_key`,
        message: `provider '${providerId}' 的 api_key 必须使用 \${ENV_NAME} 环境变量引用`,
      });
    }
    validateOptionalString(errors, "provider.yaml", `${pathPrefix}.name`, provider.name);
    validateOptionalString(errors, "provider.yaml", `${pathPrefix}.short_name`, provider.short_name);
    validateOptionalNumber(errors, "provider.yaml", `${pathPrefix}.timeout`, provider.timeout);
    validateOptionalNumber(errors, "provider.yaml", `${pathPrefix}.chunkTimeout`, provider.chunkTimeout);
  }

  return providers;
}

function validateRequiredProviderString(
  errors: ValidationError[],
  providerId: string,
  provider: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = provider[field];
  if (value === undefined || value === null) {
    errors.push({
      file: "provider.yaml",
      path: `providers.${providerId}.${field}`,
      message: `provider '${providerId}' 缺少 ${field} 字段`,
    });
    return undefined;
  }
  if (typeof value !== "string" || !value) {
    errors.push({
      file: "provider.yaml",
      path: `providers.${providerId}.${field}`,
      message: `provider '${providerId}' 的 ${field} 必须是非空字符串`,
    });
    return undefined;
  }
  return value;
}
