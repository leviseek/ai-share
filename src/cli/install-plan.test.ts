import { describe, expect, test } from "bun:test";
import type { ToolSource } from "../types.ts";
import {
  buildInstallActions,
  buildInstallHints,
  buildInstalledToolIds,
  collectScoopGlobalIds,
  parseBunGlobalPackages,
  parseBrewCaskInstalled,
  parseScoopInstalled,
  type InstallToolId,
} from "./install-plan.ts";

const TOOLS = [
  {
    id: "opencode",
    label: "OpenCode CLI",
    package: "opencode-ai",
    executable: "opencode",
    required: true,
    version: "latest",
    platforms: { win32: { manager: "bun" }, darwin: { manager: "bun" }, linux: { manager: "bun" } },
  },
  {
    id: "opencode-desktop",
    label: "OpenCode Desktop",
    package: "opencode-desktop",
    executable: "opencode-desktop",
    required: true,
    version: "latest",
    platforms: { win32: { manager: "scoop" }, darwin: { manager: "brew" } },
  },
  {
    id: "wezterm",
    label: "WezTerm",
    package: "wezterm",
    executable: "wezterm",
    required: true,
    version: "latest",
    platforms: { win32: { manager: "scoop" }, darwin: { manager: "brew" } },
  },
  {
    id: "openspec",
    label: "OpenSpec",
    package: "@fission-ai/openspec",
    executable: "openspec",
    required: false,
    version: "latest",
    platforms: { win32: { manager: "bun" }, darwin: { manager: "bun" }, linux: { manager: "bun" } },
  },
  {
    id: "codegraph",
    label: "CodeGraph",
    package: "@colbymchenry/codegraph",
    executable: "codegraph",
    required: false,
    version: "latest",
    platforms: { win32: { manager: "bun" }, darwin: { manager: "bun" }, linux: { manager: "bun" } },
  },
  {
    id: "typescript",
    label: "TypeScript",
    package: "typescript",
    executable: "tsc",
    required: false,
    version: "latest",
    platforms: { win32: { manager: "bun" }, darwin: { manager: "bun" }, linux: { manager: "bun" } },
  },
  {
    id: "typescript-language-server",
    label: "TypeScript Language Server",
    package: "typescript-language-server",
    executable: "typescript-language-server",
    required: false,
    version: "latest",
    platforms: { win32: { manager: "bun" }, darwin: { manager: "bun" }, linux: { manager: "bun" } },
  },
] as const satisfies readonly ToolSource[];

describe("parseBunGlobalPackages", () => {
  test("parses plain, scoped, and multiple packages", () => {
    const text = [
      "C:\\Users\\test\\.bun\\install\\global node_modules (3)",
      "├── @colbymchenry/codegraph@1.5.0",
      "├── @fission-ai/openspec@1.7.0",
      "└── opencode-ai@1.18.13",
      "",
    ].join("\n");

    expect(parseBunGlobalPackages(text)).toEqual(
      new Set(["@colbymchenry/codegraph", "@fission-ai/openspec", "opencode-ai"]),
    );
  });

  test("returns an empty set for empty output and a zero-count list", () => {
    expect(parseBunGlobalPackages("")).toEqual(new Set());
    expect(parseBunGlobalPackages("C:\\global node_modules (0)\n")).toEqual(new Set());
  });

  test("strips ANSI before parsing", () => {
    const text = "\u001b[32mC:\\global node_modules (1)\u001b[0m\n\u001b[32m└── opencode-ai@1.18.13\u001b[0m\n";
    expect(parseBunGlobalPackages(text)).toEqual(new Set(["opencode-ai"]));
  });

  test("rejects malformed output and entries without versions", () => {
    expect(() => parseBunGlobalPackages("random garbage")).toThrow("Bun 全局包列表解析失败：输出格式无效。");
    expect(() => parseBunGlobalPackages("C:\\global node_modules (1)\n└── opencode-ai\n")).toThrow(
      "Bun 全局包列表解析失败：包条目格式无效。",
    );
  });

  test("rejects a header-like line with a trailing suffix instead of treating it as a header", () => {
    expect(() => parseBunGlobalPackages("warning: node_modules (1) parse failed\n")).toThrow(
      "Bun 全局包列表解析失败：输出格式无效。",
    );
  });

  test("rejects a tree entry that mimics the header format", () => {
    expect(() => parseBunGlobalPackages("C:\\global node_modules (1)\n└── node_modules (1)\n")).toThrow(
      "Bun 全局包列表解析失败：包条目格式无效。",
    );
  });

  test("accepts a macOS/Unix absolute path header", () => {
    const text = [
      "/Users/test/.bun/install/global node_modules (2)",
      "├── opencode-ai@1.18.13",
      "└── @fission-ai/openspec@1.7.0",
      "",
    ].join("\n");

    expect(parseBunGlobalPackages(text)).toEqual(new Set(["opencode-ai", "@fission-ai/openspec"]));
  });

  test("rejects a tree entry without a preceding header", () => {
    expect(() => parseBunGlobalPackages("├── opencode-ai@1.18.13\n")).toThrow("Bun 全局包列表解析失败：输出格式无效。");
  });

  test("rejects a warning-prefixed pseudo header", () => {
    expect(() => parseBunGlobalPackages("warning: node_modules (1)\n└── opencode-ai@1.18.13\n")).toThrow(
      "Bun 全局包列表解析失败：输出格式无效。",
    );
  });

  test("rejects a duplicate header after tree entries", () => {
    expect(() =>
      parseBunGlobalPackages(
        ["C:\\global node_modules (1)", "└── opencode-ai@1.18.13", "C:\\global node_modules (1)", ""].join("\n"),
      ),
    ).toThrow("Bun 全局包列表解析失败：输出格式无效。");
  });

  test("rejects a different header appearing after tree entries", () => {
    expect(() =>
      parseBunGlobalPackages(
        ["C:\\global node_modules (1)", "└── opencode-ai@1.18.13", "D:\\other node_modules (1)", ""].join("\n"),
      ),
    ).toThrow("Bun 全局包列表解析失败：输出格式无效。");
  });
});

