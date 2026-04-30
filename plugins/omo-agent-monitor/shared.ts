import registry from "./agents-registry.json" with { type: "json" };

export type AgentKind = "main" | "subagent" | "category" | "tool";

export const mainAgentNameList: string[] = registry.main_agents;
export const omoAgentNameList: string[] = registry.subagents;
export const omoCategoryNameList: string[] = registry.categories;

export const mainAgentNames: Set<string> = new Set(mainAgentNameList);
export const omoAgentNames: Set<string> = new Set(omoAgentNameList);
export const omoCategoryNames: Set<string> = new Set(omoCategoryNameList);

export const defaultAgentNames: string[] = ["main", "build", "plan", ...omoAgentNameList, ...omoCategoryNameList];

export function classifyAgent(name: string): AgentKind {
  if (mainAgentNames.has(name)) return "main";
  if (omoCategoryNames.has(name)) return "category";
  if (omoAgentNames.has(name)) return "subagent";
  return "tool";
}

export function defaultAgentKind(name: string): Exclude<AgentKind, "tool"> {
  if (mainAgentNames.has(name)) return "main";
  if (omoCategoryNames.has(name)) return "category";
  return "subagent";
}
