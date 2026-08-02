import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  formatInstallRunResult,
  parseInstallOptions,
  printInstallResult,
  resolveInstallExecutable,
  runInstall,
  type InstallCommandResult,
  type InstallRunner,
} from "./ai-install.ts";
import { createExplainTestFixture } from "./explain-test-fixture.ts";

describe("ai:install CLI", () => {
  test("detects Windows tools without running installers or selectors", async () => {
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
          "scoop list": textResult(scoopList("", false)),
        }),
      });

      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      expect(calls).toEqual([
        "pnpm list --global --depth 0 --json",
        "opencode --version",
        "scoop list",
        "scoop bucket list",
      ]);
      const report = formatInstallRunResult(result);
      expect(report).toContain("OpenCode CLI：未安装");
      expect(report).toContain("执行：bun install --global opencode-ai@latest");
      expect(report).toContain("执行：scoop bucket add extras");
      expect(report).toContain("执行：scoop install wezterm");
      expect(report).toContain("请执行 bun run ai:gen，并在可选插件配置步骤中选择 Superpowers");
      expect(printInstallResult(result, () => undefined)).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  test("reports macOS cask hints without running installers", async () => {
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
        }),
      });

      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      expect(calls).toEqual([
        "pnpm list --global --depth 0 --json",
        "opencode --version",
        "brew list --cask --versions",
      ]);
      expect(formatInstallRunResult(result)).toContain("执行：brew install --cask opencode-desktop");
    } finally {
      fixture.cleanup();
    }
  });

  test("prompts OpenSpec initialization when OpenCode and OpenSpec are installed", async () => {
    const fixture = createExplainTestFixture();
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner([], {
          "pnpm list --global --depth 0 --json": jsonResult([
            { dependencies: { "opencode-ai": { version: "1.0.0" }, "@fission-ai/openspec": { version: "1.0.0" } } },
          ]),
          "brew list --cask --versions": textResult(""),
        }),
      });

      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      expect(formatInstallRunResult(result)).toContain("初始化");
      expect(formatInstallRunResult(result)).toContain("在项目根目录执行：openspec init");
    } finally {
      fixture.cleanup();
    }
  });

  test("prompts OpenSpec initialization after installing missing OpenSpec", async () => {
    const fixture = createExplainTestFixture();
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner([], {
          "pnpm list --global --depth 0 --json": jsonResult([
            { dependencies: { "opencode-ai": { version: "1.0.0" } } },
          ]),
          "brew list --cask --versions": textResult(""),
        }),
      });

      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      const report = formatInstallRunResult(result);
      expect(report).toContain("执行：pnpm add --global @fission-ai/openspec@latest");
      expect(report).toContain("安装后初始化");
      expect(report).toContain("在项目根目录执行：openspec init");
    } finally {
      fixture.cleanup();
    }
  });

  test("prompts linking Superpowers into an existing OpenSpec config", async () => {
    const fixture = createExplainTestFixture();
    try {
      await mkdir(`${fixture.root}/openspec`);
      await writeFile(`${fixture.root}/openspec/config.yaml`, "project: demo\n");
      await writeFile(
        `${fixture.root}/config/local/plugins.yaml`,
        "plugins:\n  - superpowers@git+https://github.com/obra/superpowers.git\n",
      );
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner([], {
          "pnpm list --global --depth 0 --json": jsonResult([
            {
              dependencies: {
                "opencode-ai": { version: "1.0.0" },
                "@fission-ai/openspec": { version: "1.0.0" },
              },
            },
          ]),
          "brew list --cask --versions": textResult(""),
        }),
      });

      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      expect(formatInstallRunResult(result)).toContain("尚未在 OpenSpec 配置中启用");
    } finally {
      fixture.cleanup();
    }
  });

  test("recognizes Superpowers configured in the user OpenCode config", async () => {
    const fixture = createExplainTestFixture();
    try {
      await mkdir(fixture.openCodeDir, { recursive: true });
      await writeFile(
        `${fixture.openCodeDir}/opencode.jsonc`,
        '{\n  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]\n}\n',
      );
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner([], {
          "pnpm list --global --depth 0 --json": jsonResult([{ dependencies: { "opencode-ai": { version: "1.0.0" } } }]),
          "brew list --cask --versions": textResult(""),
        }),
      });

      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      expect(formatInstallRunResult(result)).not.toContain("Superpowers：请执行 bun run ai:gen");
    } finally {
      fixture.cleanup();
    }
  });

  test("formats detection failures and exits unsuccessfully", async () => {
    const fixture = createExplainTestFixture();
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner([], {
          "pnpm list --global --depth 0 --json": failureResult("pnpm unavailable"),
        }),
      });

      expect(result.ok).toBe(false);
      expect(formatInstallRunResult(result)).toStartWith("检测失败：");
      expect(printInstallResult(result, () => undefined)).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });

  test("reports pnpm-managed tools as missing when pnpm is unavailable", async () => {
    const fixture = createExplainTestFixture();
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner([], {
          "pnpm list --global --depth 0 --json": {
            status: null,
            stdout: "",
            stderr: "",
            error: new Error('Executable not found in $PATH: "pnpm"'),
          },
          "brew list --cask --versions": textResult(""),
        }),
      });

      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      expect(formatInstallRunResult(result)).toContain("OpenCode CLI：未安装");
      expect(formatInstallRunResult(result)).toContain("执行：bun install --global opencode-ai@latest");
    } finally {
      fixture.cleanup();
    }
  });

  test("recognizes an installed OpenCode executable even when version probing fails", async () => {
    const fixture = createExplainTestFixture();
    try {
      const result = await runInstall({
        argv: ["bun", "script"],
        env: fixture.env,
        projectRoot: fixture.root,
        platform: "darwin",
        runner: createRunner([], {
          "pnpm list --global --depth 0 --json": jsonResult([{ dependencies: {} }]),
          "opencode --version": { status: 1, stdout: "", stderr: "runtime initialization failed" },
          "brew list --cask --versions": textResult(""),
        }),
      });

      expect(result.ok, formatInstallRunResult(result)).toBe(true);
      const report = formatInstallRunResult(result);
      expect(report).not.toContain("OpenCode CLI：未安装");
      expect(report).toContain("使用提示：");
    } finally {
      fixture.cleanup();
    }
  });

  test("shows CodeGraph usage guidance when installed", () => {
    const report = formatInstallRunResult(
      {
        ok: true,
        tools: [
          { id: "opencode", label: "OpenCode CLI", installed: false },
          { id: "opencode-desktop", label: "OpenCode Desktop", installed: true },
          { id: "wezterm", label: "WezTerm", installed: true },
          { id: "openspec", label: "OpenSpec", installed: false },
          { id: "superpowers", label: "Superpowers", installed: true },
          { id: "codegraph", label: "CodeGraph", installed: true },
        ],
        hints: [],
      },
      false,
    );
      expect(report).toContain("会话使用");
      expect(report).toContain("启动 OpenCode 后，直接请求");
      expect(report).toContain("Superpowers");
  });

  test("keeps the command-line interface and Windows executable resolution", () => {
    expect(parseInstallOptions(["bun", "script"])).toEqual({});
    expect(() => parseInstallOptions(["bun", "script", "--json"])).toThrow("未知参数");
    expect(resolveInstallExecutable("win32", "pnpm")).toBe("pnpm.cmd");
    expect(resolveInstallExecutable("win32", "scoop")).toBe("scoop.cmd");
    expect(resolveInstallExecutable("win32", "opencode")).toBe("opencode");
    expect(resolveInstallExecutable("darwin", "pnpm")).toBe("pnpm");
  });
});

function createRunner(calls: string[], responses: Record<string, InstallCommandResult>): InstallRunner {
  return ({ command, args }) => {
    const key = [command, ...args].join(" ");
    calls.push(key);
    return Promise.resolve(
      responses[key] ??
        (command === "opencode"
          ? {
              status: null,
              stdout: "",
              stderr: "",
              error: new Error('Executable not found in $PATH: "opencode"'),
            }
          : failureResult(`未配置测试命令：${key}`)),
    );
  };
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
