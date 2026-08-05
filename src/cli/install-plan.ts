import { parsePluginSpec } from "../config/validators/plugins.ts";
import type { ToolSource } from "../types.ts";

export type InstallPlatform = "win32" | "darwin" | "linux";
export type InstallToolId = string;
export type InstallOperation = "install" | "upgrade";

export type InstallAction =
  | {
      kind: "command";
      toolId: string;
      operation: InstallOperation;
      command: string;
      args: string[];
    }
  | {
      kind: "prepare-scoop-extras";
      command: "scoop";
      args: ["bucket", "add", "extras"];
    }
  | {
      kind: "configure-superpowers";
      toolId: "superpowers";
      operation: InstallOperation;
    };

export type InstallHint =
  | {
      kind: "command";
      toolId: string;
      command: string;
      args: string[];
    }
  | { kind: "prepare-scoop-extras"; command: "scoop"; args: ["bucket", "add", "extras"] }
  | { kind: "configure-superpowers"; toolId: "superpowers"; pluginSpec: string; configPath?: string }
  | { kind: "configure-openspec"; toolId: "openspec"; command: "openspec"; args: ["init"]; projectRoot?: string }
  | {
      kind: "configure-openspec-after-install";
      toolId: "openspec";
      command: "openspec";
      args: ["init"];
      projectRoot?: string;
    }
  | { kind: "configure-openspec-superpowers"; toolId: "superpowers" };

export const SUPERPOWERS_PLUGIN_SPEC = "superpowers@git+https://github.com/obra/superpowers.git";

export type InstalledSystemPackage = {
  global: boolean;
};

type InstalledToolInput = {
  tools: readonly ToolSource[];
  platform: NodeJS.Platform;
  bunPackages: ReadonlySet<string>;
  scoopPackages: ReadonlySet<string> | ReadonlyMap<string, InstalledSystemPackage>;
  brewPackages: ReadonlySet<string>;
  pluginSpecs: readonly string[];
};

type InstallPlanInput = {
  tools: readonly ToolSource[];
  platform: NodeJS.Platform;
  selectedIds: ReadonlySet<InstallToolId>;
  installedIds: ReadonlySet<InstallToolId>;
  upgradeIds: ReadonlySet<InstallToolId>;
  scoopGlobalIds?: ReadonlySet<InstallToolId>;
  scoopExtrasAvailable: boolean;
};

export function parseBunGlobalPackages(text: string): Set<string> {
  const normalized = stripAnsi(text).replaceAll("\r\n", "\n").trim();
  if (normalized === "") return new Set();

  const packages = new Set<string>();
  let seenHeader = false;
  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!seenHeader) {
      if (!isBunGlobalHeader(trimmed)) {
        throw new Error("Bun 全局包列表解析失败：输出格式无效。");
      }
      seenHeader = true;
      continue;
    }
    const entry = /^(?:├──|└──)\s+(.+)$/.exec(trimmed);
    if (entry) {
      const spec = entry[1]?.trim() ?? "";
      if (!spec) throw new Error("Bun 全局包列表解析失败：包条目格式无效。");
      const versionSeparator = spec.lastIndexOf("@");
      if (versionSeparator <= 0 || versionSeparator === spec.length - 1) {
        throw new Error("Bun 全局包列表解析失败：包条目格式无效。");
      }
      packages.add(spec.slice(0, versionSeparator));
      continue;
    }
    // 头部只允许作为首个非空行出现；出现在条目后视为重复/错位头部。
    throw new Error("Bun 全局包列表解析失败：输出格式无效。");
  }
  return packages;
}

function isBunGlobalHeader(line: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/).* node_modules \(\d+\)$/.test(line);
}

export function parseScoopInstalled(text: string, tools: readonly ToolSource[]): Map<string, InstalledSystemPackage> {
  if (!tools) throw new Error("Scoop 应用列表解析失败：必须提供工具配置。");
  const normalized = stripAnsi(text).replaceAll("\r\n", "\n").trim();
  if (/^There aren't any apps installed\.?$/i.test(normalized)) return new Map();
  if (!/^Installed apps:\s*(?:\n|$)/i.test(normalized)) {
    throw new Error("Scoop 应用列表解析失败：输出格式无效。");
  }

  const lines = normalized.split("\n").slice(1);
  const headerIndex = lines.findIndex((line) => /^\s*Name\s+Version\s+Source\s+Updated\s+Info\s*$/i.test(line));
  const separator = lines[headerIndex + 1];
  if (headerIndex < 0 || !separator || !isScoopSeparator(separator)) {
    throw new Error("Scoop 应用列表解析失败：输出格式无效。");
  }

  const packages = new Map<string, InstalledSystemPackage>();
  for (const line of lines.slice(headerIndex + 2)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/\binstall failed\b/i.test(trimmed)) continue;
    const candidateName = trimmed.split(/\s+/, 1)[0];
    if (!candidateName || !isConfiguredPackage(candidateName, tools)) continue;
    const fields = splitScoopFields(line, separator);
    const name = fields.name;
    if (!name || !isPackageManagerId(name)) {
      throw new Error("Scoop 应用列表解析失败：输出格式无效。");
    }
    if (isConfiguredPackage(name, tools) && /\binstall failed\b/i.test(fields.info)) continue;
    if (
      isConfiguredPackage(name, tools) &&
      (!fields.version ||
        (fields.info !== "" &&
          !/\bglobal install\b|\bheld\b|\bdeprecated\b|\b(?:32|64)bit\b|\barm64\b/i.test(fields.info)))
    ) {
      throw new Error("Scoop 应用列表解析失败：输出格式无效。");
    }
    packages.set(name, { global: /\bglobal install\b/i.test(fields.info) });
  }
  return packages;
}