describe("buildInstallActions", () => {
  const toolIds: InstallToolId[] = ["opencode", "openspec", "codegraph"];

  test("builds configured TypeScript and language server Bun actions on Linux", () => {
    const actions = buildInstallActions({
      tools: TOOLS,
      platform: "linux",
      selectedIds: new Set<InstallToolId>(["typescript", "typescript-language-server"]),
      installedIds: new Set<InstallToolId>(),
      upgradeIds: new Set<InstallToolId>(),
      scoopExtrasAvailable: true,
    });

    expect(actions).toContainEqual({
      kind: "command",
      toolId: "typescript",
      operation: "install",
      command: "bun",
      args: ["install", "--global", "typescript@latest"],
    });
    expect(actions).toContainEqual({
      kind: "command",
      toolId: "typescript-language-server",
      operation: "install",
      command: "bun",
      args: ["install", "--global", "typescript-language-server@latest"],
    });
  });

  test("keeps existing Bun install and upgrade command semantics", () => {
    const installActions = buildInstallActions({
      tools: TOOLS,
      platform: "darwin",
      selectedIds: new Set<InstallToolId>(toolIds),
      installedIds: new Set<InstallToolId>(),
      upgradeIds: new Set<InstallToolId>(),
      scoopExtrasAvailable: true,
    });
    const upgradeActions = buildInstallActions({
      tools: TOOLS,
      platform: "win32",
      selectedIds: new Set<InstallToolId>(toolIds),
      installedIds: new Set<InstallToolId>(toolIds),
      upgradeIds: new Set<InstallToolId>(toolIds),
      scoopExtrasAvailable: true,
    });

    expect(installActions).toContainEqual({
      kind: "command",
      toolId: "opencode",
      operation: "install",
      command: "bun",
      args: ["install", "--global", "opencode-ai@latest"],
    });
    expect(installActions).toContainEqual({
      kind: "command",
      toolId: "openspec",
      operation: "install",
      command: "bun",
      args: ["install", "--global", "@fission-ai/openspec@latest"],
    });
    expect(installActions).toContainEqual({
      kind: "command",
      toolId: "codegraph",
      operation: "install",
      command: "bun",
      args: ["install", "--global", "@colbymchenry/codegraph@latest"],
    });
    expect(upgradeActions).toContainEqual({
      kind: "command",
      toolId: "opencode",
      operation: "upgrade",
      command: "bun",
      args: ["install", "--global", "opencode-ai@latest"],
    });
    expect(upgradeActions).toContainEqual({
      kind: "command",
      toolId: "openspec",
      operation: "upgrade",
      command: "bun",
      args: ["install", "--global", "@fission-ai/openspec@latest"],
    });
    expect(upgradeActions).toContainEqual({
      kind: "command",
      toolId: "codegraph",
      operation: "upgrade",
      command: "bun",
      args: ["install", "--global", "@colbymchenry/codegraph@latest"],
    });
  });

  test("builds Scoop extras and global actions from the Windows manager mapping", () => {
    const actions = buildInstallActions({
      tools: TOOLS,
      platform: "win32",
      selectedIds: new Set<InstallToolId>(),
      installedIds: new Set<InstallToolId>(),
      upgradeIds: new Set<InstallToolId>(),
      scoopExtrasAvailable: false,
      scoopGlobalIds: new Set<InstallToolId>(["wezterm"]),
    });

    expect(actions).toContainEqual({
      kind: "prepare-scoop-extras",
      command: "scoop",
      args: ["bucket", "add", "extras"],
    });
    expect(actions).toContainEqual({
      kind: "command",
      toolId: "wezterm",
      operation: "install",
      command: "scoop",
      args: ["install", "wezterm", "--global"],
    });
    expect(actions.filter((action) => action.kind === "prepare-scoop-extras")).toHaveLength(1);
  });

  test("builds a Homebrew cask upgrade from the macOS manager mapping", () => {
    const actions = buildInstallActions({
      tools: TOOLS,
      platform: "darwin",
      selectedIds: new Set<InstallToolId>(),
      installedIds: new Set<InstallToolId>(["wezterm"]),
      upgradeIds: new Set<InstallToolId>(["wezterm"]),
      scoopExtrasAvailable: true,
    });

    expect(actions).toContainEqual({
      kind: "command",
      toolId: "wezterm",
      operation: "upgrade",
      command: "brew",
      args: ["upgrade", "--cask", "wezterm"],
    });
  });

  test("skips a selected tool with no current-platform manager mapping", () => {
    const actions = buildInstallActions({
      tools: TOOLS,
      platform: "linux",
      selectedIds: new Set<InstallToolId>(["wezterm"]),
      installedIds: new Set<InstallToolId>(),
      upgradeIds: new Set<InstallToolId>(),
      scoopExtrasAvailable: true,
    });

    expect(actions.some((action) => "toolId" in action && action.toolId === "wezterm")).toBe(false);
  });

  test("keeps Superpowers as a plugin-only configure action", () => {
    const actions = buildInstallActions({
      tools: TOOLS,
      platform: "linux",
      selectedIds: new Set<InstallToolId>(["superpowers"]),
      installedIds: new Set<InstallToolId>(),
      upgradeIds: new Set<InstallToolId>(),
      scoopExtrasAvailable: true,
    });

    expect(actions).toContainEqual({ kind: "configure-superpowers", toolId: "superpowers", operation: "install" });
    expect(actions.some((action) => action.kind === "command" && action.toolId === "superpowers")).toBe(false);
  });
});

