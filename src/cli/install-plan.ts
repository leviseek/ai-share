import { parsePluginSpec } from "../config/validators/plugins.ts";

export type InstallPlatform = "win32" | "darwin";
export type InstallToolId = "opencode" | "opencode-desktop" | "wezterm" | "openspec" | "superpowers" | "codegraph";
export type InstallOperation = "install" | "upgrade";

export type InstallTool = {
  id: InstallToolId;
  label: string;
  required: boolean;
};

export type InstallAction =
  | {
      kind: "command";
      toolId: Exclude<InstallToolId, "superpowers">;
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
      toolId: Exclude<InstallToolId, "superpowers">;
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

export const INSTALL_TOOLS: readonly InstallTool[] = [
  { id: "opencode", label: "OpenCode CLI", required: true },
  { id: "opencode-desktop", label: "OpenCode Desktop", required: true },
  { id: "wezterm", label: "WezTerm", required: true },
  { id: "openspec", label: "OpenSpec", required: false },
  { id: "superpowers", label: "Superpowers", required: false },
  { id: "codegraph", label: "CodeGraph", required: false },
];

export const SUPERPOWERS_PLUGIN_SPEC = "superpowers@git+https://github.com/obra/superpowers.git";

export type InstalledSystemPackage = {
  global: boolean;
};

type InstalledToolInput = {
  pnpmPackages: ReadonlySet<string>;
  systemPackages: ReadonlySet<string> | ReadonlyMap<string, InstalledSystemPackage>;
  pluginSpecs: readonly string[];
};

type InstallPlanInput = {
  platform: NodeJS.Platform;
  selectedIds: ReadonlySet<InstallToolId>;
  installedIds: ReadonlySet<InstallToolId>;
  upgradeIds: ReadonlySet<InstallToolId>;
  scoopGlobalIds?: ReadonlySet<InstallToolId>;
  scoopExtrasAvailable: boolean;
};

export function parsePnpmGlobalPackages(jsonText: string): Set<string> {
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch (error) {
    throw new Error("pnpm 全局包列表解析失败。", { cause: error });
  }
  if (!Array.isArray(value)) throw new Error("pnpm 全局包列表解析失败：输出格式无效。");

  const packages = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) throw new Error("pnpm 全局包列表解析失败：项目格式无效。");
    collectDependencyNames(packages, entry.dependencies);
    collectDependencyNames(packages, entry.devDependencies);
    collectDependencyNames(packages, entry.optionalDependencies);
  }
  return packages;
}

export function parseScoopInstalled(text: string): Map<string, InstalledSystemPackage> {
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
    if (!candidateName || !isInstallToolId(candidateName)) continue;
    const fields = splitScoopFields(line, separator);
    const name = fields.name;
    if (!name || !isPackageManagerId(name)) {
      throw new Error("Scoop 应用列表解析失败：输出格式无效。");
    }
    if (isInstallToolId(name) && /\binstall failed\b/i.test(fields.info)) continue;
    if (
      isInstallToolId(name) &&
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

export function collectScoopGlobalIds(packages: ReadonlyMap<string, InstalledSystemPackage>): Set<InstallToolId> {
  const ids = new Set<InstallToolId>();
  for (const [name, metadata] of packages) {
    if (metadata.global && isInstallToolId(name)) ids.add(name);
  }
  return ids;
}

export function parseBrewCaskInstalled(text: string): Set<string> {
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
      if (isInstallToolId(name)) throw new Error("Homebrew Cask 列表解析失败：输出格式无效。");
      continue;
    }
    if (isInstallToolId(name) && fields[1]?.toLowerCase() === "failed") {
      throw new Error("Homebrew Cask 列表解析失败：输出格式无效。");
    }
    packages.add(name);
  }
  return packages;
}

export function buildInstalledToolIds(input: InstalledToolInput): Set<InstallToolId> {
  const installed = new Set<InstallToolId>();
  const canonicalSuperpowersEnabled = input.pluginSpecs.includes(SUPERPOWERS_PLUGIN_SPEC);

  for (const tool of INSTALL_TOOLS) {
    if (tool.id === "opencode" && input.pnpmPackages.has("opencode-ai")) installed.add(tool.id);
    else if (tool.id === "openspec" && input.pnpmPackages.has("@fission-ai/openspec")) installed.add(tool.id);
    else if (tool.id === "codegraph" && input.pnpmPackages.has("@colbymchenry/codegraph")) installed.add(tool.id);
    else if (
      (tool.id === "opencode-desktop" || tool.id === "wezterm") &&
      hasSystemPackage(input.systemPackages, tool.id)
    ) {
      installed.add(tool.id);
    } else if (tool.id === "superpowers" && canonicalSuperpowersEnabled) {
      const parsed = parsePluginSpec(SUPERPOWERS_PLUGIN_SPEC);
      if (parsed?.packageId === "superpowers") installed.add(tool.id);
    }
  }
  return installed;
}

