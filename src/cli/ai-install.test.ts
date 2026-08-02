import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatInstallRunResult,
  parseInstallOptions,
  resolveInstallExecutable,
  runInstall,
  type InstallCommandResult,
  type InstallRunner,
} from "./ai-install.ts";
import { SUPERPOWERS_PLUGIN_SPEC } from "./install-plan.ts";
import { createExplainTestFixture } from "./explain-test-fixture.ts";

describe("ai:install CLI", () => {
  test("parses only the installer interface", () => {
    expect(parseInstallOptions(["bun", "script"])).toEqual({});
    expect(() => parseInstallOptions(["bun", "script", "--json"])).toThrow("未知参数");
    expect(() => parseInstallOptions(["bun", "script", "--provider"])).toThrow("未知参数");
  });

  test("detects tools, installs selected tools, and configures Superpowers last", async () => {
    const fixture = createExplainTestFixture();
    const calls: string[] = [];
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "win32",
        runner: createRunner(calls, {
          "pnpm list --global --depth 0 --json": jsonResult([{ dependencies: {} }]),
          "scoop list": textResult(scoopList("opencode-desktop", false)),
          "scoop bucket list": textResult(
            "Name  Source  Updated  Identifier\nmain  https://example.test/main  2026-08-01  main\n",
          ),
          "pnpm add --global opencode-ai@latest": okResult(),
          "scoop bucket add extras": okResult(),
          "scoop install wezterm": okResult(),
          "pnpm add --global @colbymchenry/codegraph@latest": okResult(),
          "bun run ai:gen": okResult(),
        }),
        select: (choices) => {
          expect(choices.find((choice) => choice.id === "opencode")).toMatchObject({ required: true });
          return Promise.resolve(new Set(["opencode", "opencode-desktop", "wezterm", "superpowers", "codegraph"]));
        },
        selectUpgrade: (choices) => {
          expect(choices.map((choice) => choice.id)).toEqual(["opencode-desktop"]);
          expect(choices[0]).toMatchObject({ required: false, selected: false });
          return Promise.resolve(new Set());
        },
      });

      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      expect(calls).toEqual([
        "pnpm list --global --depth 0 --json",
        "scoop list",
        "scoop bucket list",
        "pnpm add --global opencode-ai@latest",
        "scoop bucket add extras",
        "scoop install wezterm",
        "pnpm add --global @colbymchenry/codegraph@latest",
        "bun run ai:gen",
      ]);
      expect(readFileSync(join(fixture.root, "config", "local", "plugins.yaml"), "utf8")).toContain(
        SUPERPOWERS_PLUGIN_SPEC,
      );
    } finally {
      fixture.cleanup();
    }
  });

  test("stops after the first failed install command and does not change config", async () => {
    const fixture = createExplainTestFixture();
    const calls: string[] = [];
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner(calls, {
          "pnpm list --global --depth 0 --json": jsonResult([{ dependencies: {} }]),
          "brew list --cask --versions": textResult(""),
          "pnpm add --global opencode-ai@latest": failureResult("pnpm unavailable"),
          "brew install --cask opencode-desktop": okResult(),
        }),
        select: () => Promise.resolve(new Set(["opencode", "opencode-desktop", "wezterm", "superpowers"])),
      });

      expect(result.ok).toBe(false);
      expect(calls).toEqual([
        "pnpm list --global --depth 0 --json",
        "brew list --cask --versions",
        "pnpm add --global opencode-ai@latest",
      ]);
      expect(existsSync(join(fixture.root, "config", "local", "plugins.yaml"))).toBe(false);
      expect(formatInstallRunResult(result)).toContain("pnpm unavailable");
    } finally {
      fixture.cleanup();
    }
  });

  test("restores the previous overlay when ai:gen fails", async () => {
    const fixture = createExplainTestFixture();
    const overlayPath = join(fixture.root, "config", "local", "plugins.yaml");
    const original = "plugins:\n  - existing-plugin\n";
    try {
      await Bun.write(overlayPath, original);
      const calls: string[] = [];
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner(calls, {
          "pnpm list --global --depth 0 --json": jsonResult([{ dependencies: {} }]),
          "brew list --cask --versions": textResult(""),
          "bun run ai:gen": failureResult("generation failed"),
        }),
        select: () => Promise.resolve(new Set(["opencode", "opencode-desktop", "wezterm", "superpowers"])),
      });

      expect(result.ok).toBe(false);
      expect(readFileSync(overlayPath, "utf8")).toBe(original);
    } finally {
      fixture.cleanup();
    }
  });

  test("removes a newly created Superpowers overlay when generation fails", async () => {
    const fixture = createExplainTestFixture();
    const overlayPath = join(fixture.root, "config", "local", "plugins.yaml");
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner([], {
          "pnpm list --global --depth 0 --json": jsonResult([{ dependencies: {} }]),
          "brew list --cask --versions": textResult(""),
          "bun run ai:gen": failureResult("generation failed"),
        }),
        select: () => Promise.resolve(new Set(["opencode", "opencode-desktop", "wezterm", "superpowers"])),
      });

      expect(result.ok).toBe(false);
      expect(existsSync(overlayPath)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("reports each planned command before executing it", async () => {
    const fixture = createExplainTestFixture();
    const output: string[] = [];
    try {
      await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner([], {
          "pnpm list --global --depth 0 --json": jsonResult([{ dependencies: {} }]),
          "brew list --cask --versions": textResult(""),
          "pnpm add --global opencode-ai@latest": okResult(),
          "brew install --cask opencode-desktop": okResult(),
          "brew install --cask wezterm": okResult(),
          "bun run ai:gen": okResult(),
        }),
        select: () => Promise.resolve(new Set(["opencode", "opencode-desktop", "wezterm", "superpowers"])),
        write: (line) => output.push(line),
      });
      expect(output).toContain("执行：pnpm add --global opencode-ai@latest");
      expect(output).toContain("执行：brew install --cask opencode-desktop");
      expect(output).toContain("执行：bun run ai:gen");
    } finally {
      fixture.cleanup();
    }
  });

  test("recognizes Scoop single-bucket output for extras", async () => {
    const fixture = createExplainTestFixture();
    const calls: string[] = [];
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "win32",
        runner: createRunner(calls, {
          "pnpm list --global --depth 0 --json": jsonResult([{ dependencies: {} }]),
          "scoop list": textResult(scoopList("opencode-desktop", false)),
          "scoop bucket list": textResult("Name : extras\n"),
          "scoop install opencode-desktop": okResult(),
          "scoop update opencode-desktop": okResult(),
          "scoop install wezterm": okResult(),
          "pnpm add --global opencode-ai@latest": okResult(),
          "scoop bucket add extras": okResult(),
        }),
        select: () => Promise.resolve(new Set(["opencode", "opencode-desktop", "wezterm"])),
      });
      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      expect(calls).not.toContain("scoop bucket add extras");
    } finally {
      fixture.cleanup();
    }
  });

  test("uses the default selector for the upgrade menu and runs generation with Bun", async () => {
    const fixture = createExplainTestFixture();
    const selections: string[][] = [];
    const calls: string[] = [];
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner(calls, {
          "pnpm list --global --depth 0 --json": jsonResult([{ dependencies: { "opencode-ai": { version: "1" } } }]),
          "brew list --cask --versions": textResult("opencode-desktop 1.0\n"),
          "pnpm add --global opencode-ai@latest": okResult(),
          "brew install --cask wezterm": okResult(),
          "bun run ai:gen": okResult(),
        }),
        select: (choices) => {
          selections.push(choices.map((choice) => choice.id));
          return Promise.resolve(selections.length === 1 ? new Set(["superpowers"]) : new Set<string>());
        },
      });
      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      expect(selections).toHaveLength(2);
      expect(calls).toContain("bun run ai:gen");
    } finally {
      fixture.cleanup();
    }
  });

  test("resolves Windows package-manager shims without shell command concatenation", () => {
    expect(resolveInstallExecutable("win32", "pnpm")).toBe("pnpm.cmd");
    expect(resolveInstallExecutable("win32", "scoop")).toBe("scoop.cmd");
    expect(resolveInstallExecutable("darwin", "pnpm")).toBe("pnpm");
  });
});

function createRunner(calls: string[], responses: Record<string, InstallCommandResult>): InstallRunner {
  return ({ command, args }) => {
    const key = [command, ...args].join(" ");
    calls.push(key);
    return Promise.resolve(responses[key] ?? failureResult(`未配置测试命令：${key}`));
  };
}

function okResult(): InstallCommandResult {
  return { status: 0, stdout: "", stderr: "" };
}

function jsonResult(value: unknown): InstallCommandResult {
  return { status: 0, stdout: JSON.stringify(value), stderr: "" };
}

function textResult(stdout: string): InstallCommandResult {
  return { status: 0, stdout, stderr: "" };
}

function failureResult(stderr: string): InstallCommandResult {
  return { status: 1, stdout: "", stderr };
}

function scoopList(name: string, global: boolean): string {
  return [
    "Installed apps:",
    "",
    "Name             Version Source Updated    Info",
    "----             ------- ------ -------    ----",
    `${name.padEnd(17)}1.0     extras 2026-08-01${global ? " Global install" : ""}`,
    "",
  ].join("\n");
}