export function collectScoopGlobalIds(
  packages: ReadonlyMap<string, InstalledSystemPackage>,
  tools: readonly ToolSource[],
): Set<InstallToolId> {
  const ids = new Set<InstallToolId>();
  for (const [name, metadata] of packages) {
    const tool = tools.find((candidate) => candidate.package === name);
    if (metadata.global && tool) ids.add(tool.id);
  }
  return ids;
}

export function parseBrewCaskInstalled(text: string, tools: readonly ToolSource[]): Set<string> {
  if (!tools) throw new Error("Homebrew Cask 列表解析失败：必须提供工具配置。");
  const normalized = stripAnsi(text).trim();
  if (!normalized) return new Set();
  if (/^(?:error|fatal):/i.test(normalized)) {
    throw new Error("Homebrew Cask 列表解析失败：输出包含错误。");
  }

  const packages = new Set<string>();
  for (const line of normalized.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    const name = fields[0];
    if (!name || !isPackageManagerId(name)) {
      throw new Error("Homebrew Cask 列表解析失败：输出格式无效。");
    }
    if (fields.length < 2) {
      if (isConfiguredPackage(name, tools)) throw new Error("Homebrew Cask 列表解析失败：输出格式无效。");
      continue;
    }
    if (isConfiguredPackage(name, tools) && fields[1]?.toLowerCase() === "failed") {
      throw new Error("Homebrew Cask 列表解析失败：输出格式无效。");
    }
    packages.add(name);
  }
  return packages;
}

export function buildInstalledToolIds(input: InstalledToolInput): Set<InstallToolId> {
  const platform = requireSupportedPlatform(input.platform);
  const installed = new Set<InstallToolId>();
  const canonicalSuperpowersEnabled = input.pluginSpecs.includes(SUPERPOWERS_PLUGIN_SPEC);

  for (const tool of input.tools) {
    const platformConfig = tool.platforms[platform];
    if (!platformConfig) continue;
    if (platformConfig.manager === "bun" && input.bunPackages.has(tool.package)) installed.add(tool.id);
    if (platformConfig.manager === "scoop" && hasSystemPackage(input.scoopPackages, tool.package))
      installed.add(tool.id);
    if (platformConfig.manager === "brew" && input.brewPackages.has(tool.package)) installed.add(tool.id);
  }
  if (canonicalSuperpowersEnabled) {
    const parsed = parsePluginSpec(SUPERPOWERS_PLUGIN_SPEC);
    if (parsed?.packageId === "superpowers") installed.add("superpowers");
  }
  return installed;
}

export function buildInstallActions(input: InstallPlanInput): InstallAction[] {
  const platform = requireSupportedPlatform(input.platform);
  const actions: InstallAction[] = [];

  for (const tool of input.tools) {
    if (!tool.required && !input.selectedIds.has(tool.id) && !input.upgradeIds.has(tool.id)) continue;
    if (!tool.platforms[platform] || tool.id === "superpowers") continue;
    const installed = input.installedIds.has(tool.id);
    if (installed && !input.upgradeIds.has(tool.id)) continue;
    const operation: InstallOperation = installed ? "upgrade" : "install";

    if (
      platform === "win32" &&
      (operation === "install" || operation === "upgrade") &&
      tool.platforms[platform]?.manager === "scoop" &&
      !input.scoopExtrasAvailable &&
      !actions.some((action) => action.kind === "prepare-scoop-extras")
    ) {
      actions.push({ kind: "prepare-scoop-extras", command: "scoop", args: ["bucket", "add", "extras"] });
    }
    actions.push(buildToolAction(tool, operation, platform, input.scoopGlobalIds));
  }
  if (input.selectedIds.has("superpowers") || input.upgradeIds.has("superpowers")) {
    const installed = input.installedIds.has("superpowers");
    if (!installed || input.upgradeIds.has("superpowers")) {
      actions.push({
        kind: "configure-superpowers",
        toolId: "superpowers",
        operation: installed ? "upgrade" : "install",
      });
    }
  }
  return actions;
}

