import { spawnSync } from "node:child_process";
import type { GlobalYaml } from "../types.ts";

export type VersionCheckResult = {
  name: string;
  field: string;
  current: string;
  minimum: string;
  ok: boolean;
};

export function checkVersions(globalConfig: GlobalYaml): VersionCheckResult[] {
  const results: VersionCheckResult[] = [];

  const codexMin = globalConfig.codex_min_version;
  if (codexMin) {
    const current = getCommandVersion("codex") ?? "unknown";
    results.push({
      name: "Codex CLI",
      field: "codex_min_version",
      current,
      minimum: codexMin,
      ok: versionCheckOk(current, codexMin),
    });
  }

  return results;
}

function getCommandVersion(command: string, args: string[] = ["--version"]): string | null {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) return null;

  const output = `${result.stdout}\n${result.stderr}`;
  return /(?:^|[^0-9])(\d+\.\d+\.\d+)\b/.exec(output)?.[1] ?? null;
}

export function versionCheckOk(current: string, minimum: string): boolean {
  if (current === "unknown") return false;
  return semverGte(current, minimum);
}

function semverGte(current: string, minimum: string): boolean {
  const cur = current.split(".").map(Number);
  const min = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const c = cur[i] ?? 0;
    const m = min[i] ?? 0;
    if (c > m) return true;
    if (c < m) return false;
  }
  return true;
}
