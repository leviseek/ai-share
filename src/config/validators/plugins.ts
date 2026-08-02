import { containsKnownSecretToken } from "../../security/secret-patterns.ts";
import { pluginSpecPattern } from "../schema-spec.ts";
import type { ValidationError } from "./common.ts";
import { isRecord } from "./common.ts";

const PACKAGE_ID_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/;
const PLUGIN_SPEC_REGEX = new RegExp(pluginSpecPattern());

export type ParsedPluginSpec = {
  packageId: string;
};

export function parsePluginSpec(value: string): ParsedPluginSpec | undefined {
  if (!PLUGIN_SPEC_REGEX.test(value) || containsKnownSecretToken(value)) return undefined;

  const separatorIndex = pluginSpecSeparatorIndex(value);
  const packageId = separatorIndex === -1 ? value : value.slice(0, separatorIndex);
  if (!PACKAGE_ID_PATTERN.test(packageId)) return undefined;
  if (separatorIndex === -1) return { packageId };

  const source = value.slice(separatorIndex + 1);
  if (!source) return undefined;
  if (source.startsWith("git+")) return isSafeGitHttpsSource(source) ? { packageId } : undefined;
  return { packageId };
}

export function validatePlugins(errors: ValidationError[], pluginsConfig: unknown): void {
  if (!isRecord(pluginsConfig) || !Array.isArray(pluginsConfig.plugins)) return;

  pluginsConfig.plugins.forEach((value, index) => {
    if (typeof value !== "string" || value.length === 0 || parsePluginSpec(value)) return;
    errors.push({
      file: "plugins.yaml",
      path: `plugins[${index}]`,
      message: `plugins[${index}] 必须是安全的 npm package spec 或 package-name@git+https://... spec`,
    });
  });
}

function pluginSpecSeparatorIndex(value: string): number {
  if (!value.startsWith("@")) return value.indexOf("@");
  const scopeSeparatorIndex = value.indexOf("/");
  return scopeSeparatorIndex === -1 ? -1 : value.indexOf("@", scopeSeparatorIndex + 1);
}

function isSafeGitHttpsSource(source: string): boolean {
  if (!source.startsWith("git+https://")) return false;
  try {
    const url = new URL(source.slice("git+".length));
    return (
      url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash
    );
  } catch {
    return false;
  }
}
