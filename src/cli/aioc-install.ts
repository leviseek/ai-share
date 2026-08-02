import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import { LAUNCHER_MANAGED_MARKER } from "./generation-plan.ts";

const AIOC_SOURCE = readFileSync(resolve(import.meta.dir, "..", "..", "bin", "aioc.ts"), "utf8");

export function buildAiocLauncherFiles(paths: GeneratorPaths): Record<string, string> {
  return {
    [paths.targetAiocScript]: AIOC_SOURCE,
    [paths.targetAiocUnix]: [
      "#!/bin/sh",
      `# ${LAUNCHER_MANAGED_MARKER}`,
      'exec bun "$(dirname "$0")/aioc.ts" "$@"',
      "",
    ].join("\n"),
    [paths.targetAiocCmd]: [
      `@REM ${LAUNCHER_MANAGED_MARKER}`,
      '@bun "%~dp0aioc.ts" %*',
      "@exit /b %ERRORLEVEL%",
      "",
    ].join("\r\n"),
    [paths.targetAiocPowerShell]: [
      `# ${LAUNCHER_MANAGED_MARKER}`,
      "& bun (Join-Path $PSScriptRoot 'aioc.ts') @args",
      "exit $LASTEXITCODE",
      "",
    ].join("\n"),
  };
}
