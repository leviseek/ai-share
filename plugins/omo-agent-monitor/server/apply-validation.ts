import type { MonitorState } from "./types.ts";

export function applyValidatedStateRepair(state: MonitorState, repaired: Partial<MonitorState>): void {
  if (repaired.session) {
    Object.assign(state.session, repaired.session);
  }
  if (repaired.todos) {
    state.todos = repaired.todos;
  }
  if (repaired.agents) {
    state.agents = repaired.agents;
  }
  if (repaired.activeCalls) {
    state.activeCalls = repaired.activeCalls;
  }
  if (repaired.dbTokens) {
    state.dbTokens = repaired.dbTokens;
  }
  if (repaired.dbExecutions) {
    state.dbExecutions = repaired.dbExecutions;
  }
  if (repaired.dbTokenMessageIds) {
    state.dbTokenMessageIds = repaired.dbTokenMessageIds;
  }
  if (repaired.dbTokenLastRefreshAt !== undefined) {
    state.dbTokenLastRefreshAt = repaired.dbTokenLastRefreshAt;
  }
  if (repaired.updatedAt !== undefined) {
    state.updatedAt = repaired.updatedAt;
  }
}
