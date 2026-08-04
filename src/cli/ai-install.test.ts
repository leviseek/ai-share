import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  formatInstalledToolDocs,
  formatInstallRunResult,
  resolveInstallExecutable,
  runInstall,
  type InstallCommand,
  type InstallCommandResult,
  type InstallRunResult,
  type InstallRunner,
} from "./ai-install.ts";

const result = {
  ok: true,
  tools: [
    { id: "opencode", label: "OpenCode CLI", installed: true },
    { id: "opencode-desktop", label: "OpenCode Desktop", installed: false },
    { id: "wezterm", label: "WezTerm", installed: false },
    { id: "openspec", label: "OpenSpec", installed: true },
    { id: "superpowers", label: "Superpowers", installed: true },
    { id: "codegraph", label: "CodeGraph", installed: true },
  ],
  hints: [{ kind: "configure-openspec", toolId: "openspec", command: "openspec", args: ["init"] }],
} satisfies InstallRunResult;

describe("install output boundaries", () => {
  test("check output excludes session usage and keeps initialization guidance", () => {
    const output = formatInstallRunResult(result, false);

    expect(output).not.toContain("使用提示");
    expect(output).not.toContain("会话使用");
    expect(output).toContain("配置提示");
    expect(output).toContain("openspec init");
  });

  test("tool docs include only installed tools and session usage", () => {
    const output = formatInstalledToolDocs(result, false);

    expect(output).toContain("工具使用提示");
    expect(output).toContain("OpenSpec");
    expect(output).toContain("CodeGraph");
    expect(output).toContain("Superpowers");
    expect(output).not.toContain("OpenCode Desktop");
    expect(output).not.toContain("安装指令");
    expect(output).not.toContain("配置提示");
  });

  test("tool docs report detection failures in Chinese", () => {
    expect(formatInstalledToolDocs({ ok: false, error: new Error("boom") }, false)).toBe("检测失败：boom");
  });
});

type RunnerHandlers = Record<string, (command: InstallCommand) => InstallCommandResult>;

function createRunner(handlers: RunnerHandlers): { runner: InstallRunner; calls: InstallCommand[] } {
  const calls: InstallCommand[] = [];
  const runner: InstallRunner = (command: InstallCommand): Promise<InstallCommandResult> => {
    calls.push(command);
    const key = `${command.command} ${command.args.join(" ")}`;
    const handler = handlers[key];
    if (!handler) return Promise.resolve({ status: 0, stdout: "", stderr: "" });
    return Promise.resolve(handler(command));
  };
  return { runner, calls };
}

