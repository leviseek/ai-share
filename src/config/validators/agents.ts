import type { AgentsYaml } from "../../types.ts";
import type { ValidationError } from "./common.ts";
import { isModelRole, isRecord, validateOptionalString } from "./common.ts";

export function validateAgents(errors: ValidationError[], agentsConfig: AgentsYaml): void {
  for (const [agentId, agent] of Object.entries(agentsConfig.agents ?? {})) {
    if (!isRecord(agent)) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}`,
        message: `agent '${agentId}' 必须是对象`,
      });
      continue;
    }
    validateAgentShape(errors, agentId, agent);
    const model = agent.model;
    if (model === undefined || model === null || model === "") {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.model`,
        message: `agent '${agentId}' 缺少 model 字段`,
      });
    } else if (typeof model !== "string" || !isModelRole(model)) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.model`,
        message: `agent '${agentId}' 的 model 必须引用 primary、reasoning 或 fast 角色`,
      });
    }
  }
}

function validateAgentShape(
  errors: ValidationError[],
  agentId: string,
  agent: Readonly<Record<string, unknown>>,
): void {
  const prompt = agent.prompt;
  if (prompt !== undefined) {
    if (!isRecord(prompt)) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.prompt`,
        message: `agent '${agentId}' 的 prompt 必须是对象`,
      });
    } else {
      validateOptionalString(errors, "agents.yaml", `agents.${agentId}.prompt.system`, prompt.system);
      validateOptionalString(errors, "agents.yaml", `agents.${agentId}.prompt.append`, prompt.append);
    }
  }

  const permission = agent.permission;
  if (permission !== undefined) {
    if (!isRecord(permission)) {
      errors.push({
        file: "agents.yaml",
        path: `agents.${agentId}.permission`,
        message: `agent '${agentId}' 的 permission 必须是对象`,
      });
      return;
    }
    for (const [permissionKey, permissionValue] of Object.entries(permission)) {
      if (typeof permissionValue !== "string" || !permissionValue) {
        errors.push({
          file: "agents.yaml",
          path: `agents.${agentId}.permission.${permissionKey}`,
          message: `agent '${agentId}' 的 permission.${permissionKey} 必须是非空字符串`,
        });
      }
    }
  }
}
