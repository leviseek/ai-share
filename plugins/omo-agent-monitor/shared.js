import registry from "./agents-registry.json" with { type: "json" };

export const mainAgentNameList = registry.main_agents;
export const omoAgentNameList = registry.subagents;
export const omoCategoryNameList = registry.categories;

export const mainAgentNames = new Set(mainAgentNameList);
export const omoAgentNames = new Set(omoAgentNameList);
export const omoCategoryNames = new Set(omoCategoryNameList);

export const defaultAgentNames = ["main", "build", "plan", ...omoAgentNameList, ...omoCategoryNameList];

export function classifyAgent(name) {
  if (mainAgentNames.has(name)) return "main";
  if (omoCategoryNames.has(name)) return "category";
  if (omoAgentNames.has(name)) return "subagent";
  return "tool";
}

export function defaultAgentKind(name) {
  if (mainAgentNames.has(name)) return "main";
  if (omoCategoryNames.has(name)) return "category";
  return "subagent";
}
