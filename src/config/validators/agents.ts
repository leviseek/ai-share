import type { AgentsYaml } from "../../types.ts";
import type { ValidationError } from "./common.ts";
import { isModelRole, isRecord, validateOptionalString } from "./common.ts";

const REQUIRED_OMX_MODEL_SLOTS = ["default", "team", "autopilot", "ralph", "team_low_complexity"] as const;

export function validateAgents(errors: ValidationError[], agentsConfig: AgentsYaml): void {
  validateSharedPrompt(errors, agentsConfig.shared_prompt);
  validateCodexRuntime(errors, agentsConfig);

  const agentEntries = validateAgentCatalog(errors, agentsConfig.agents);
  validateOmxRuntime(errors, agentsConfig, new Set(Object.keys(agentEntries)));

  for (const [agentId, agent] of Object.entries(agentEntries)) {
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

function validateSharedPrompt(errors: ValidationError[], sharedPrompt: unknown): void {
  if (sharedPrompt === undefined) return;
  if (!isRecord(sharedPrompt)) {
    errors.push({
      file: "agents.yaml",
      path: "shared_prompt",
      message: "shared_prompt 必须是对象",
    });
    return;
  }
  validateOptionalString(errors, "agents.yaml", "shared_prompt.system", sharedPrompt.system);
  validateOptionalString(errors, "agents.yaml", "shared_prompt.append", sharedPrompt.append);
}

function validateAgentCatalog(errors: ValidationError[], agents: unknown): Record<string, unknown> {
  if (agents === undefined || agents === null) {
    errors.push({
      file: "agents.yaml",
      path: "agents",
      message: "缺少 agents 字段",
    });
    return {};
  }
  if (!isRecord(agents)) {
    errors.push({
      file: "agents.yaml",
      path: "agents",
      message: "agents 必须是对象",
    });
    return {};
  }
  return agents;
}

function validateCodexRuntime(errors: ValidationError[], agentsConfig: AgentsYaml): void {
  const codex = requireRecordField(errors, "codex", agentsConfig.codex);
  if (!codex) return;
  const agents = requireRecordField(errors, "codex.agents", codex.agents);
  if (!agents) return;

  validateRequiredPositiveInteger(errors, "codex.agents.max_threads", agents.max_threads);
  validateRequiredPositiveInteger(errors, "codex.agents.max_depth", agents.max_depth);
  validateRequiredPositiveInteger(errors, "codex.agents.job_max_runtime_seconds", agents.job_max_runtime_seconds);
}

function validateOmxRuntime(errors: ValidationError[], agentsConfig: AgentsYaml, agentIds: ReadonlySet<string>): void {
  const omx = requireRecordField(errors, "omx", agentsConfig.omx);
  if (!omx) return;

  const modelSlots = requireRecordField(errors, "omx.model_slots", omx.model_slots);
  if (modelSlots) {
    for (const slotName of REQUIRED_OMX_MODEL_SLOTS) {
      if (modelSlots[slotName] === undefined || modelSlots[slotName] === null) {
        errors.push({
          file: "agents.yaml",
          path: `omx.model_slots.${slotName}`,
          message: `omx.model_slots 缺少 '${slotName}' 字段`,
        });
      }
    }
    for (const [slotName, modelRole] of Object.entries(modelSlots)) {
      if (typeof modelRole !== "string" || !isModelRole(modelRole)) {
        errors.push({
          file: "agents.yaml",
          path: `omx.model_slots.${slotName}`,
          message: `omx.model_slots.${slotName} 必须引用 primary、reasoning 或 fast 角色`,
        });
      }
    }
  }

  const agentReasoning = requireRecordField(errors, "omx.agent_reasoning", omx.agent_reasoning);
  if (!agentReasoning) return;
  for (const [agentId, level] of Object.entries(agentReasoning)) {
    if (!agentIds.has(agentId)) {
      errors.push({
        file: "agents.yaml",
        path: `omx.agent_reasoning.${agentId}`,
        message: `omx.agent_reasoning 引用未定义 agent '${agentId}'`,
      });
    }
    if (level !== "low" && level !== "medium" && level !== "high") {
      errors.push({
        file: "agents.yaml",
        path: `omx.agent_reasoning.${agentId}`,
        message: `omx.agent_reasoning.${agentId} 必须是 low、medium 或 high`,
      });
    }
  }
}

function requireRecordField(
  errors: ValidationError[],
  path: string,
  value: unknown,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    errors.push({
      file: "agents.yaml",
      path,
      message: `缺少 ${path} 字段`,
    });
    return undefined;
  }
  if (!isRecord(value)) {
    errors.push({
      file: "agents.yaml",
      path,
      message: `${path} 必须是对象`,
    });
    return undefined;
  }
  return value;
}

function validateRequiredPositiveInteger(errors: ValidationError[], path: string, value: unknown): void {
  if (value === undefined || value === null) {
    errors.push({
      file: "agents.yaml",
      path,
      message: `缺少 ${path} 字段`,
    });
    return;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors.push({
      file: "agents.yaml",
      path,
      message: `${path} 必须是正整数`,
    });
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
