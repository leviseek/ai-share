import type { ProviderSource } from "../types.ts";
import { envReferenceName } from "../config/env-ref.ts";

export function missingProviderApiKeyEnvName(
  provider: ProviderSource,
  env: Record<string, string | undefined> = Bun.env,
): string | undefined {
  const envName = envReferenceName(provider.api_key);
  return envName && !env[envName] ? envName : undefined;
}

export function missingProviderApiKeyEnvNames(
  providers: readonly ProviderSource[],
  env: Record<string, string | undefined> = Bun.env,
): string[] {
  const missing: string[] = [];
  for (const provider of providers) {
    const envName = missingProviderApiKeyEnvName(provider, env);
    if (envName && !missing.includes(envName)) missing.push(envName);
  }
  return missing;
}
