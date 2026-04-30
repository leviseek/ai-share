import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentInfo, operationName } from "./server/agent-info.ts";
import { firstRecord } from "./server/json.ts";
import { persist } from "./server/persist.ts";
import { currentOperationOf, ensureAgent, hasActiveCall, state, updateAgentInfo } from "./server/state.ts";
import { extractTokens } from "./server/tokens.ts";
import type { Plugin } from "./server/types.ts";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(pluginDir, "..", "..", "omo-agent-monitor-state.json");

const plugin: Plugin = {
  id: "omo-agent-monitor",
  server: async () => ({
    "session.status": async (event: Record<string, any>) => {
      const status = typeof event?.properties?.status === "string" ? event.properties.status : undefined;
      if (status) state.session.status = status;
      await persist(statePath);
    },

    "todo.updated": async (event: Record<string, any>) => {
      const todos = event?.properties?.todos;
      if (Array.isArray(todos)) state.todos = todos;
      await persist(statePath);
    },

    "tool.execute.before": async (input: Record<string, any>, output: Record<string, any> | undefined) => {
      const args = firstRecord(input.args, output?.args, input, output);
      const info = agentInfo(input.tool, args);
      const operation = operationName(input.tool, args);
      const now = Date.now();
      const metric = ensureAgent(info.name);
      updateAgentInfo(metric, info);
      if (Object.keys(state.activeCalls).length === 0) {
        state.session.activeWindowStart = now;
      }
      state.session.status = "running";
      metric.status = "running";
      metric.activeSince = now;
      metric.currentOperation = operation;
      state.activeCalls[input.callID] = { agent: info.name, startedAt: now, operation, info };
      state.session.lastActiveAt = now;
      await persist(statePath);
    },

    "tool.execute.after": async (input: Record<string, any>, output: Record<string, any> | undefined) => {
      const args = firstRecord(input.args, output?.args, input, output);
      const info = agentInfo(input.tool, args);
      const active = state.activeCalls[input.callID] ?? {
        agent: info.name,
        startedAt: Date.now(),
        info,
      };
      const now = Date.now();
      const metric = ensureAgent(active.agent);
      updateAgentInfo(metric, active.info);
      const elapsed = Math.max(now - active.startedAt, 0);
      metric.executed += 1;
      metric.totalMs += elapsed;
      metric.lastCompletedAt = now;
      delete state.activeCalls[input.callID];
      metric.status = hasActiveCall(active.agent) ? "running" : "idle";
      if (!hasActiveCall(active.agent)) {
        delete metric.activeSince;
        delete metric.currentOperation;
      } else {
        const currentOperation = currentOperationOf(active.agent);
        if (currentOperation) metric.currentOperation = currentOperation;
      }

      const tokenDelta = extractTokens(input) + extractTokens(output);
      state.session.totalTokens += tokenDelta;
      metric.totalTokens += tokenDelta;
      state.session.lastActiveAt = now;
      if (Object.keys(state.activeCalls).length === 0 && state.session.activeWindowStart) {
        state.session.totalActiveMs += Math.max(now - state.session.activeWindowStart, 0);
        delete state.session.activeWindowStart;
        state.session.status = "idle";
      }
      await persist(statePath);
    },
  }),
};

export default plugin;
