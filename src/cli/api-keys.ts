import type { ProviderYaml } from "../types.ts";

export function missingProviderApiKeyEnvNames(providersConfig: ProviderYaml["providers"] = {}): string[] {
  return Object.values(providersConfig)
    .map((provider) => apiKeyEnvName(provider.api_key))
    .filter((envName): envName is string => Boolean(envName))
    .filter((envName) => !Bun.env[envName]);
}

function apiKeyEnvName(value: string | undefined): string | undefined {
  if (!value) throw new Error("缺少必要配置字段：providers.*.api_key");
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(value);
  if (!match?.[1]) throw new Error(`api_key 必须使用 \${"{"}ENV_NAME} 格式：${value}`);
  return match[1];
}
