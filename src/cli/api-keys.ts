import type { ProviderYaml } from "../types.ts";
import { envReferenceName } from "../config/env-ref.ts";

export function missingProviderApiKeyEnvNames(providersConfig: ProviderYaml["providers"] = {}): string[] {
  return Object.values(providersConfig)
    .map((provider) => apiKeyEnvName(provider.api_key))
    .filter((envName): envName is string => Boolean(envName))
    .filter((envName) => !Bun.env[envName]);
}

function apiKeyEnvName(value: string | undefined): string | undefined {
  return envReferenceName(value);
}
