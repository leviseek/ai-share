import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ToolSource } from "../types.ts";
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
import { buildInstallActions } from "./install-plan.ts";

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
  scoopGlobalIds: new Set<string>(),
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

  test("tool docs keep known session guidance without adding TypeScript or LSP guidance", () => {
    const output = formatInstalledToolDocs(
      {
        ok: true,
        tools: [
          { id: "typescript", label: "TypeScript", installed: true },
          { id: "typescript-language-server", label: "TypeScript Language Server", installed: true },
          { id: "openspec", label: "OpenSpec", installed: true },
          { id: "codegraph", label: "CodeGraph", installed: true },
          { id: "superpowers", label: "Superpowers", installed: true },
        ],
        hints: [],
        scoopGlobalIds: new Set<string>(),
      },
      false,
    );

    expect(output).toContain("OpenSpec");
    expect(output).toContain("CodeGraph");
    expect(output).toContain("Superpowers");
    expect(output).not.toContain("TypeScript");
    expect(output).not.toContain("Language Server");
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
  write(
    join(root, "config", "tools.yaml"),
    [
      "tools:",
      "  - id: opencode",
      "    label: OpenCode CLI",
      "    package: opencode-ai",
      "    executable: opencode",
      "    required: true",
      "    version: latest",
      "    platforms:",
      "      darwin:",
      "        manager: bun",
      "  - id: openspec",
      "    label: OpenSpec",
      "    package: '@fission-ai/openspec'",
      "    executable: openspec",
      "    required: false",
      "    version: latest",
      "    platforms:",
      "      darwin:",
      "        manager: bun",
      "  - id: codegraph",
      "    label: CodeGraph",
      "    package: '@colbymchenry/codegraph'",
      "    executable: codegraph",
      "    required: false",
      "    version: latest",
      "    platforms:",
      "      darwin:",
      "        manager: bun",
      "",
    ].join("\n"),
  );
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
  test("runInstall marks configured TypeScript and language server packages as installed", async () => {
    const fixture = createFixture();
    try {
      write(
        join(fixture.root, "config", "tools.yaml"),
        [
          "tools:",
          "  - id: typescript",
          "    label: TypeScript",
          "    package: typescript",
          "    executable: tsc",
          "    required: false",
          "    version: latest",
          "    platforms:",
          "      darwin:",
          "        manager: bun",
          "  - id: typescript-language-server",
          "    label: TypeScript Language Server",
          "    package: typescript-language-server",
          "    executable: typescript-language-server",
          "    required: false",
          "    version: latest",
          "    platforms:",
          "      darwin:",
          "        manager: bun",
          "",
        ].join("\n"),
      );
      const { runner } = createRunner({
        "bun pm ls --global": () => ({
          status: 0,
          stdout: [
            "/Users/test/.bun/install/global node_modules (2)",
            "├── typescript@5.9.2",
            "└── typescript-language-server@5.1.3",
            "",
          ].join("\n"),
          stderr: "",
        }),
      });

      const result = await runInstall({ projectRoot: fixture.root, env: fixture.env, platform: "darwin", runner });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools).toEqual([
        { id: "typescript", label: "TypeScript", installed: true },
        { id: "typescript-language-server", label: "TypeScript Language Server", installed: true },
        { id: "superpowers", label: "Superpowers", installed: false },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  test("runInstall builds package-based Bun hints for missing TypeScript tools", async () => {
    const fixture = createFixture();
    try {
      write(
        join(fixture.root, "config", "tools.yaml"),
        [
          "tools:",
          "  - id: typescript",
          "    label: TypeScript",
          "    package: typescript",
          "    executable: tsc",
          "    required: false",
          "    version: latest",
          "    platforms:",
          "      darwin:",
          "        manager: bun",
          "  - id: typescript-language-server",
          "    label: TypeScript Language Server",
          "    package: typescript-language-server",
          "    executable: typescript-language-server",
          "    required: false",
          "    version: latest",
          "    platforms:",
          "      darwin:",
          "        manager: bun",
          "",
        ].join("\n"),
      );
      const { runner } = createRunner({
        "bun pm ls --global": () => ({
          status: 0,
          stdout: "/Users/test/.bun/install/global node_modules (0)\n",
          stderr: "",
        }),
      });

      const result = await runInstall({ projectRoot: fixture.root, env: fixture.env, platform: "darwin", runner });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const output = formatInstallRunResult(result, false);
      expect(output).toContain("bun install --global typescript@latest");
      expect(output).toContain("bun install --global typescript-language-server@latest");
    } finally {
      fixture.cleanup();
    }
  });

  test("missing Superpowers remains a plugin configuration hint", async () => {
    const fixture = createFixture();
    try {
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: BUN_GLOBAL_PACKAGES, stderr: "" }),
        "opencode --version": () => ({ status: 0, stdout: "1.18.13\n", stderr: "" }),
      });

      const result = await runInstall({ projectRoot: fixture.root, env: fixture.env, platform: "darwin", runner });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const output = formatInstallRunResult(result, false);
      expect(output).toContain("请执行 bun run ai:gen，并在可选插件配置步骤中选择 Superpowers");
      expect(output).not.toContain("bun install --global superpowers");
    } finally {
      fixture.cleanup();
    }
  });

  test("does not detect Superpowers text outside the top-level plugin array", async () => {
    const fixture = createFixture();
    try {
      write(
        join(fixture.env.OPENCODE_CONFIG_DIR ?? "", "opencode.jsonc"),
        [
          "{",
          '  "agent": {',
          '    "reviewer": { "description": "Superpowers is mentioned here", "prompt": "Use Superpowers" }',
          "  }",
          "}",
          "",
        ].join("\n"),
      );
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: BUN_GLOBAL_PACKAGES, stderr: "" }),
      });

      const result = await runInstall({ projectRoot: fixture.root, env: fixture.env, platform: "darwin", runner });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools.find((tool) => tool.id === "superpowers")?.installed).toBe(false);
      expect(result.hints.some((hint) => hint.kind === "configure-superpowers")).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  test("detects Superpowers only from the exact canonical top-level plugin entry", async () => {
    const fixture = createFixture();
    try {
      write(
        join(fixture.env.OPENCODE_CONFIG_DIR ?? "", "opencode.jsonc"),
        [
          "{",
          "  // This comment is not a plugin declaration.",
          '  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]',
          "}",
          "",
        ].join("\n"),
      );
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: BUN_GLOBAL_PACKAGES, stderr: "" }),
      });

      const result = await runInstall({ projectRoot: fixture.root, env: fixture.env, platform: "darwin", runner });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools.find((tool) => tool.id === "superpowers")?.installed).toBe(true);
      expect(result.hints.some((hint) => hint.kind === "configure-superpowers")).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("detects Superpowers from commented JSONC with a trailing comma", async () => {
    const fixture = createFixture();
    try {
      write(
        join(fixture.env.OPENCODE_CONFIG_DIR ?? "", "opencode.jsonc"),
        [
          "{",
          '  "description": "Keep // and /* markers inside strings",',
          "  /* The plugin array is valid JSONC. */",
          '  "plugin": [',
          '    "superpowers@git+https://github.com/obra/superpowers.git", // canonical plugin',
          "  ],",
          "}",
          "",
        ].join("\n"),
      );
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: BUN_GLOBAL_PACKAGES, stderr: "" }),
      });

      const result = await runInstall({ projectRoot: fixture.root, env: fixture.env, platform: "darwin", runner });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools.find((tool) => tool.id === "superpowers")?.installed).toBe(true);
      expect(result.hints.some((hint) => hint.kind === "configure-superpowers")).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("ignores packages configured for another platform when parsing the current manager", async () => {
    const fixture = createFixture();
    try {
      write(
        join(fixture.root, "config", "tools.yaml"),
        [
          "tools:",
          "  - id: current-scoop-tool",
          "    label: Current Scoop Tool",
          "    package: current-scoop-package",
          "    executable: current-scoop-tool",
          "    required: true",
          "    version: latest",
          "    platforms:",
          "      win32:",
          "        manager: scoop",
          "  - id: foreign-scoop-tool",
          "    label: Foreign Scoop Tool",
          "    package: foreign-scoop-package",
          "    executable: foreign-scoop-tool",
          "    required: true",
          "    version: latest",
          "    platforms:",
          "      darwin:",
          "        manager: scoop",
          "",
        ].join("\n"),
      );
      const scoopList = [
        "Installed apps:",
        "",
        "Name                     Version Source Updated             Info",
        "----                     ------- ------ -------             ----",
        "current-scoop-package   1.0.0   main   2026-08-05 12:00:00 global install",
        "foreign-scoop-package",
        "",
      ].join("\n");
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: "C:\\global node_modules (0)\n", stderr: "" }),
        "scoop list": () => ({ status: 0, stdout: scoopList, stderr: "" }),
        "scoop bucket list": () => ({ status: 0, stdout: "", stderr: "" }),
      });

      const result = await runInstall({ projectRoot: fixture.root, env: fixture.env, platform: "win32", runner });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools).toEqual([
        { id: "current-scoop-tool", label: "Current Scoop Tool", installed: true },
        { id: "superpowers", label: "Superpowers", installed: false },
      ]);
      expect(result.scoopGlobalIds).toEqual(new Set(["current-scoop-tool"]));
    } finally {
      fixture.cleanup();
    }
  });

  test("does not emit OpenSpec or follow-up hints when the overlay removes OpenSpec", async () => {
    const fixture = createFixture();
    try {
      write(
        join(fixture.root, "config", "tools.yaml"),
        [
          "tools:",
          "  - id: opencode",
          "    label: OpenCode CLI",
          "    package: opencode-ai",
          "    executable: opencode",
          "    required: true",
          "    version: latest",
          "    platforms:",
          "      darwin:",
          "        manager: bun",
          "",
        ].join("\n"),
      );
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: BUN_GLOBAL_PACKAGES, stderr: "" }),
      });

      const result = await runInstall({ projectRoot: fixture.root, env: fixture.env, platform: "darwin", runner });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.hints.some((hint) => hint.kind.startsWith("configure-openspec"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("does not emit OpenSpec hints when the current platform has no OpenSpec mapping", async () => {
    const fixture = createFixture();
    try {
      write(
        join(fixture.root, "config", "tools.yaml"),
        [
          "tools:",
          "  - id: opencode",
          "    label: OpenCode CLI",
          "    package: opencode-ai",
          "    executable: opencode",
          "    required: true",
          "    version: latest",
          "    platforms:",
          "      win32:",
          "        manager: bun",
          "  - id: openspec",
          "    label: OpenSpec",
          "    package: '@fission-ai/openspec'",
          "    executable: openspec",
          "    required: false",
          "    version: latest",
          "    platforms:",
          "      darwin:",
          "        manager: bun",
          "",
        ].join("\n"),
      );
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: BUN_GLOBAL_PACKAGES, stderr: "" }),
      });

      const result = await runInstall({ projectRoot: fixture.root, env: fixture.env, platform: "win32", runner });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.hints.some((hint) => hint.kind.startsWith("configure-openspec"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test.each([
    ["win32", "brew", "brew list --cask --versions", "cross-manager-package 1.0.0", "scoop"],
    [
      "darwin",
      "scoop",
      "scoop list",
      "Installed apps:\n\nName Version Source Updated Info\n---- ------- ------ ------- ----\ncross-manager-package 1.0.0 main 2026-08-05 global install",
      "brew",
    ],
    ["linux", "brew", "brew list --cask --versions", "cross-manager-package 1.0.0", "scoop"],
  ] as const)(
    "uses the declared %s manager on %s without probing %s",
    async (platform, manager, probe, output, unwanted) => {
      const fixture = createFixture();
      try {
        write(
          join(fixture.root, "config", "tools.yaml"),
          [
            "tools:",
            "  - id: cross-manager-tool",
            "    label: Cross Manager Tool",
            "    package: cross-manager-package",
            "    executable: cross-manager-tool",
            "    required: true",
            "    version: latest",
            "    platforms:",
            `      ${platform}:`,
            `        manager: ${manager}`,
            "",
          ].join("\n"),
        );
        const { runner, calls } = createRunner({
          "bun pm ls --global": () => ({ status: 0, stdout: "C:\\global node_modules (0)\n", stderr: "" }),
          "opencode --version": () => ({
            status: null,
            stdout: "",
            stderr: "",
            error: new Error("Executable not found"),
          }),
          [probe]: () => ({ status: 0, stdout: output, stderr: "" }),
        });

        const result = await runInstall({
          projectRoot: fixture.root,
          env: fixture.env,
          platform,
          runner,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tools.find((tool) => tool.id === "cross-manager-tool")?.installed).toBe(true);
        expect(calls.some((call) => call.command === unwanted)).toBe(false);
        expect(calls.some((call) => call.command === "bun" || call.command === "opencode")).toBe(false);
      } finally {
        fixture.cleanup();
      }
    },
  );

  test("on Linux reports and hints only tools with a Linux manager mapping", async () => {
    const fixture = createFixture();
    try {
      write(
        join(fixture.root, "config", "tools.yaml"),
        [
          "tools:",
          "  - id: opencode",
          "    label: OpenCode CLI",
          "    package: opencode-ai",
          "    executable: opencode",
          "    required: true",
          "    version: latest",
          "    platforms:",
          "      linux:",
          "        manager: bun",
          "  - id: opencode-desktop",
          "    label: OpenCode Desktop",
          "    package: opencode-desktop",
          "    executable: opencode-desktop",
          "    required: true",
          "    version: latest",
          "    platforms:",
          "      win32:",
          "        manager: scoop",
          "      darwin:",
          "        manager: brew",
          "  - id: wezterm",
          "    label: WezTerm",
          "    package: wezterm",
          "    executable: wezterm",
          "    required: true",
          "    version: latest",
          "    platforms:",
          "      win32:",
          "        manager: scoop",
          "      darwin:",
          "        manager: brew",
          "",
        ].join("\n"),
      );
      const { runner, calls } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: "/home/test/.bun/global node_modules (0)\n", stderr: "" }),
        "opencode --version": () => ({
          status: null,
          stdout: "",
          stderr: "",
          error: new Error("Executable not found"),
        }),
      });

      const result = await runInstall({
        projectRoot: fixture.root,
        env: fixture.env,
        platform: "linux",
        runner,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools.map((tool) => tool.id)).toEqual(["opencode", "superpowers"]);
      expect(result.hints.some((hint) => "toolId" in hint && hint.toolId === "opencode-desktop")).toBe(false);
      expect(result.hints.some((hint) => "toolId" in hint && hint.toolId === "wezterm")).toBe(false);
      expect(calls.some((call) => call.command === "scoop" || call.command === "brew")).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("preserves dynamic Scoop global metadata from package detection through upgrade action", async () => {
    const fixture = createFixture();
    const dynamicTool = {
      id: "terminal-preview",
      label: "Terminal Preview",
      package: "terminal-preview-package",
      executable: "terminal-preview",
      required: true,
      version: "latest",
      platforms: { win32: { manager: "scoop" } },
    } as const satisfies ToolSource;
    try {
      write(
        join(fixture.root, "config", "tools.yaml"),
        [
          "tools:",
          "  - id: terminal-preview",
          "    label: Terminal Preview",
          "    package: terminal-preview-package",
          "    executable: terminal-preview",
          "    required: true",
          "    version: latest",
          "    platforms:",
          "      win32:",
          "        manager: scoop",
          "",
        ].join("\n"),
      );
      const scoopList = [
        "Installed apps:",
        "",
        "Name                     Version Source Updated             Info",
        "----                     ------- ------ -------             ----",
        "terminal-preview-package 1.0.0   extras 2026-08-05 12:00:00 global install",
        "",
      ].join("\n");
      const { runner } = createRunner({
        "bun pm ls --global": () => ({ status: 0, stdout: "C:\\global node_modules (0)\n", stderr: "" }),
        "opencode --version": () => ({
          status: null,
          stdout: "",
          stderr: "",
          error: new Error("Executable not found"),
        }),
        "scoop list": () => ({ status: 0, stdout: scoopList, stderr: "" }),
        "scoop bucket list": () => ({
          status: 0,
          stdout: "extras https://github.com/ScoopInstaller/Extras\n",
          stderr: "",
        }),
      });

      const result = await runInstall({
        projectRoot: fixture.root,
        env: fixture.env,
        platform: "win32",
        runner,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tools.find((tool) => tool.id === "terminal-preview")?.installed).toBe(true);
      expect(result.scoopGlobalIds).toEqual(new Set(["terminal-preview"]));
      expect(
        buildInstallActions({
          tools: [dynamicTool],
          platform: "win32",
          selectedIds: new Set(["terminal-preview"]),
          installedIds: new Set(result.tools.filter((tool) => tool.installed).map((tool) => tool.id)),
          upgradeIds: new Set(["terminal-preview"]),
          scoopExtrasAvailable: true,
          scoopGlobalIds: result.scoopGlobalIds,
        }),
      ).toContainEqual({
        kind: "command",
        toolId: "terminal-preview",
        operation: "upgrade",
        command: "scoop",
        args: ["update", "terminal-preview-package", "--global"],
      });
    } finally {
      fixture.cleanup();
    }
  });

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

  test("does not treat a successful opencode --version as a package installation signal", async () => {
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
      expect(result.tools.find((tool) => tool.id === "opencode")?.installed).toBe(false);
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