describe("buildInstallHints", () => {
  test("reuses the tool action command and args for npm tool hints", () => {
    const hints = buildInstallHints(
      "darwin",
      TOOLS,
      new Set<InstallToolId>(["opencode", "openspec", "codegraph"]),
      true,
    );

    expect(hints).toContainEqual({
      kind: "command",
      toolId: "opencode",
      command: "bun",
      args: ["install", "--global", "opencode-ai@latest"],
    });
    expect(hints).toContainEqual({
      kind: "command",
      toolId: "openspec",
      command: "bun",
      args: ["install", "--global", "@fission-ai/openspec@latest"],
    });
    expect(hints).toContainEqual({
      kind: "command",
      toolId: "codegraph",
      command: "bun",
      args: ["install", "--global", "@colbymchenry/codegraph@latest"],
    });
  });

  test("hint for opencode matches the install action command and args exactly", () => {
    const hints = buildInstallHints("win32", TOOLS, new Set<InstallToolId>(["opencode"]), true);
    const actions = buildInstallActions({
      tools: TOOLS,
      platform: "win32",
      selectedIds: new Set<InstallToolId>(["opencode"]),
      installedIds: new Set<InstallToolId>(),
      upgradeIds: new Set<InstallToolId>(),
      scoopExtrasAvailable: true,
    });
    const hint = hints.find((candidate) => candidate.kind === "command" && candidate.toolId === "opencode");
    const action = actions.find((candidate) => candidate.kind === "command" && candidate.toolId === "opencode");

    expect(hint).toBeDefined();
    expect(action).toBeDefined();
    if (hint?.kind !== "command" || action?.kind !== "command") return;
    expect(hint.command).toBe(action.command);
    expect(hint.args).toEqual(action.args);
    expect(hint).not.toHaveProperty("operation");
  });

  test("keeps Superpowers as a configure hint without a command hint", () => {
    const hints = buildInstallHints("linux", TOOLS, new Set<InstallToolId>(["superpowers"]));

    expect(hints).toEqual([
      {
        kind: "configure-superpowers",
        toolId: "superpowers",
        pluginSpec: "superpowers@git+https://github.com/obra/superpowers.git",
      },
    ]);
  });
});

