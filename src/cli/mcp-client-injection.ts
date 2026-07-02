import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { McpServerSource, McpYaml } from "../types.ts";
import { atomicWriteFile, pathExists } from "./fs.ts";
import type { GeneratorPaths } from "./paths.ts";

export type McpClientTarget = {
  id: string;
  name: string;
  file: string;
  requiresExistingFile?: boolean;
};

export type McpClientInjectionStatus = "configured" | "injected" | "missing" | "disabled" | "unsupported" | "error";

export type McpClientInjectionReport = {
  target: McpClientTarget;
  status: McpClientInjectionStatus;
  message?: string;
};

export type McpClientInjectionOptions = {
  dryRun: boolean;
  writer?: (path: string, content: string) => Promise<void>;
};

type JsonMcpServer = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

type JsonMcpConfig = {
  mcpServers: Record<string, unknown>;
  [key: string]: unknown;
};

export function buildKnownMcpClientTargets(
  homeDir: string,
  env: Record<string, string | undefined> = Bun.env,
  platform: NodeJS.Platform = process.platform,
): McpClientTarget[] {
  const appDataDir = resolveAppDataDir(homeDir, env, platform);
  return [
    { id: "antigravity", name: "Antigravity", file: resolve(homeDir, ".gemini", "antigravity", "mcp_config.json") },
    { id: "cherry-studio", name: "Cherry Studio", file: resolve(appDataDir, "cherry-studio", "mcp.json") },
    { id: "claude-code", name: "Claude Code", file: resolve(homeDir, ".claude.json"), requiresExistingFile: true },
    { id: "claude-desktop", name: "Claude Desktop", file: resolve(appDataDir, "Claude", "claude_desktop_config.json") },
    {
      id: "cline",
      name: "Cline",
      file: resolve(
        appDataDir,
        "Code",
        "User",
        "globalStorage",
        "saoudrizwan.claude-dev",
        "settings",
        "cline_mcp_settings.json",
      ),
    },
    { id: "codebuddy", name: "CodeBuddy CLI", file: resolve(homeDir, ".codebuddy", "mcp.json") },
    { id: "cursor", name: "Cursor", file: resolve(homeDir, ".cursor", "mcp.json") },
    { id: "gemini-cli", name: "Gemini CLI", file: resolve(homeDir, ".gemini", "mcp.json") },
    {
      id: "github-copilot-cli",
      name: "GitHub Copilot CLI",
      file: resolve(homeDir, ".config", "github-copilot", "mcp.json"),
    },
    { id: "kilo-code", name: "Kilo Code", file: resolve(homeDir, ".kilo", "mcp.json") },
    { id: "kiro", name: "Kiro", file: resolve(homeDir, ".kiro", "mcp.json") },
    { id: "opencode", name: "OpenCode", file: resolve(homeDir, ".opencode", "mcp.json") },
    { id: "qwen-code", name: "Qwen Code", file: resolve(homeDir, ".qwen", "mcp.json") },
    {
      id: "rider-copilot",
      name: "Rider GitHub Copilot",
      file: resolve(appDataDir, "JetBrains", "Rider", "github-copilot", "mcp.json"),
    },
    {
      id: "roo-code",
      name: "Roo Code",
      file: resolve(
        appDataDir,
        "Code",
        "User",
        "globalStorage",
        "rooveterinaryinc.roo-cline",
        "settings",
        "cline_mcp_settings.json",
      ),
    },
    { id: "trae", name: "Trae", file: resolve(homeDir, ".trae", "mcp.json") },
    { id: "trae-cn", name: "Trae CN", file: resolve(homeDir, ".trae-cn", "mcp.json") },
    {
      id: "vscode-copilot",
      name: "VSCode GitHub Copilot",
      file: resolve(appDataDir, "Code", "User", "globalStorage", "github.copilot", "mcp.json"),
    },
    {
      id: "vscode-insiders-copilot",
      name: "VSCode Insiders GitHub Copilot",
      file: resolve(appDataDir, "Code - Insiders", "User", "globalStorage", "github.copilot", "mcp.json"),
    },
    { id: "windsurf", name: "Windsurf", file: resolve(homeDir, ".codeium", "windsurf", "mcp_config.json") },
    { id: "zed", name: "Zed", file: resolve(homeDir, ".config", "zed", "mcp.json") },
  ];
}

export async function injectRieMcpIntoKnownClients(
  paths: GeneratorPaths,
  mcpConfig: McpYaml,
  options: McpClientInjectionOptions,
  targets: readonly McpClientTarget[] = buildKnownMcpClientTargets(paths.homeDir),
): Promise<McpClientInjectionReport[]> {
  const server = buildRieJsonMcpServer(mcpConfig.servers?.rie, paths.projectRoot);
  if (server === "disabled" || server === "unsupported") {
    return targets.map((target) => ({ target, status: server }));
  }

  const reports: McpClientInjectionReport[] = [];
  for (const target of targets) {
    reports.push(await injectOneTarget(target, server, options));
  }
  return reports;
}

export function mergeMcpJsonConfig(existing: unknown, serverId: string, server: JsonMcpServer): JsonMcpConfig {
  const config = isRecord(existing) ? existing : {};
  const mcpServers = isRecord(config.mcpServers) ? config.mcpServers : {};
  return {
    ...config,
    mcpServers: {
      ...mcpServers,
      [serverId]: server,
    },
  };
}

function buildRieJsonMcpServer(
  server: McpServerSource | undefined,
  projectRoot: string,
): JsonMcpServer | "disabled" | "unsupported" {
  if (server === undefined || server.enabled === false) return "disabled";
  if (server.transport === "http" || server.url !== undefined || typeof server.command !== "string")
    return "unsupported";
  return {
    command: server.command,
    ...(server.args ? { args: resolveMcpArgs(server.args, projectRoot) } : {}),
    ...(server.env ? { env: server.env } : {}),
  };
}

async function injectOneTarget(
  target: McpClientTarget,
  server: JsonMcpServer,
  options: McpClientInjectionOptions,
): Promise<McpClientInjectionReport> {
  try {
    const installed = await targetIsInstalled(target);
    if (!installed) return { target, status: "missing" };

    const existing = (await pathExists(target.file)) ? await readJsonFile(target.file) : {};
    const merged = mergeMcpJsonConfig(existing, "rie", server);
    const content = `${JSON.stringify(merged, null, 2)}\n`;
    if (options.dryRun) {
      return { target, status: "configured" };
    }

    if (options.writer) {
      await options.writer(target.file, content);
    } else {
      await mkdir(dirname(target.file), { recursive: true });
      await atomicWriteFile(target.file, content);
    }
    return { target, status: "injected" };
  } catch (error) {
    return {
      target,
      status: "error",
      message: error instanceof Error ? error.message : "unknown error",
    };
  }
}

async function targetIsInstalled(target: McpClientTarget): Promise<boolean> {
  if (target.requiresExistingFile) return await pathExists(target.file);
  return await directoryExists(dirname(target.file));
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function resolveMcpArgs(args: string[], projectRoot: string): string[] {
  return args.map((arg, index) => (arg === "." && args[index - 1] === "--cwd" ? projectRoot : arg));
}

function resolveAppDataDir(
  homeDir: string,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): string {
  if (platform === "win32") return resolve(env.APPDATA ?? resolve(homeDir, "AppData", "Roaming"));
  if (platform === "darwin") return resolve(homeDir, "Library", "Application Support");
  return resolve(env.XDG_CONFIG_HOME ?? resolve(homeDir, ".config"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