export function buildInstallActions(input: InstallPlanInput): InstallAction[] {
  const platform = requireSupportedPlatform(input.platform);
  const actions: InstallAction[] = [];

  for (const tool of INSTALL_TOOLS) {
    if (!tool.required && !input.selectedIds.has(tool.id) && !input.upgradeIds.has(tool.id)) continue;
    const installed = input.installedIds.has(tool.id);
    if (installed && !input.upgradeIds.has(tool.id)) continue;
    const operation: InstallOperation = installed ? "upgrade" : "install";

    if (
      platform === "win32" &&
      (operation === "install" || operation === "upgrade") &&
      (tool.id === "opencode-desktop" || tool.id === "wezterm") &&
      !input.scoopExtrasAvailable &&
      !actions.some((action) => action.kind === "prepare-scoop-extras")
    ) {
      actions.push({ kind: "prepare-scoop-extras", command: "scoop", args: ["bucket", "add", "extras"] });
    }
    actions.push(buildToolAction(tool.id, operation, platform, input.scoopGlobalIds));
  }
  return actions;
}

export function buildInstallHints(
  platform: NodeJS.Platform,
  missingIds: ReadonlySet<InstallToolId>,
  scoopExtrasAvailable = false,
): InstallHint[] {
  const supportedPlatform = requireSupportedPlatform(platform);
  const hints: InstallHint[] = [];
  let scoopExtrasAdded = false;

  for (const tool of INSTALL_TOOLS) {
    if (!missingIds.has(tool.id)) continue;
    if (tool.id === "superpowers") {
      hints.push({ kind: "configure-superpowers", toolId: tool.id, pluginSpec: SUPERPOWERS_PLUGIN_SPEC });
      continue;
    }
    if (
      supportedPlatform === "win32" &&
      (tool.id === "opencode-desktop" || tool.id === "wezterm") &&
      !scoopExtrasAdded &&
      !scoopExtrasAvailable
    ) {
      hints.push({ kind: "prepare-scoop-extras", command: "scoop", args: ["bucket", "add", "extras"] });
      scoopExtrasAdded = true;
    }
    const action = buildToolAction(tool.id, "install", supportedPlatform, undefined);
    if (action.kind !== "command") throw new Error(`无法生成 ${tool.id} 的安装提示。`);
    if (tool.id === "opencode") {
      hints.push({
        toolId: tool.id,
        command: "bun",
        args: ["install", "--global", "opencode-ai@latest"],
        kind: "command",
      });
      continue;
    }
    hints.push({ kind: "command", toolId: action.toolId, command: action.command, args: action.args });
  }
  return hints;
}

export function requireSupportedPlatform(platform: NodeJS.Platform): InstallPlatform {
  if (platform === "win32" || platform === "darwin") return platform;
  throw new Error(`ai:install 仅支持 Windows 和 macOS，当前平台：${platform}`);
}

function buildToolAction(
  toolId: InstallToolId,
  operation: InstallOperation,
  platform: InstallPlatform,
  scoopGlobalIds: ReadonlySet<InstallToolId> | undefined,
): InstallAction {
  if (toolId === "superpowers") return { kind: "configure-superpowers", toolId, operation };
  if (toolId === "opencode") return pnpmAction(toolId, operation, "opencode-ai@latest");
  if (toolId === "openspec") return pnpmAction(toolId, operation, "@fission-ai/openspec@latest");
  if (toolId === "codegraph") return pnpmAction(toolId, operation, "@colbymchenry/codegraph@latest");
  if (platform === "win32") {
    return {
      kind: "command",
      toolId,
      operation,
      command: "scoop",
      args: [
        operation === "install" ? "install" : "update",
        toolId,
        ...(scoopGlobalIds?.has(toolId) ? ["--global"] : []),
      ],
    };
  }
  return {
    kind: "command",
    toolId,
    operation,
    command: "brew",
    args: [operation === "install" ? "install" : "upgrade", "--cask", toolId],
  };
}

function pnpmAction(
  toolId: "opencode" | "openspec" | "codegraph",
  operation: InstallOperation,
  packageSpec: string,
): InstallAction {
  return { kind: "command", toolId, operation, command: "pnpm", args: ["add", "--global", packageSpec] };
}

function collectDependencyNames(packages: Set<string>, value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error("pnpm 全局包列表解析失败：依赖格式无效。");
  for (const [name, metadata] of Object.entries(value)) {
    if (!isRecord(metadata) || typeof metadata.version !== "string" || metadata.version.length === 0) {
      if (!isTrackedPnpmPackage(name)) continue;
      throw new Error("pnpm 全局包列表解析失败：依赖条目格式无效。");
    }
    packages.add(name);
  }
}

function isTrackedPnpmPackage(name: string): boolean {
  return name === "opencode-ai" || name === "@fission-ai/openspec" || name === "@colbymchenry/codegraph";
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

function isInstallToolId(value: string): value is InstallToolId {
  return INSTALL_TOOLS.some((tool) => tool.id === value);
}

function isPackageManagerId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
