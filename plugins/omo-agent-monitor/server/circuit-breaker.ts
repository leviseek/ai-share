import { writeFileSync } from "node:fs";
import { state } from "./state.ts";
import { serverRef } from "./signals.ts";
import { validateState } from "./validate.ts";

export interface CircuitBreakerState {
  tripped: boolean;
  reason: string;
  trippedAt: number;
  consecutiveTimeouts: number;
  lastCheckAt: number;
}

export const circuitBreaker: CircuitBreakerState = {
  tripped: false,
  reason: "",
  trippedAt: 0,
  consecutiveTimeouts: 0,
  lastCheckAt: 0,
};

const HEALTH_CHECK_INTERVAL_MS = 10_000;
const MAX_ACTIVE_CALLS = 50;
const MAX_CALL_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_STATE_STALE_MS = 60_000;
const MAX_CONSECUTIVE_TIMEOUTS = 3;
const MAX_TOTAL_TOKENS = 5_000_000;

export function incrementConsecutiveTimeouts(): void {
  circuitBreaker.consecutiveTimeouts += 1;
}

export function resetConsecutiveTimeouts(): void {
  circuitBreaker.consecutiveTimeouts = 0;
}

function trip(reason: string): void {
  if (circuitBreaker.tripped) return;
  circuitBreaker.tripped = true;
  circuitBreaker.reason = reason;
  circuitBreaker.trippedAt = Date.now();
  state.session.status = "interrupted";
  console.error(`[omo-monitor] CIRCUIT BREAKER TRIPPED: ${reason}`);
}

export function checkHealth(_statePath: string): string | undefined {
  if (circuitBreaker.tripped) return circuitBreaker.reason;

  const now = Date.now();

  // Throttle health checks to every 10s
  if (now - circuitBreaker.lastCheckAt < HEALTH_CHECK_INTERVAL_MS) return undefined;
  circuitBreaker.lastCheckAt = now;

  // Check 1: Too many active calls (runaway agent spawning)
  const activeCallCount = Object.keys(state.activeCalls).length;
  if (activeCallCount > MAX_ACTIVE_CALLS) {
    trip(`active calls (${activeCallCount}) exceeds maximum (${MAX_ACTIVE_CALLS})`);
    return circuitBreaker.reason;
  }

  // Check 2: Any single call running too long (stuck tool execution)
  for (const [callId, call] of Object.entries(state.activeCalls)) {
    const duration = now - call.startedAt;
    if (duration > MAX_CALL_DURATION_MS) {
      trip(
        `call "${callId}" (${call.agent}) running for ${Math.round(duration / 1000 / 60)} minutes, exceeds ${MAX_CALL_DURATION_MS / 1000 / 60} min limit`,
      );
      return circuitBreaker.reason;
    }
  }

  // Check 3: State staleness (persistence failure)
  if (state.updatedAt && now - state.updatedAt > MAX_STATE_STALE_MS) {
    trip(
      `state not updated for ${Math.round((now - state.updatedAt) / 1000)}s, exceeds ${MAX_STATE_STALE_MS / 1000}s limit`,
    );
    return circuitBreaker.reason;
  }

  // Check 4: Consecutive SQLite timeouts
  if (circuitBreaker.consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
    trip(`${circuitBreaker.consecutiveTimeouts} consecutive SQLite timeouts`);
    return circuitBreaker.reason;
  }

  // Check 5: Token budget exceeded
  const totalTokens = state.session.totalTokens + state.dbTokens.total;
  if (totalTokens > MAX_TOTAL_TOKENS) {
    trip(`total tokens (${totalTokens}) exceeds budget (${MAX_TOTAL_TOKENS})`);
    return circuitBreaker.reason;
  }

  return undefined;
}

export function emergencyStop(statePath: string): void {
  trip("emergency stop requested");

  // Validate and write final state
  try {
    const { repaired } = validateState(state);
    Object.assign(state, repaired);
    const activeNow =
      state.session.activeWindowStart !== undefined ? Math.max(Date.now() - state.session.activeWindowStart, 0) : 0;
    const content = JSON.stringify(
      {
        updatedAt: Date.now(),
        session: {
          startedAt: state.session.startedAt,
          lastActiveAt: state.session.lastActiveAt,
          totalActiveMs: state.session.totalActiveMs + activeNow,
          totalTokens: state.session.totalTokens + state.dbTokens.total,
          status: state.session.status,
        },
        todos: state.todos,
        agents: Object.values(state.agents),
      },
      null,
      2,
    );
    writeFileSync(statePath, content, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[omo-monitor] emergencyStop persist error: ${message}`);
  }

  // Close WebUI server
  if (serverRef.current) {
    try {
      serverRef.current.close();
    } catch {
      // Best-effort
    }
  }
}
