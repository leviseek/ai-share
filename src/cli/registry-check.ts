import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentsYaml, GlobalYaml } from "../types.ts";
import { requireRecord } from "../config-builders.ts";

export async function agentRegistryMismatches(pluginDir: string, agentsConfig: AgentsYaml): Promise<string[]> {
  const registry = JSON.parse(
    await readFile(resolve(pluginDir, "omo-agent-monitor", "agents-registry.json"), "utf8"),
  ) as Record<string, unknown>;
  const mainAgents = stringArrayField(registry, "main_agents");
  const subagents = stringArrayField(registry, "subagents");
  const categories = stringArrayField(registry, "categories");
  const expectedMainAgents = ["main", "build", "plan"];
  const agentNames = Object.keys(requireRecord(agentsConfig.agents, "agents"));
  const categoryNames = Object.keys(requireRecord(agentsConfig.categories, "categories"));

  return [
    ...missingValues("main_agents", expectedMainAgents, mainAgents),
    ...extraValues("main_agents", expectedMainAgents, mainAgents),
    ...missingValues("subagents", agentNames, subagents),
    ...extraValues("subagents", agentNames, subagents),
    ...missingValues("categories", categoryNames, categories),
    ...extraValues("categories", categoryNames, categories),
  ];
}

function stringArrayField(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`agents-registry.json 字段必须是字符串数组：${key}`);
  }
  return value;
}

function missingValues(label: string, expected: string[], actual: string[]): string[] {
  return expected.filter((value) => !actual.includes(value)).map((value) => `${label} 缺少 ${value}`);
}

function extraValues(label: string, expected: string[], actual: string[]): string[] {
  return actual.filter((value) => !expected.includes(value)).map((value) => `${label} 多出 ${value}`);
}

export type VersionCheckResult = {
  name: string;
  field: string;
  current: string;
  minimum: string;
  ok: boolean;
};

export function checkVersions(globalConfig: GlobalYaml, pluginDir: string): VersionCheckResult[] {
  const results: VersionCheckResult[] = [];

  const opencodeMin = globalConfig.opencode_min_version;
  if (opencodeMin) {
    const current = getInstalledVersion(pluginDir, "opencode") ?? "unknown";
    results.push({
      name: "OpenCode",
      field: "opencode_min_version",
      current,
      minimum: opencodeMin,
      ok: current !== "unknown" ? semverGte(current, opencodeMin) : true,
    });
  }

  const omoMin = globalConfig.omo_min_version;
  if (omoMin) {
    const current = getInstalledVersion(pluginDir, "oh-my-openagent") ?? "unknown";
    results.push({
      name: "oh-my-openagent",
      field: "omo_min_version",
      current,
      minimum: omoMin,
      ok: current !== "unknown" ? semverGte(current, omoMin) : true,
    });
  }

  return results;
}

function getInstalledVersion(pluginDir: string, packageName: string): string | null {
  try {
    const pkgPath = resolve(pluginDir, "..", "node_modules", packageName, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
      return pkg.version ?? null;
    }
  } catch {
    // not installed
  }
  return null;
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
