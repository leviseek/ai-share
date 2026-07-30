import { readFile } from "node:fs/promises";
import type { EnvYaml, GlobalYaml, ProviderSource } from "../types.ts";
import { codexEnvManagedBlockIsCurrent } from "../config-builders.ts";
import { missingProviderApiKeyEnvName } from "./api-keys.ts";
import { detectDefaultConfigDrift, type DefaultConfigDrift } from "./default-config-drift.ts";
import { checkCodexEnvLocalProxies, type LocalProxyRuntimeCheck } from "./env-runtime-check.ts";
import { pathExists } from "./fs.ts";
import type { GeneratorPaths } from "./paths.ts";
import { checkVersions, type VersionCheckResult } from "./registry-check.ts";

export type TimedDiagnostic<T> = {
  value: T;
  elapsed_ms: number;
};

export type ConfigDiagnostics = {
  missingApiKey: TimedDiagnostic<string | undefined>;
  defaultConfigDrift: TimedDiagnostic<DefaultConfigDrift>;
  envManagedBlockCurrent: TimedDiagnostic<boolean>;
  versionResults: TimedDiagnostic<VersionCheckResult[]>;
  localProxyChecks: TimedDiagnostic<LocalProxyRuntimeCheck[]>;
};

export async function collectConfigDiagnostics(input: {
  paths: GeneratorPaths;
  provider: ProviderSource;
  envConfig: EnvYaml;
  globalConfig: GlobalYaml;
  expectedCodexConfig: string;
  probeLocalProxy: boolean;
}): Promise<ConfigDiagnostics> {
  return {
    missingApiKey: timeSync(() => missingProviderApiKeyEnvName(input.provider)),
    defaultConfigDrift: await timeAsync(() =>
      detectDefaultConfigDrift(input.paths.targetCodexConfig, input.expectedCodexConfig),
    ),
    envManagedBlockCurrent: await timeAsync(async () =>
      codexEnvManagedBlockIsCurrent(input.envConfig, await readOptional(input.paths.targetCodexEnv)),
    ),
    versionResults: timeSync(() => checkVersions(input.globalConfig)),
    localProxyChecks: input.probeLocalProxy
      ? await timeAsync(() => checkCodexEnvLocalProxies(input.envConfig))
      : timeSync(() => []),
  };
}

async function readOptional(path: string): Promise<string | undefined> {
  return (await pathExists(path)) ? await readFile(path, "utf8") : undefined;
}

function timeSync<T>(fn: () => T): TimedDiagnostic<T> {
  const startedAt = performance.now();
  return {
    value: fn(),
    elapsed_ms: elapsedSince(startedAt),
  };
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<TimedDiagnostic<T>> {
  const startedAt = performance.now();
  return {
    value: await fn(),
    elapsed_ms: elapsedSince(startedAt),
  };
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
