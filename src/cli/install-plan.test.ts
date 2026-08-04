import { describe, expect, test } from "bun:test";
import {
  buildInstallActions,
  buildInstallHints,
  buildInstalledToolIds,
  parseBunGlobalPackages,
  type InstallToolId,
} from "./install-plan.ts";

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

  test("uses bun install --global for install actions of npm tools", () => {
    const actions = buildInstallActions({
      platform: "darwin",
      selectedIds: new Set<InstallToolId>(toolIds),
      installedIds: new Set<InstallToolId>(),
      upgradeIds: new Set<InstallToolId>(),
      scoopExtrasAvailable: true,
    });

    expect(actions).toContainEqual({
      kind: "command",
      toolId: "opencode",
      operation: "install",
      command: "bun",
      args: ["install", "--global", "opencode-ai@latest"],
    });
    expect(actions).toContainEqual({
      kind: "command",
      toolId: "openspec",
      operation: "install",
      command: "bun",
      args: ["install", "--global", "@fission-ai/openspec@latest"],
    });
    expect(actions).toContainEqual({
      kind: "command",
      toolId: "codegraph",
      operation: "install",
      command: "bun",
      args: ["install", "--global", "@colbymchenry/codegraph@latest"],
    });
  });

  test("uses bun install --global for upgrade actions of npm tools", () => {
    const actions = buildInstallActions({
      platform: "win32",
      selectedIds: new Set<InstallToolId>(toolIds),
      installedIds: new Set<InstallToolId>(toolIds),
      upgradeIds: new Set<InstallToolId>(toolIds),
      scoopExtrasAvailable: true,
    });

    expect(actions).toContainEqual({
      kind: "command",
      toolId: "opencode",
      operation: "upgrade",
      command: "bun",
      args: ["install", "--global", "opencode-ai@latest"],
    });
    expect(actions).toContainEqual({
      kind: "command",
      toolId: "openspec",
      operation: "upgrade",
      command: "bun",
      args: ["install", "--global", "@fission-ai/openspec@latest"],
    });
    expect(actions).toContainEqual({
      kind: "command",
      toolId: "codegraph",
      operation: "upgrade",
      command: "bun",
      args: ["install", "--global", "@colbymchenry/codegraph@latest"],
    });
  });
});

describe("buildInstallHints", () => {
  test("reuses the tool action command and args for npm tool hints", () => {
    const hints = buildInstallHints("darwin", new Set<InstallToolId>(["opencode", "openspec", "codegraph"]), true);

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
    const hints = buildInstallHints("win32", new Set<InstallToolId>(["opencode"]), true);
    const actions = buildInstallActions({
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
});

describe("buildInstalledToolIds", () => {
  test("maps bun global packages to npm tool ids", () => {
    const installed = buildInstalledToolIds({
      bunPackages: new Set(["opencode-ai", "@fission-ai/openspec", "@colbymchenry/codegraph"]),
      systemPackages: new Set(),
      pluginSpecs: [],
    });

    expect(installed.has("opencode")).toBe(true);
    expect(installed.has("openspec")).toBe(true);
    expect(installed.has("codegraph")).toBe(true);
  });

  test("does not mark npm tools installed from a system package list", () => {
    const installed = buildInstalledToolIds({
      bunPackages: new Set(),
      systemPackages: new Set(["opencode"]),
      pluginSpecs: [],
    });

    expect(installed.has("opencode")).toBe(false);
    expect(installed.has("openspec")).toBe(false);
    expect(installed.has("codegraph")).toBe(false);
  });
});
