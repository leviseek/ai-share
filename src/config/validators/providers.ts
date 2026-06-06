import type { ProviderYaml } from "../../types.ts";
import { isRecord, type ValidationError } from "./common.ts";

export function validateProviderCatalog(
  _errors: ValidationError[],
  providersConfig: ProviderYaml,
): Record<string, unknown> {
  const providers = providersConfig.providers;
  return isRecord(providers) ? providers : {};
}
