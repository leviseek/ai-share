import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentsYaml } from "../types.ts";
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
