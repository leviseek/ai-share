import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runGeneration } from "../generate-user-config.ts";
import type { GenerationPlan } from "./generation-plan.ts";
import type { ExplainReport } from "./explain-report.ts";
import { formatExplainRunResult, parseExplainOptions, printExplainResult, runExplain } from "./ai-explain.ts";
import { createExplainTestFixture, write } from "./explain-test-fixture.ts";

describe("ai:explain CLI", () => {
  test("parses only the explain interface", () => {
    expect(
      parseExplainOptions(["bun", "script", "--provider", "provider-a", "--task=Windows", "--force", "--json"]),
    ).toEqual({ provider: "provider-a", task: "Windows", force: true, json: true });
    expect(() => parseExplainOptions(["bun", "script", "--dry-run"])).toThrow("未知参数");
    expect(() => parseExplainOptions(["bun", "script", "--provider"])).toThrow("缺少参数值");
  });

  test("tracks provider and task sources while JSON disables interaction", async () => {
    const fixture = createExplainTestFixture();
    try {
      let selectionCalls = 0;
      const cli = await runExplain({
        argv: ["bun", "script", "--provider", "provider-b", "--task", "cli task", "--json"],
        env: { ...fixture.env, AI_SHARE_PROVIDER: "provider-a", AI_SHARE_TASK: "env task" },
        projectRoot: fixture.root,
        providerSelector: () => {
          selectionCalls += 1;
          return Promise.resolve("provider-a");
        },
      });
      expect(cli.report.inputs.provider.source).toBe("cli");
      expect(cli.report.inputs.task).toEqual({ value: "cli task", source: "cli" });
      expect(selectionCalls).toBe(0);

      const environment = await runExplain({
        argv: ["bun", "script", "--json"],
        env: { ...fixture.env, AI_SHARE_PROVIDER: "provider-b", AI_SHARE_TASK: "env task" },
        projectRoot: fixture.root,
      });
      expect(environment.report.inputs.provider).toMatchObject({ id: "provider-b", source: "environment" });
      expect(environment.report.inputs.task).toEqual({ value: "env task", source: "environment" });

      const global = await runExplain({
        argv: ["bun", "script", "--json"],
        env: fixture.env,
        projectRoot: fixture.root,
      });
      expect(global.report.inputs.provider).toMatchObject({ id: "provider-a", source: "global-config" });
      expect(global.report.inputs.task).toEqual({ source: "none" });

      const interactive = await runExplain({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        providerSelector: () => Promise.resolve("provider-b"),
      });
      expect(interactive.report.inputs.provider).toMatchObject({ id: "provider-b", source: "interactive" });
    } finally {
      fixture.cleanup();
    }
  });

  test("is read-only, reports collisions, and simulates force adoption", async () => {
    const fixture = createExplainTestFixture();
    try {
      const unmanagedConfig = "user-owned = true\n";
      mkdirSync(dirname(join(fixture.openCodeDir, "opencode.jsonc")), { recursive: true });
      writeFileSync(join(fixture.openCodeDir, "opencode.jsonc"), unmanagedConfig, "utf8");

      const collision = await runExplain({
        argv: ["bun", "script", "--provider", "provider-a", "--json"],
        env: fixture.env,
        projectRoot: fixture.root,
      });
      expect(collision.exitCode).toBe(1);
      expect(collision.report.status).toBe("collision");
      expect(collision.report.plan.collisions).toContainEqual({
        path: join(fixture.openCodeDir, "opencode.jsonc"),
        kind: "collision",
        reason: "unowned-collision",
        ownership: "unmanaged",
      });

      const forced = await runExplain({
        argv: ["bun", "script", "--provider", "provider-a", "--force", "--json"],
        env: fixture.env,
        projectRoot: fixture.root,
      });
      expect(forced.exitCode).toBe(0);
      expect(forced.report.status).toBe("ok");
      expect(forced.report.plan.actions).toContainEqual({
        path: join(fixture.openCodeDir, "opencode.jsonc"),
        kind: "update",
        reason: "force-adoption",
        ownership: "unmanaged",
      });
      expect(readFileSync(join(fixture.openCodeDir, "opencode.jsonc"), "utf8")).toBe(unmanagedConfig);
      expect(existsSync(join(fixture.openCodeDir, ".ai-share-staging"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("returns one structured JSON value for validation and parse errors", async () => {
    const fixture = createExplainTestFixture();
    try {
      write(join(fixture.root, "config", "global.yaml"), "model: missing\nprovider: provider-a\n");
      const validation = await runExplain({
        argv: ["bun", "script", "--json"],
        env: fixture.env,
        projectRoot: fixture.root,
      });
      expect(validation.exitCode).toBe(1);
      expect(validation.report.error?.code).toBe("config-validation");
      expect(JSON.parse(formatExplainRunResult(validation))).toEqual(validation.report);

      const parseError = await runExplain({
        argv: ["bun", "script", "--json", "--dry-run"],
        env: fixture.env,
        projectRoot: fixture.root,
      });
      const chunks: string[] = [];
      expect(printExplainResult(parseError, (chunk) => chunks.push(chunk))).toBe(1);
      expect(chunks).toHaveLength(1);
      expect(JSON.parse(chunks[0] ?? "")).toEqual(parseError.report);
      expect(chunks[0]).not.toContain("\u001b[");
    } finally {
      fixture.cleanup();
    }
  });

  test("classifies invalid Provider and interactive cancellation", async () => {
    const fixture = createExplainTestFixture();
    try {
      const invalid = await runExplain({
        argv: ["bun", "script", "--provider", "missing", "--json"],
        env: fixture.env,
        projectRoot: fixture.root,
      });
      expect(invalid.exitCode).toBe(1);
      expect(invalid.report.error?.code).toBe("invalid-provider");

      const cancelled = await runExplain({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        providerSelector: () => Promise.reject(new Error("已取消 Provider 选择。")),
      });
      expect(cancelled.exitCode).toBe(1);
      expect(cancelled.report.error?.code).toBe("cancelled");
    } finally {
      fixture.cleanup();
    }
  });

  test("fails before creating a project-local OpenCode directory when HOME is missing", async () => {
    const fixture = createExplainTestFixture();
    try {
      const result = await runExplain({
        argv: ["bun", "script", "--json"],
        env: {},
        projectRoot: fixture.root,
      });
      expect(result.exitCode).toBe(1);
      expect(result.report.error?.code).toBe("runtime");
      expect(result.report.error?.messages[0]).toContain("HOME 或 USERPROFILE");
      expect(existsSync(join(fixture.root, ".config", "opencode"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("matches ai:gen dry-run plans and produces byte-stable JSON", async () => {
    const fixture = createExplainTestFixture();
    try {
      const explain = await runExplain({
        argv: ["bun", "script", "--provider", "provider-a", "--task", "Windows", "--json"],
        env: fixture.env,
        projectRoot: fixture.root,
      });
      const generation = await runGeneration({
        argv: ["bun", "script", "--provider", "provider-a", "--task", "Windows", "--dry-run"],
        env: fixture.env,
        projectRoot: fixture.root,
      });
      expect(generation.ok).toBe(true);
      if (!generation.ok) throw generation.error;
      expect(explain.report.plan).toEqual(stripGenerationPlan(generation.plan));
      const repeated = await runExplain({
        argv: ["bun", "script", "--provider", "provider-a", "--task", "Windows", "--json"],
        env: fixture.env,
        projectRoot: fixture.root,
      });
      expect(formatExplainRunResult(explain)).toBe(formatExplainRunResult(repeated));
      expect(existsSync(fixture.openCodeDir)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });
});

function stripGenerationPlan(plan: GenerationPlan): ExplainReport["plan"] {
  return {
    actions: plan.actions.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      reason: entry.reason,
      ownership: entry.ownership,
    })),
    preserved: plan.preserved.map((entry) => ({ ...entry, kind: "preserve" as const })),
    collisions: plan.collisions.map((entry) => ({ ...entry, kind: "collision" as const })),
  };
}