describe("buildInstalledToolIds", () => {
  test("maps bun global packages to npm tool ids", () => {
    const installed = buildInstalledToolIds({
      tools: TOOLS,
      platform: "darwin",
      bunPackages: new Set(["opencode-ai", "@fission-ai/openspec", "@colbymchenry/codegraph"]),
      scoopPackages: new Set(),
      brewPackages: new Set(),
      pluginSpecs: [],
    });

    expect(installed.has("opencode")).toBe(true);
    expect(installed.has("openspec")).toBe(true);
    expect(installed.has("codegraph")).toBe(true);
  });

  test("does not mark npm tools installed from a system package list", () => {
    const installed = buildInstalledToolIds({
      tools: TOOLS,
      platform: "win32",
      bunPackages: new Set(),
      scoopPackages: new Set(["opencode"]),
      brewPackages: new Set(),
      pluginSpecs: [],
    });

    expect(installed.has("opencode")).toBe(false);
    expect(installed.has("openspec")).toBe(false);
    expect(installed.has("codegraph")).toBe(false);
  });

  test("detects a configured package when its executable has a different name", () => {
    const executableOnly = buildInstalledToolIds({
      tools: TOOLS,
      platform: "linux",
      bunPackages: new Set(["tsc"]),
      scoopPackages: new Set(),
      brewPackages: new Set(),
      pluginSpecs: [],
    });
    const packageInstalled = buildInstalledToolIds({
      tools: TOOLS,
      platform: "linux",
      bunPackages: new Set(["typescript"]),
      scoopPackages: new Set(),
      brewPackages: new Set(),
      pluginSpecs: [],
    });

    expect(executableOnly.has("typescript")).toBe(false);
    expect(packageInstalled.has("typescript")).toBe(true);
  });

  test("rejects an unknown Node platform instead of silently skipping detection", () => {
    expect(() =>
      buildInstalledToolIds({
        tools: TOOLS,
        platform: "freebsd",
        bunPackages: new Set(),
        scoopPackages: new Set(),
        brewPackages: new Set(),
        pluginSpecs: [],
      }),
    ).toThrow("ai:install 不支持当前平台：freebsd");
  });

  test("detects Superpowers from the canonical plugin spec independently of tools YAML", () => {
    const installed = buildInstalledToolIds({
      tools: [],
      platform: "linux",
      bunPackages: new Set(),
      scoopPackages: new Set(),
      brewPackages: new Set(),
      pluginSpecs: ["superpowers@git+https://github.com/obra/superpowers.git"],
    });

    expect(installed).toEqual(new Set(["superpowers"]));
  });

  test.each([
    ["win32", "brew", "brew-package", "scoop-package"],
    ["darwin", "scoop", "scoop-package", "brew-package"],
    ["linux", "brew", "brew-package", "scoop-package"],
  ] as const)(
    "uses the exact configured manager for %s + %s detection",
    (platform, manager, packageName, otherPackage) => {
      const tool = {
        id: "cross-manager-tool",
        label: "Cross Manager Tool",
        package: packageName,
        executable: "cross-manager-tool",
        required: true,
        version: "latest",
        platforms: { [platform]: { manager } },
      } as const satisfies ToolSource;
      const installed = buildInstalledToolIds({
        tools: [tool],
        platform,
        bunPackages: new Set([otherPackage]),
        scoopPackages: new Set(["scoop-package"]),
        brewPackages: new Set(["brew-package"]),
        pluginSpecs: [],
      });

      expect(installed).toEqual(new Set(["cross-manager-tool"]));
    },
  );
});

describe("parseScoopInstalled", () => {
  test("recognizes package candidates from the current configured tool set", () => {
    const dynamicTool = {
      id: "terminal-preview",
      label: "Terminal Preview",
      package: "terminal-preview-package",
      executable: "terminal-preview",
      required: false,
      version: "latest",
      platforms: { win32: { manager: "scoop" } },
    } as const satisfies ToolSource;
    const output = [
      "Installed apps:",
      "",
      "Name                     Version Source Updated             Info",
      "----                     ------- ------ -------             ----",
      "terminal-preview-package 1.0.0   extras 2026-08-05 12:00:00 global install",
      "",
    ].join("\n");

    const packages = parseScoopInstalled(output, [dynamicTool]);
    expect(packages).toEqual(new Map([["terminal-preview-package", { global: true }]]));
    expect(collectScoopGlobalIds(packages, [dynamicTool])).toEqual(new Set(["terminal-preview"]));
  });

  test("requires the configured tool collection for Scoop and Brew parsing", () => {
    const scoopOutput = [
      "Installed apps:",
      "",
      "Name Version Source Updated Info",
      "---- ------- ------ ------- ----",
      "wezterm 1.0.0 extras 2026-08-05 global install",
    ].join("\n");

    expect(() => {
      Reflect.apply(parseScoopInstalled, undefined, [scoopOutput]);
    }).toThrow("Scoop 应用列表解析失败：必须提供工具配置。");
    expect(() => {
      Reflect.apply(parseBrewCaskInstalled, undefined, ["wezterm 2026.1"]);
    }).toThrow("Homebrew Cask 列表解析失败：必须提供工具配置。");
  });
});