export function buildInstallHints(
  platform: NodeJS.Platform,
  tools: readonly ToolSource[],
  missingIds: ReadonlySet<InstallToolId>,
  scoopExtrasAvailable = false,
): InstallHint[] {
  const supportedPlatform = requireSupportedPlatform(platform);
  const hints: InstallHint[] = [];
  let scoopExtrasAdded = false;

  if (missingIds.has("superpowers")) {
    hints.push({ kind: "configure-superpowers", toolId: "superpowers", pluginSpec: SUPERPOWERS_PLUGIN_SPEC });
  }
  for (const tool of tools) {
    if (!missingIds.has(tool.id)) continue;
    if (tool.id === "superpowers") continue;
    if (!tool.platforms[supportedPlatform]) continue;
    if (
      supportedPlatform === "win32" &&
      tool.platforms[supportedPlatform]?.manager === "scoop" &&
      !scoopExtrasAdded &&
      !scoopExtrasAvailable
    ) {
      hints.push({ kind: "prepare-scoop-extras", command: "scoop", args: ["bucket", "add", "extras"] });
      scoopExtrasAdded = true;
    }
    const action = buildToolAction(tool, "install", supportedPlatform, undefined);
    if (action.kind !== "command") throw new Error(`无法生成 ${tool.id} 的安装提示。`);
    hints.push({ kind: "command", toolId: action.toolId, command: action.command, args: action.args });
  }
  return hints;
}

export function requireSupportedPlatform(platform: NodeJS.Platform): InstallPlatform {
  if (platform === "win32" || platform === "darwin" || platform === "linux") return platform;
  throw new Error(`ai:install 不支持当前平台：${platform}`);
}

function buildToolAction(
  tool: ToolSource,
  operation: InstallOperation,
  platform: InstallPlatform,
  scoopGlobalIds: ReadonlySet<InstallToolId> | undefined,
): InstallAction {
  const manager = tool.platforms[platform]?.manager;
  if (manager === "bun") return bunAction(tool.id, operation, `${tool.package}@${tool.version}`);
  if (manager === "scoop") {
    return {
      kind: "command",
      toolId: tool.id,
      operation,
      command: "scoop",
      args: [
        operation === "install" ? "install" : "update",
        tool.package,
        ...(scoopGlobalIds?.has(tool.id) ? ["--global"] : []),
      ],
    };
  }
  return {
    kind: "command",
    toolId: tool.id,
    operation,
    command: "brew",
    args: [operation === "install" ? "install" : "upgrade", "--cask", tool.package],
  };
}

function bunAction(toolId: string, operation: InstallOperation, packageSpec: string): InstallAction {
  return { kind: "command", toolId, operation, command: "bun", args: ["install", "--global", packageSpec] };
}

function hasSystemPackage(
  packages: ReadonlySet<string> | ReadonlyMap<string, InstalledSystemPackage>,
  name: string,
): boolean {
  return packages.has(name);
}

function isScoopSeparator(line: string): boolean {
  return /^\s*-{4,}\s+\S+\s+\S+\s+-{4,}\s+-{2,}\s*$/.test(line);
}

function splitScoopFields(
  line: string,
  separator: string,
): {
  name: string;
  version: string;
  source: string;
  updated: string;
  info: string;
} {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length >= 4) {
    const hasTime = /^\d{4}-\d{2}-\d{2}$/.test(tokens[3] ?? "") && /^\d{2}:\d{2}:\d{2}$/.test(tokens[4] ?? "");
    return {
      name: tokens[0] ?? "",
      version: tokens[1] ?? "",
      source: tokens[2] ?? "",
      updated: hasTime ? `${tokens[3] ?? ""} ${tokens[4] ?? ""}` : (tokens[3] ?? ""),
      info: tokens.slice(hasTime ? 5 : 4).join(" "),
    };
  }
  const columns = separator.match(/-+/g);
  if (columns?.length !== 5) throw new Error("Scoop 应用列表解析失败：输出格式无效。");
  const starts = [...separator.matchAll(/-+/g)].map((match) => match.index ?? 0);
  const values = [
    line.slice(starts[0] ?? 0, starts[1] ?? line.length).trim(),
    line.slice(starts[1] ?? 0, starts[2] ?? line.length).trim(),
    line.slice(starts[2] ?? 0, starts[3] ?? line.length).trim(),
    line.slice(starts[3] ?? 0, starts[4] ?? line.length).trim(),
    line.slice(starts[4] ?? 0).trim(),
  ];
  const [name, version, source, updated, info = ""] = values;
  if (!name || !version || !source || !updated) throw new Error("Scoop 应用列表解析失败：输出格式无效。");
  return { name, version, source, updated, info };
}

function isConfiguredPackage(value: string, tools: readonly ToolSource[]): boolean {
  return tools.some((tool) => tool.package === value);
}

function isPackageManagerId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value);
}

function stripAnsi(value: string): string {
  let output = "";
  let inEscape = false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (!inEscape && code === 0x1b) {
      inEscape = true;
      continue;
    }
    if (inEscape) {
      if (code >= 0x40 && code <= 0x7e && code !== 0x5b) inEscape = false;
      continue;
    }
    output += character;
  }
  return output;
}
