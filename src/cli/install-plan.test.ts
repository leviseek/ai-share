import { describe, expect, test } from "bun:test";
import {
  INSTALL_TOOLS,
  SUPERPOWERS_PLUGIN_SPEC,
  buildInstallActions,
  buildInstalledToolIds,
  collectScoopGlobalIds,
  parseBrewCaskInstalled,
  parsePnpmGlobalPackages,
  parseScoopInstalled,
  type InstallAction,
  type InstallToolId,
} from "./install-plan.ts";

describe("AI tool installation plan", () => {
  test("defines required and optional tools in stable display order", () => {
    expect(INSTALL_TOOLS.map(({ id, required }) => ({ id, required }))).toEqual([
      { id: "opencode", required: true },
      { id: "opencode-desktop", required: true },
      { id: "wezterm", required: true },
      { id: "openspec", required: false },
      { id: "superpowers", required: false },
      { id: "codegraph", required: false },
    ]);
  });

  test("parses exact pnpm package names and rejects malformed output", () => {
    const packages = parsePnpmGlobalPackages(
      JSON.stringify([{ dependencies: { "opencode-ai": { version: "1.0.0" }, "@scope/tool": { version: "2.0.0" } } }]),
    );
    expect([...packages]).toEqual(["opencode-ai", "@scope/tool"]);
    expect(() => parsePnpmGlobalPackages("not-json")).toThrow("pnpm 全局包列表解析失败");
    expect(() => parsePnpmGlobalPackages("{}")).toThrow("pnpm 全局包列表解析失败");
    expect(() => parsePnpmGlobalPackages('[{"dependencies":{"opencode-ai":null}}]')).toThrow("pnpm 全局包列表解析失败");
    expect(
      parsePnpmGlobalPackages('[{"dependencies":{"unrelated":{"version":""},"opencode-ai":{"version":"1.0.0"}}}]'),
    ).toEqual(new Set(["opencode-ai"]));
  });

  test("parses Scoop empty, user and global installation states without accepting malformed rows", () => {
    expect([...parseScoopInstalled("There aren't any apps installed.")]).toEqual([]);
    expect([
      ...parseScoopInstalled(
        "Installed apps:\n\nName             Version Source Updated    Info\n----             ------- ------ -------    ----\nopencode-desktop 1.0     extras 2026-08-01\nwezterm          2.0     extras 2026-08-01 Global install\n",
      ),
    ]).toEqual([
      ["opencode-desktop", { global: false }],
      ["wezterm", { global: true }],
    ]);
    expect(() => parseScoopInstalled("Installed apps:\n\nopencode-desktop\n")).toThrow("Scoop 应用列表解析失败");
    expect(() =>
      parseScoopInstalled(
        "Installed apps:\n\nName    Version Source Updated    Info\n----    ------- ------ -------    ----\nwezterm 2.0     extras 2026-08-01 Install failed\n",
      ),
    ).toThrow("Scoop 应用列表解析失败");
    expect(() =>
      parseScoopInstalled(
        "Installed apps:\n\nName    Version Source Updated    Info\n----    ------- ------ -------    ----\nwezterm 2.0     extras 2026-08-01 unexpected-extra\n",
      ),
    ).toThrow("Scoop 应用列表解析失败");
  });

  test("parses Homebrew cask version output and rejects malformed rows", () => {
    expect([...parseBrewCaskInstalled("opencode-desktop 1.0\nwezterm 2.0\n")]).toEqual(["opencode-desktop", "wezterm"]);
    expect(() => parseScoopInstalled("fatal: bucket is unavailable")).toThrow("Scoop 应用列表解析失败");
    expect(() => parseBrewCaskInstalled("Error: cask query failed")).toThrow("Homebrew Cask 列表解析失败");
    expect(() => parseBrewCaskInstalled("wezterm failed")).toThrow("Homebrew Cask 列表解析失败");
    expect(() => parseBrewCaskInstalled("wezterm")).toThrow("Homebrew Cask 列表解析失败");
  });

  test("maps package manager results and plugin specs to installed tool ids", () => {
    expect([
      ...buildInstalledToolIds({
        pnpmPackages: new Set(["opencode-ai", "@fission-ai/openspec", "@colbymchenry/codegraph-extra"]),
        systemPackages: new Set(["opencode-desktop", "wezterm-nightly"]),
        pluginSpecs: [SUPERPOWERS_PLUGIN_SPEC],
      }),
    ]).toEqual(["opencode", "opencode-desktop", "openspec", "superpowers"]);
    expect(
      buildInstalledToolIds({
        pnpmPackages: new Set(),
        systemPackages: new Set(),
        pluginSpecs: ["superpowers@1.0.0", "superpowers@git+https://example.test/superpowers.git"],
      }).has("superpowers"),
    ).toBe(false);
  });

  test("builds Windows install actions for missing required and selected optional tools", () => {
    expect(
      buildInstallActions({
        platform: "win32",
        selectedIds: ids("opencode", "opencode-desktop", "wezterm", "openspec", "superpowers", "codegraph"),
        installedIds: ids(),
        upgradeIds: ids(),
        scoopExtrasAvailable: false,
      }),
    ).toEqual([
      command("opencode", "install", "pnpm", ["add", "--global", "opencode-ai@latest"]),
      { kind: "prepare-scoop-extras", command: "scoop", args: ["bucket", "add", "extras"] },
      command("opencode-desktop", "install", "scoop", ["install", "opencode-desktop"]),
      command("wezterm", "install", "scoop", ["install", "wezterm"]),
      command("openspec", "install", "pnpm", ["add", "--global", "@fission-ai/openspec@latest"]),
      { kind: "configure-superpowers", toolId: "superpowers", operation: "install" },
      command("codegraph", "install", "pnpm", ["add", "--global", "@colbymchenry/codegraph@latest"]),
    ]);
  });

  test("builds macOS upgrades only for installed tools selected for upgrade", () => {
    const installed = ids("opencode", "opencode-desktop", "wezterm", "openspec", "superpowers", "codegraph");
    expect(
      buildInstallActions({
        platform: "darwin",
        selectedIds: installed,
        installedIds: installed,
        upgradeIds: ids("opencode", "opencode-desktop", "wezterm", "superpowers"),
        scoopExtrasAvailable: true,
      }),
    ).toEqual([
      command("opencode", "upgrade", "pnpm", ["add", "--global", "opencode-ai@latest"]),
      command("opencode-desktop", "upgrade", "brew", ["upgrade", "--cask", "opencode-desktop"]),
      command("wezterm", "upgrade", "brew", ["upgrade", "--cask", "wezterm"]),
      { kind: "configure-superpowers", toolId: "superpowers", operation: "upgrade" },
    ]);
  });

  test("keeps optional tools selected in the upgrade menu even when they were not selected for install", () => {
    expect(
      buildInstallActions({
        platform: "darwin",
        selectedIds: ids("opencode", "opencode-desktop", "wezterm"),
        installedIds: ids("opencode", "opencode-desktop", "wezterm", "openspec"),
        upgradeIds: ids("openspec"),
        scoopExtrasAvailable: true,
      }),
    ).toContainEqual(command("openspec", "upgrade", "pnpm", ["add", "--global", "@fission-ai/openspec@latest"]));
  });

  test("omits unselected optional tools and rejects unsupported platforms", () => {
    expect(
      buildInstallActions({
        platform: "win32",
        selectedIds: ids("opencode", "opencode-desktop", "wezterm"),
        installedIds: ids("opencode"),
        upgradeIds: ids(),
        scoopExtrasAvailable: true,
      }),
    ).toEqual([
      command("opencode-desktop", "install", "scoop", ["install", "opencode-desktop"]),
      command("wezterm", "install", "scoop", ["install", "wezterm"]),
    ]);
    expect(() =>
      buildInstallActions({
        platform: "linux",
        selectedIds: ids(),
        installedIds: ids(),
        upgradeIds: ids(),
        scoopExtrasAvailable: true,
      }),
    ).toThrow("ai:install 仅支持 Windows 和 macOS");
  });

  test("preserves global Scoop scope for Windows upgrades", () => {
    const scoopPackages = parseScoopInstalled(
      "Installed apps:\n\nName             Version Source Updated    Info\n----             ------- ------ -------    ----\nopencode-desktop 1.0     extras 2026-08-01\nwezterm          2.0     extras 2026-08-01 Global install\n",
    );
    expect(
      buildInstallActions({
        platform: "win32",
        selectedIds: ids("opencode", "opencode-desktop", "wezterm"),
        installedIds: ids("opencode-desktop", "wezterm"),
        upgradeIds: ids("opencode-desktop", "wezterm"),
        scoopGlobalIds: collectScoopGlobalIds(scoopPackages),
        scoopExtrasAvailable: true,
      }),
    ).toEqual([
      command("opencode", "install", "pnpm", ["add", "--global", "opencode-ai@latest"]),
      command("opencode-desktop", "upgrade", "scoop", ["update", "opencode-desktop"]),
      command("wezterm", "upgrade", "scoop", ["update", "wezterm", "--global"]),
    ]);
  });

  test("prepares Scoop extras before upgrading an extras application", () => {
    expect(
      buildInstallActions({
        platform: "win32",
        selectedIds: ids("opencode", "opencode-desktop", "wezterm"),
        installedIds: ids("opencode-desktop"),
        upgradeIds: ids("opencode-desktop"),
        scoopExtrasAvailable: false,
      }),
    ).toEqual([
      command("opencode", "install", "pnpm", ["add", "--global", "opencode-ai@latest"]),
      { kind: "prepare-scoop-extras", command: "scoop", args: ["bucket", "add", "extras"] },
      command("opencode-desktop", "upgrade", "scoop", ["update", "opencode-desktop"]),
      command("wezterm", "install", "scoop", ["install", "wezterm"]),
    ]);
  });

  test("accepts ANSI colored Scoop tables and non-numeric unrelated versions", () => {
    const parsed = parseScoopInstalled(
      "Installed apps:\n\n\u001b[32;1mName             Version Source Updated    Info\u001b[0m\n----             ------- ------ -------    ----\nwezterm          nightly extras 2026-08-01 Global install\nother-tool       latest  main   2026-08-01 Held\n",
    );
    expect(parsed.get("wezterm")).toEqual({ global: true });
  });

  test("accepts Homebrew cask rows with latest or multiple version fields", () => {
    expect([...parseBrewCaskInstalled("wezterm latest\nother-cask 1.0 2.0\n")]).toEqual(["wezterm", "other-cask"]);
  });
});

function ids(...values: InstallToolId[]): ReadonlySet<InstallToolId> {
  return new Set(values);
}

function command(
  toolId: Exclude<InstallToolId, "superpowers">,
  operation: "install" | "upgrade",
  executable: string,
  args: string[],
): InstallAction {
  return { kind: "command", toolId, operation, command: executable, args };
}
