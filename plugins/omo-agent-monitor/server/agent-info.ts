import { classifyAgent } from "../shared.ts";
import type { AgentInfo, AgentSource } from "./types.ts";
import { booleanField, isRecord, stringField } from "./json.ts";

const taskToolNames = new Set(["delegate_task", "task", "call_omo_agent", "background_task"]);

export function agentInfo(tool: string, args: unknown): AgentInfo {
  if (!isRecord(args)) {
    const name = taskToolNames.has(tool) ? "main" : tool;
    return {
      name,
      kind: classifyAgent(name),
      source: "tool",
      background: false,
    };
  }

  const subagent = stringField(args, "subagent_type") ?? stringField(args, "subagentType");
  const agent = stringField(args, "agent");
  const category = stringField(args, "category");
  const name = subagent ?? agent ?? category ?? (taskToolNames.has(tool) ? "main" : tool);
  const source: AgentSource = subagent
    ? "subagent_type"
    : agent
      ? "agent"
      : category
        ? "category"
        : taskToolNames.has(tool)
          ? "main"
          : "tool";

  const info: AgentInfo = {
    name,
    kind: source === "category" ? "category" : classifyAgent(name),
    source,
    background:
      booleanField(args, "run_in_background") ?? booleanField(args, "runInBackground") ?? tool === "background_task",
  };
  const parentAgent =
    stringField(args, "parentAgent") ?? stringField(args, "parent_agent") ?? stringField(args, "parent");
  if (parentAgent) info.parentAgent = parentAgent;
  const sessionId = readSessionId(args);
  if (sessionId) info.sessionId = sessionId;
  return info;
}

export function operationName(tool: string, args: unknown): string {
  if (!isRecord(args)) return tool;
  return stringField(args, "tool_name") ?? stringField(args, "description") ?? stringField(args, "command") ?? tool;
}

function readSessionId(value: unknown): string | undefined {
  const direct = stringField(value, "sessionId") ?? stringField(value, "sessionID") ?? stringField(value, "session_id");
  if (direct) return direct;
  const metadata = isRecord(value) && isRecord(value.metadata) ? value.metadata : undefined;
  return metadata
    ? (stringField(metadata, "sessionId") ?? stringField(metadata, "sessionID") ?? stringField(metadata, "session_id"))
    : undefined;
}
