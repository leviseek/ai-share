import type { AgentsYaml } from "../../types.ts";
import type { ValidationError } from "./common.ts";
import { isRecord } from "./common.ts";

export function validateAgents(errors: ValidationError[], agentsConfig: AgentsYaml): void {
  const agentIds = new Set(Object.keys(isRecord(agentsConfig.agents) ? agentsConfig.agents : {}));
  const agentReasoning = agentsConfig.omx?.agent_reasoning;
  if (!isRecord(agentReasoning)) return;

  for (const agentId of Object.keys(agentReasoning)) {
    if (!agentIds.has(agentId)) {
      errors.push({
        file: "agents.yaml",
        path: `omx.agent_reasoning.${agentId}`,
        message: `omx.agent_reasoning 引用未定义 agent '${agentId}'`,
      });
    }
  }
}