function createFixture(): { root: string; env: Record<string, string | undefined>; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "ai-share-ai-install-"));
  write(join(root, "config", "global.yaml"), "model: gpt-5.5\nprovider: codexapis\n");
  write(
    join(root, "config", "provider.yaml"),
    [
      "providers:",
      "  codexapis:",
      "    name: Codex APIs",
      "    base_url: https://codex.example.test/v1",
      "    api_key: ${CODEXAPIS_API_KEY}",
      "    models: [gpt-5.5]",
      "    default_model: gpt-5.5",
      "",
    ].join("\n"),
  );
  write(join(root, "config", "models.yaml"), "gpt-5.5:\n  model_name: gpt-5.5\n");
  write(join(root, "config", "mcp.yaml"), "servers: {}\n");
  write(join(root, "config", "env.yaml"), "variables: {}\n");
  write(join(root, "config", "agents.yaml"), "agents: {}\n");
  write(join(root, "config", "plugins.yaml"), "plugins: []\n");
  return {
    root,
    env: {
      HOME: join(root, "home"),
      OPENCODE_CONFIG_DIR: join(root, "opencode"),
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function isBunGlobalQuery(call: InstallCommand): boolean {
  return (
    call.command === "bun" &&
    call.args.length === 3 &&
    call.args[0] === "pm" &&
    call.args[1] === "ls" &&
    call.args[2] === "--global"
  );
}

const BUN_GLOBAL_PACKAGES = [
  "C:\\Users\\test\\.bun\\install\\global node_modules (2)",
  "├── opencode-ai@1.18.13",
  "└── @fission-ai/openspec@1.7.0",
  "",
].join("\n");

describe("install tool detection", () => {
  test("captures the bun global query and detects opencode/openspec without pnpm", async () => {
    const fixture = createFixture();
    try {
      const { runner, calls } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: BUN_GLOBAL_PACKAGES, stderr: "" }),
        // opencode is missing here so recognition must come from the bun package
        // list alone, not from the `opencode --version` fallback signal.
        "opencode --version": () => ({
          status: null,
          stdout: "",
          stderr: "",
          error: new Error("Executable not found"),
        }),
        "brew list --cask --versions": () => ({ status: 0, stdout: "", stderr: "" }),
      });
      const result = await runInstall({
        projectRoot: fixture.root,
        env: fixture.env,
        platform: "darwin",
        runner,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const installedById = new Map(result.tools.map((tool) => [tool.id, tool.installed]));
      expect(installedById.get("opencode")).toBe(true);
      expect(installedById.get("openspec")).toBe(true);
      expect(installedById.get("codegraph")).toBe(false);
      const bunCall = calls.find(isBunGlobalQuery);
      expect(bunCall).toBeDefined();
      expect(bunCall?.cwd).toBe(tmpdir());
      expect(existsSync(bunCall?.cwd ?? "")).toBe(true);
      expect(calls.some((call) => call.command === "pnpm")).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("treats a bun empty global directory as no packages", async () => {
    const fixture = createFixture();
    try {
      const { runner } = createRunner({
        "bun pm ls --global": () => ({
          status: 1,
          stdout: "",
          stderr: "error: Lockfile not found. Please run `bun install`.",
        }),
        "opencode --version": () => ({
          status: null,
          stdout: "",
          stderr: "",
          error: new Error("Executable not found"),
        }),
        "brew list --cask --versions": () => ({ status: 0, stdout: "", stderr: "" }),
      });
      const result = await runInstall({
        projectRoot: fixture.root,
        env: fixture.env,
        platform: "darwin",
        runner,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools.find((tool) => tool.id === "opencode")?.installed).toBe(false);
      expect(result.tools.find((tool) => tool.id === "openspec")?.installed).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("treats a missing package.json as an empty bun global directory", async () => {
    const fixture = createFixture();
    try {
      const { runner } = createRunner({
        "bun pm ls --global": () => ({
          status: 1,
          stdout: "",
          stderr: "error: No package.json was found.",
        }),
        "opencode --version": () => ({
          status: null,
          stdout: "",
          stderr: "",
          error: new Error("Executable not found"),
        }),
        "brew list --cask --versions": () => ({ status: 0, stdout: "", stderr: "" }),
      });
      const result = await runInstall({
        projectRoot: fixture.root,
        env: fixture.env,
        platform: "darwin",
        runner,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools.find((tool) => tool.id === "opencode")?.installed).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("propagates unexpected bun failures with a Chinese failure message", async () => {
    const fixture = createFixture();
    try {
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 2, stdout: "", stderr: "internal error" }),
        "opencode --version": () => ({ status: 0, stdout: "1.18.13\n", stderr: "" }),
        "brew list --cask --versions": () => ({ status: 0, stdout: "", stderr: "" }),
      });
      const result = await runInstall({
        projectRoot: fixture.root,
        env: fixture.env,
        platform: "darwin",
        runner,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      const message = result.error instanceof Error ? result.error.message : String(result.error);
      expect(message).toContain("bun pm ls --global 执行失败");
    } finally {
      fixture.cleanup();
    }
  });

  test("propagates a missing bun executable as a failure", async () => {
    const fixture = createFixture();
    try {
      const { runner } = createRunner({
        "bun pm ls --global": () => ({
          status: null,
          stdout: "",
          stderr: "",
          error: new Error("Executable not found"),
        }),
        "opencode --version": () => ({ status: 0, stdout: "1.18.13\n", stderr: "" }),
        "brew list --cask --versions": () => ({ status: 0, stdout: "", stderr: "" }),
      });
      const result = await runInstall({
        projectRoot: fixture.root,
        env: fixture.env,
        platform: "darwin",
        runner,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      const message = result.error instanceof Error ? result.error.message : String(result.error);
      expect(message).toContain("bun pm ls --global 执行失败");
    } finally {
      fixture.cleanup();
    }
  });

  test("keeps opencode --version as an installation signal", async () => {
    const fixture = createFixture();
    try {
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: "C:\\global node_modules (0)\n", stderr: "" }),
        "opencode --version": () => ({ status: 0, stdout: "1.18.13\n", stderr: "" }),
        "brew list --cask --versions": () => ({ status: 0, stdout: "", stderr: "" }),
      });
      const result = await runInstall({
        projectRoot: fixture.root,
        env: fixture.env,
        platform: "darwin",
        runner,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools.find((tool) => tool.id === "opencode")?.installed).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});

describe("resolveInstallExecutable", () => {
  test("keeps scoop.cmd on Windows but leaves bun and pnpm unchanged", () => {
    expect(resolveInstallExecutable("win32", "scoop")).toBe("scoop.cmd");
    expect(resolveInstallExecutable("win32", "bun")).toBe("bun");
    expect(resolveInstallExecutable("win32", "pnpm")).toBe("pnpm");
    expect(resolveInstallExecutable("darwin", "scoop")).toBe("scoop");
    expect(resolveInstallExecutable("darwin", "bun")).toBe("bun");
  });
});
