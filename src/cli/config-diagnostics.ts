import { lstat, readFile } from "node:fs/promises";
import type { EnvYaml, GlobalYaml, ProviderSource } from "../types.ts";
import { openCodeEnvManagedBlockIsCurrent } from "../config-builders.ts";
import { missingProviderApiKeyEnvName } from "./api-keys.ts";
import { detectDefaultConfigDrift, type DefaultConfigDrift } from "./default-config-drift.ts";
import { checkOpenCodeEnvLocalProxies, type LocalProxyRuntimeCheck } from "./env-runtime-check.ts";
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
  launcherFilesCurrent: TimedDiagnostic<boolean>;
  versionResults: TimedDiagnostic<VersionCheckResult[]>;
  localProxyChecks: TimedDiagnostic<LocalProxyRuntimeCheck[]>;
};

export async function collectConfigDiagnostics(input: {
  paths: GeneratorPaths;
  provider: ProviderSource;
  envConfig: EnvYaml;
  globalConfig: GlobalYaml;
  expectedOpenCodeConfig: string;
  launcherFiles: Readonly<Record<string, string>>;
}): Promise<ConfigDiagnostics> {
  return {
    missingApiKey: timeSync(() => missingProviderApiKeyEnvName(input.provider)),
    defaultConfigDrift: await timeAsync(() =>
      detectDefaultConfigDrift(input.paths.targetOpenCodeConfig, input.expectedOpenCodeConfig),
    ),
    envManagedBlockCurrent: await timeAsync(async () =>
      openCodeEnvManagedBlockIsCurrent(input.envConfig, await readOptional(input.paths.targetOpenCodeEnv)),
    ),
    launcherFilesCurrent: await timeAsync(() =>
      launcherFilesAreCurrent(input.launcherFiles, input.paths.targetAiocUnix),
    ),
    versionResults: timeSync(() => checkVersions(input.globalConfig)),
    localProxyChecks: await timeAsync(() => checkOpenCodeEnvLocalProxies(input.envConfig)),
  };
}

export async function launcherFilesAreCurrent(
  files: Readonly<Record<string, string>>,
  executablePath?: string,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  for (const [path, expected] of Object.entries(files)) {
    if (!(await pathExists(path))) return false;
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    if ((await readFile(path, "utf8")) !== expected) return false;
    if (path === executablePath && platform !== "win32" && (stat.mode & 0o111) === 0) return false;
  }
  return true;
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
