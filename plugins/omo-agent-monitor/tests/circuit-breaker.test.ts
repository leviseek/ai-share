/**
 * OMO Monitor Circuit Breaker Integration Tests
 *
 * Run: bun test plugins/omo-agent-monitor/tests/circuit-breaker.test.ts
 */

import { describe, it, expect } from "bun:test";
import { validateState } from "../server/validate.ts";
import { runSafe } from "../server/errors.ts";
import type { MonitorState } from "../server/types.ts";

function emptyState(overrides?: Partial<MonitorState>): MonitorState {
  return {
    updatedAt: Date.now(),
    session: { startedAt: Date.now(), lastActiveAt: Date.now(), totalActiveMs: 0, totalTokens: 0, status: "idle" },
    todos: [],
    agents: {},
    activeCalls: {},
    dbTokens: { total: 0, agents: {} },
    dbExecutions: { agents: {} },
    dbTokenMessageIds: new Set(),
    dbTokenLastRefreshAt: 0,
    ...overrides,
  };
}

// ── Test 1: validateState ─────────────────────────────────────────────────

describe("validateState", () => {
  it("passes through valid state unchanged", () => {
    const now = Date.now();
    const valid = emptyState({
      updatedAt: now,
      session: {
        startedAt: now - 10000,
        lastActiveAt: now,
        totalActiveMs: 5000,
        totalTokens: 15000,
        status: "running",
      },
      todos: [{ content: "test", status: "in_progress" }],
      agents: {
        main: {
          name: "main",
          kind: "main",
          source: "main",
          background: false,
          status: "running",
          executed: 5,
          totalMs: 12000,
          totalTokens: 8000,
        },
      },
    });

    const result = validateState(valid);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("clamps negative totalActiveMs", () => {
    const result = validateState(
      emptyState({
        session: {
          startedAt: Date.now(),
          lastActiveAt: Date.now(),
          totalActiveMs: -100,
          totalTokens: 0,
          status: "idle",
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.repaired.session?.totalActiveMs).toBe(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("clamps negative totalTokens", () => {
    const result = validateState(
      emptyState({
        session: {
          startedAt: Date.now(),
          lastActiveAt: Date.now(),
          totalActiveMs: 0,
          totalTokens: -500,
          status: "idle",
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.repaired.session?.totalTokens).toBe(0);
  });

  it("sanitizes agent metric with negative values", () => {
    const result = validateState(
      emptyState({
        agents: {
          testAgent: {
            name: "testAgent",
            kind: "tool",
            source: "fallback",
            background: false,
            status: "idle",
            executed: -1,
            totalMs: -100,
            totalTokens: -200,
          },
        },
      }),
    );

    expect(result.valid).toBe(false);
    const agent = result.repaired.agents?.["testAgent"];
    expect(agent?.executed).toBe(0);
    expect(agent?.totalMs).toBe(0);
    expect(agent?.totalTokens).toBe(0);
  });

  it("removes agent entry with empty name", () => {
    const result = validateState(
      emptyState({
        agents: {
          "": {
            name: "",
            kind: "tool",
            source: "fallback",
            background: false,
            status: "unknown",
            executed: 0,
            totalMs: 0,
            totalTokens: 0,
          },
        },
      }),
    );

    expect(result.repaired.agents).toBeDefined();
    expect(Object.keys(result.repaired.agents!)).not.toContain("");
  });

  it("resets empty session.status to 'idle'", () => {
    const result = validateState(
      emptyState({
        session: { startedAt: Date.now(), lastActiveAt: Date.now(), totalActiveMs: 0, totalTokens: 0, status: "" },
      }),
    );

    expect(result.repaired.session?.status).toBe("idle");
  });
});

// ── Test 2: runSafe (Error Boundaries) ────────────────────────────────────

describe("runSafe", () => {
  it("returns value on success", async () => {
    const result = await runSafe("testHandler", async () => 42);
    expect(result).toBe(42);
  });

  it("returns undefined on throw", async () => {
    const result = await runSafe("testHandler", async () => {
      throw new Error("boom");
    });
    expect(result).toBeUndefined();
  });

  it("does not propagate errors", async () => {
    let caught = false;
    try {
      await runSafe("testHandler", async () => {
        throw new Error("boom");
      });
    } catch {
      caught = true;
    }
    expect(caught).toBe(false);
  });
});

// ── Manual Verification Scenarios (documented, not automated) ─────────────

describe("manual verification scenarios", () => {
  it("circuit breaker trip conditions — documented", () => {
    // SCENARIO 1: Too many activeCalls (> 50)
    // How to verify:
    //   1. Inject 51+ concurrent tool.execute.before events without .after
    //   2. Run persist() — should trigger circuit breaker
    //   3. Check console for "[omo-monitor] CIRCUIT BREAKER TRIPPED: active calls (51) exceeds maximum (50)"
    //   4. Verify state file is written with session.status = "interrupted"
    //   5. Verify WebUI server is closed (browser tab shows connection refused)
    expect(true).toBe(true);
  });

  it("state staleness detection — documented", () => {
    // SCENARIO 2: State not updated for > 60s
    // How to verify:
    //   1. Manually set state.updatedAt to Date.now() - 120000
    //   2. Run persist() — should trigger alert but NOT trip (only trips if state up-to-date)
    //   3. Wait for next health check (every 10s)
    //   4. OR: Manually set state and run checkHealth — should return reason string
    expect(true).toBe(true);
  });

  it("process signal handlers — documented", () => {
    // SCENARIO 3: SIGINT/SIGTERM signal handling
    // Cannot auto-test process.exit behavior.
    // Manual test:
    //   1. Start aiomo session with monitor
    //   2. Send Ctrl+C (SIGINT)
    //   3. Verify state file has session.status = "interrupted"
    //   4. Verify terminal is restored (no raw mode, no garbled mouse output)
    //   5. Verify `omo-agent-monitor-state.json` contains the final state snapshot
    expect(true).toBe(true);
  });

  it("WebUI idle timeout — documented", () => {
    // SCENARIO 4: WebUI server auto-shutdown after 5 min inactivity
    // Manual test:
    //   1. Run ensureWebUi() — note the port
    //   2. Visit http://127.0.0.1:<port>/state — should return JSON
    //   3. Do NOT send any requests for 5 minutes
    //   4. After 5 min, server should auto-close
    //   5. Verify via console: "[omo-monitor] WebUI idle timeout reached, shutting down server"
    //   6. Verify closeWebUi() can also be called manually for immediate shutdown
    expect(true).toBe(true);
  });

  it("SQLite error recovery — documented", () => {
    // SCENARIO 5: SQLite query failure recovery
    // How to verify:
    //   1. Simulate DB lock/temporarily rename opencode.db
    //   2. Verify refreshDbTokenSnapshot catches error
    //   3. Verify sqliteDb handle is reset (set to undefined)
    //   4. Verify console.warn with "[omo-monitor] sqlite query error: ..."
    //   5. Verify live event metrics continue working despite DB failure
    expect(true).toBe(true);
  });

  it("desktop monitor reconnection — documented", () => {
    // SCENARIO 6: Desktop monitor backoff + staleness
    // Manual test:
    //   1. Start aiomo-monitor
    //   2. Delete/move omo-agent-monitor-state.json while running
    //   3. Verify header shows " (历史数据)" and backoff starts (1s, 2s, 4s...)
    //   4. Restore the state file
    //   5. Verify warning disappears and retryDelay resets to 1s
    //   6. Stop writing state file updates — after 30s verify " (数据可能已过期)"
    //   7. Resume updates — verify warning clears
    expect(true).toBe(true);
  });

  it("error boundaries prevent plugin crash — documented", () => {
    // SCENARIO 7: Unhandled exception in event handler
    // Automated verification via runSafe tests above
    // Manual test:
    //   1. Inject an event handler that throws (e.g., session.status with malformed payload)
    //   2. Verify the plugin continues processing subsequent events
    //   3. Verify console.error with "[omo-monitor] Error in session.status: ..."
    //   4. Verify state file is still written by subsequent handlers
    expect(true).toBe(true);
  });
});
