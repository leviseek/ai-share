import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { WezTermConfig } from "../types.ts";
import { WEZTERM_CONFIG_MANAGED_HEADER } from "../config/builders/wezterm.ts";
import {
  formatWezTermConfigResult,
  parseWezTermConfigOptions,
  printWezTermConfigResult,
  runWezTermConfig,
  runWezTermConfigCommand,
} from "./ai-config.ts";

const defaults: WezTermConfig = {
  shell: "platform-native",
  color_scheme: "catppuccin-mocha",
  font_size: 12,
  window_background_opacity: 0.94,
  maximize_on_startup: false,
  scrollback_lines: 100000,
};

const selected: WezTermConfig = {
  shell: "wezterm-default",
  color_scheme: "tokyo-night",
  font_size: 13,
  window_background_opacity: 0.88,
  maximize_on_startup: true,
  scrollback_lines: 1000000,
};

async function withTempProject<T>(
  callback: (fixture: { root: string; projectRoot: string; home: string }) => Promise<T>,
) {
  const root = await mkdtemp(join(tmpdir(), "ai-share-ai-config-"));
  const projectRoot = resolve(root, "project");
  const home = resolve(root, "home");
  await mkdir(resolve(projectRoot, "config"), { recursive: true });
  await writeWezTermYaml(projectRoot, defaults);
  try {
    return await callback({ root, projectRoot, home });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeWezTermYaml(projectRoot: string, config: WezTermConfig): Promise<void> {
  await writeFile(
    resolve(projectRoot, "config", "wezterm.yaml"),
    [
      `shell: ${config.shell}`,
      `color_scheme: ${config.color_scheme}`,
      `font_size: ${config.font_size}`,
      `window_background_opacity: ${config.window_background_opacity}`,
      `maximize_on_startup: ${config.maximize_on_startup}`,
      `scrollback_lines: ${config.scrollback_lines}`,
      "",
    ].join("\n"),
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function argv(...args: string[]): string[] {
  return ["bun", "src/cli/ai-config.ts", ...args];
}

describe("ai:config options", () => {
  test("accepts only dry-run, non-interactive, and force flags", () => {
    expect(parseWezTermConfigOptions(argv("--dry-run", "--non-interactive", "--force"))).toEqual({
      dryRun: true,
      nonInteractive: true,
      force: true,
    });
    expect(parseWezTermConfigOptions(argv())).toEqual({
      dryRun: false,
      nonInteractive: false,
      force: false,
    });
  });

  test.each(["--provider", "--dry-run=true", "unexpected"])("rejects unknown argument %s", (argument) => {
    expect(() => parseWezTermConfigOptions(argv(argument))).toThrow(`未知参数：${argument}`);
  });
});

describe("ai:config orchestration", () => {
  test("emits the complete summary and plan before execution begins", async () => {
    await withTempProject(async ({ projectRoot, home }) => {
      const output: string[] = [];
      let outputAtExecution = "";

      const exitCode = await runWezTermConfigCommand(
        {
          argv: argv("--non-interactive"),
          env: { HOME: home },
          platform: "win32",
          projectRoot,
          executePlan: () => {
            outputAtExecution = output.join("");
            return Promise.resolve();
          },
        },
        { stdout: (value) => output.push(value), stderr: (value) => output.push(value) },
      );

      expect(exitCode).toBe(0);
      expect(outputAtExecution).toContain("shell: platform-native");
      expect(outputAtExecution).toContain("color_scheme: catppuccin-mocha");
      expect(outputAtExecution).toContain("font_size: 12");
      expect(outputAtExecution).toContain("window_background_opacity: 0.94");
      expect(outputAtExecution).toContain("maximize_on_startup: false");
      expect(outputAtExecution).toContain("scrollback_lines: 100000");
      expect(outputAtExecution).toContain(`PLAN CREATE ${resolve(home, ".config", "wezterm", "wezterm.lua")}`);
    });
  });

  test("prints the prior summary and plan before a Chinese execution failure", async () => {
    await withTempProject(async ({ projectRoot, home }) => {
      const events: string[] = [];

      const exitCode = await runWezTermConfigCommand(
        {
          argv: argv("--non-interactive"),
          env: { HOME: home },
          platform: "darwin",
          projectRoot,
          executePlan: () => {
            events.push("EXECUTE");
            return Promise.reject(new Error("injected executor rejection"));
          },
        },
        {
          stdout: (value) => events.push(`STDOUT:${value}`),
          stderr: (value) => events.push(`STDERR:${value}`),
        },
      );

      expect(exitCode).toBe(1);
      expect(events).toHaveLength(3);
      expect(events[0]).toContain("WezTerm 配置摘要");
      expect(events[0]).toContain(`PLAN CREATE ${resolve(home, ".config", "wezterm", "wezterm.lua")}`);
      expect(events[1]).toBe("EXECUTE");
      expect(events[2]).toContain("WezTerm 配置写入失败：injected executor rejection");
    });
  });

  test.each(["win32", "darwin"] as const)("supports %s with an injected HOME", async (platform) => {
    await withTempProject(async ({ projectRoot, home }) => {
      const result = await runWezTermConfig({
        argv: argv("--dry-run", "--non-interactive"),
        env: { HOME: home },
        platform,
        projectRoot,
      });

      expect(result).toMatchObject({ ok: true, exitCode: 0, config: defaults, plan: { kind: "create" } });
      if (!result.ok) throw result.error;
      expect(result.plan.path).toBe(resolve(home, ".config", "wezterm", "wezterm.lua"));
    });
  });

  test("rejects unsupported platforms in Chinese before resolving HOME", async () => {
    const result = await runWezTermConfig({ argv: argv("--dry-run"), env: {}, platform: "linux" });

    expect(result).toMatchObject({ ok: false, exitCode: 1 });
    if (result.ok) throw new Error("expected failure");
    expect((result.error as Error).message).toBe("当前平台不支持生成 WezTerm 配置：linux");
    expect(result.plan).toBeUndefined();
  });

  test("invokes the selector only when both input and output are TTY", async () => {
    await withTempProject(async ({ projectRoot, home }) => {
      const initialValues: WezTermConfig[] = [];
      const result = await runWezTermConfig({
        argv: argv("--dry-run"),
        env: { HOME: home },
        platform: "win32",
        projectRoot,
        inputIsTTY: true,
        outputIsTTY: true,
        selector: (initial) => {
          initialValues.push(initial);
          return Promise.resolve(selected);
        },
      });

      expect(initialValues).toEqual([defaults]);
      expect(result).toMatchObject({ ok: true, config: selected });
      if (!result.ok || result.plan.kind === "collision" || result.plan.kind === "preserve") {
        throw new Error("expected writable plan");
      }
      expect(result.plan.content).toContain("config.font_size = 13");
      expect(result.plan.content).toContain('config.color_scheme = "Tokyo Night"');
    });
  });

  test.each([
    ["explicit non-interactive", true, true, true],
    ["non-TTY input", false, true, false],
    ["non-TTY output", false, false, true],
  ] as const)("skips the selector for %s", async (_name, nonInteractive, inputIsTTY, outputIsTTY) => {
    await withTempProject(async ({ projectRoot, home }) => {
      let selectorCalls = 0;
      const result = await runWezTermConfig({
        argv: argv("--dry-run", ...(nonInteractive ? ["--non-interactive"] : [])),
        env: { HOME: home },
        platform: "darwin",
        projectRoot,
        inputIsTTY,
        outputIsTTY,
        selector: () => {
          selectorCalls += 1;
          return Promise.resolve(selected);
        },
      });

      expect(selectorCalls).toBe(0);
      expect(result).toMatchObject({ ok: true, config: defaults });
    });
  });

  test("dry-run can select values but performs zero writes", async () => {
    await withTempProject(async ({ projectRoot, home }) => {
      const target = resolve(home, ".config", "wezterm", "wezterm.lua");
      let executorCalls = 0;
      const result = await runWezTermConfig({
        argv: argv("--dry-run"),
        env: { HOME: home },
        platform: "win32",
        projectRoot,
        inputIsTTY: true,
        outputIsTTY: true,
        selector: () => Promise.resolve(selected),
        executePlan: () => {
          executorCalls += 1;
          return Promise.resolve();
        },
      });

      expect(result).toMatchObject({ ok: true, executed: false, config: selected, plan: { kind: "create" } });
      expect(executorCalls).toBe(0);
      expect(await exists(target)).toBe(false);
      expect(await exists(resolve(home, ".config"))).toBe(false);
    });
  });

  test("reports an unmanaged collision as an exit failure without changing the file", async () => {
    await withTempProject(async ({ projectRoot, home }) => {
      const target = resolve(home, ".config", "wezterm", "wezterm.lua");
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, "-- user-owned config\n");

      const result = await runWezTermConfig({
        argv: argv("--non-interactive"),
        env: { HOME: home },
        platform: "win32",
        projectRoot,
      });

      expect(result).toMatchObject({ ok: false, exitCode: 1, plan: { kind: "collision", path: target } });
      expect(await readFile(target, "utf8")).toBe("-- user-owned config\n");
      const formatted = formatWezTermConfigResult(result);
      expect(formatted.stdout).toContain(`APPLY COLLISION ${target}`);
      expect(formatted.stderr).toContain("未受管冲突");
    });
  });

  test("prints a collision summary and plan before failure without executing", async () => {
    await withTempProject(async ({ projectRoot, home }) => {
      const target = resolve(home, ".config", "wezterm", "wezterm.lua");
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, "-- user-owned config\n");
      const events: string[] = [];
      let executorCalls = 0;

      const exitCode = await runWezTermConfigCommand(
        {
          argv: argv("--non-interactive"),
          env: { HOME: home },
          platform: "win32",
          projectRoot,
          executePlan: () => {
            executorCalls += 1;
            return Promise.resolve();
          },
        },
        {
          stdout: (value) => events.push(`STDOUT:${value}`),
          stderr: (value) => events.push(`STDERR:${value}`),
        },
      );

      expect(exitCode).toBe(1);
      expect(executorCalls).toBe(0);
      expect(events).toHaveLength(2);
      expect(events[0]).toContain("WezTerm 配置摘要");
      expect(events[0]).toContain(`PLAN COLLISION ${target}`);
      expect(events[1]).toContain("WezTerm 目标存在未受管冲突");
      expect(await readFile(target, "utf8")).toBe("-- user-owned config\n");
    });
  });

  test("force adopts an unmanaged target only after YAML validation", async () => {
    await withTempProject(async ({ projectRoot, home }) => {
      const target = resolve(home, ".config", "wezterm", "wezterm.lua");
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, "-- user-owned config\n");

      const adopted = await runWezTermConfig({
        argv: argv("--non-interactive", "--force"),
        env: { HOME: home },
        platform: "darwin",
        projectRoot,
      });
      expect(adopted).toMatchObject({
        ok: true,
        executed: true,
        plan: { kind: "update", ownership: "unmanaged", reason: "force-adoption" },
      });
      expect(await readFile(target, "utf8")).toStartWith(WEZTERM_CONFIG_MANAGED_HEADER);

      await writeFile(target, "-- restored user config\n");
      await writeFile(resolve(projectRoot, "config", "wezterm.yaml"), "font_size: 99\n");
      const invalid = await runWezTermConfig({
        argv: argv("--non-interactive", "--force"),
        env: { HOME: home },
        platform: "darwin",
        projectRoot,
      });
      expect(invalid).toMatchObject({ ok: false, exitCode: 1 });
      expect(await readFile(target, "utf8")).toBe("-- restored user config\n");
    });
  });

  test("creates, updates, and preserves through the real executor with complete output", async () => {
    await withTempProject(async ({ projectRoot, home }) => {
      const target = resolve(home, ".config", "wezterm", "wezterm.lua");
      const input = {
        argv: argv("--non-interactive"),
        env: { HOME: home },
        platform: "win32" as const,
        projectRoot,
      };

      const created = await runWezTermConfig(input);
      expect(created).toMatchObject({ ok: true, plan: { kind: "create" } });
      const createdOutput = formatWezTermConfigResult(created).stdout;
      expect(createdOutput).toContain("shell: platform-native");
      expect(createdOutput).toContain("color_scheme: catppuccin-mocha");
      expect(createdOutput).toContain("font_size: 12");
      expect(createdOutput).toContain("window_background_opacity: 0.94");
      expect(createdOutput).toContain("maximize_on_startup: false");
      expect(createdOutput).toContain("scrollback_lines: 100000");
      expect(createdOutput).toContain(`APPLY CREATE ${target}`);

      await writeFile(target, `${WEZTERM_CONFIG_MANAGED_HEADER}\nreturn { stale = true }\n`);
      const updated = await runWezTermConfig(input);
      expect(updated).toMatchObject({ ok: true, plan: { kind: "update" } });
      expect(formatWezTermConfigResult(updated).stdout).toContain(`APPLY UPDATE ${target}`);

      const preserved = await runWezTermConfig(input);
      expect(preserved).toMatchObject({ ok: true, plan: { kind: "preserve" } });
      expect(formatWezTermConfigResult(preserved).stdout).toContain(`APPLY PRESERVE ${target}`);
    });
  });

  test("prints stdout, stderr, and the result exit code through injected writers", async () => {
    const result = await runWezTermConfig({ argv: argv(), env: {}, platform: "linux" });
    const stdout: string[] = [];
    const stderr: string[] = [];

    expect(
      printWezTermConfigResult(result, {
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
      }),
    ).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("当前平台不支持生成 WezTerm 配置：linux");
  });
});
