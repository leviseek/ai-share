#!/usr/bin/env bun

import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type RuntimeManifest = {
  default_profile?: string;
  managed?: {
    codex_profiles?: string[];
  };
};

type OmxProfileConfig = {
  env?: Record<string, string>;
};

type CodexProfileRoot = {
  model?: string;
  model_provider?: string;
  model_reasoning_effort?: string;
  model_instructions_file?: string;
};

export type ParseArgsResult = {
  profile: string;
  remainingArgs: string[];
  help: boolean;
};

const homeDir = homedir();
const codexHome = process.env.CODEX_HOME ?? join(homeDir, ".codex");
const runtimeManifestPath = join(codexHome, "ai-share.runtime.json");

if (import.meta.main) {
  main();
}

function main(): void {
  const runtimeManifest = asRuntimeManifest(readJson(runtimeManifestPath));
  const availableProfiles = discoverProfiles(runtimeManifest);
  const defaultProfile =
    runtimeManifest?.default_profile ?? (availableProfiles.includes("balanced") ? "balanced" : availableProfiles[0]);

  const parsed = parseArgs(Bun.argv.slice(2), availableProfiles, defaultProfile ?? "balanced");

  if (parsed.help) {
    showHelp(availableProfiles, parsed.profile);
    process.exit(0);
  }

  if (!availableProfiles.includes(parsed.profile)) {
    console.error(`不支持的 Codex+OMX profile：${parsed.profile}`);
    console.error(`可用 profile：${availableProfiles.join("、") || "none"}`);
    process.exit(2);
  }

  const profileConfigPath = join(codexHome, `${parsed.profile}.config.toml`);
  const profileOmxConfigPath = join(codexHome, `${parsed.profile}.omx-config.json`);
  const activeOmxConfigPath = join(codexHome, ".omx-config.json");

  if (!existsSync(profileConfigPath)) {
    console.error(`缺少 Codex profile 配置：${profileConfigPath}`);
    console.error("请先在 ai-share 仓库运行：bun run ai:gen -- --force");
    process.exit(1);
  }

  if (!existsSync(profileOmxConfigPath)) {
    console.error(`缺少 OMX profile 配置：${profileOmxConfigPath}`);
    console.error("请先在 ai-share 仓库运行：bun run ai:gen -- --force");
    process.exit(1);
  }

  atomicWriteFileSync(activeOmxConfigPath, readFileSync(profileOmxConfigPath));

  const codexProfile = parseCodexProfileRoot(readFileSync(profileConfigPath, "utf8"));
  const omxProfile = asOmxProfileConfig(readJson(profileOmxConfigPath));
  const env = { ...process.env, CODEX_HOME: codexHome, ...(omxProfile?.env ?? {}) };
  const omxArgs = buildOmxArgs(parsed.remainingArgs, codexConfigOverrides(codexProfile));
  const result = spawnSync("omx", omxArgs, { stdio: "inherit", env });
  if (result.error) {
    console.error(`启动 omx 失败：${result.error.message}`);
    console.error("请确认已安装 oh-my-codex，并可在当前 PATH 中执行 omx。");
  }
  process.exit(result.status ?? 1);
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function atomicWriteFileSync(path: string, content: string | Uint8Array): void {
  const targetPath = resolve(path);
  const tempPath = resolve(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);

  try {
    writeFileSync(tempPath, content);
    renameSync(tempPath, targetPath);
  } catch (error) {
    removeTempFileSync(tempPath);
    throw error;
  }
}

function removeTempFileSync(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function asRuntimeManifest(value: unknown): RuntimeManifest | null {
  return isRecord(value) ? value : null;
}

function asOmxProfileConfig(value: unknown): OmxProfileConfig | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function discoverProfiles(manifest: RuntimeManifest | null): string[] {
  const manifestProfiles = manifest?.managed?.codex_profiles;
  if (Array.isArray(manifestProfiles) && manifestProfiles.length > 0) return manifestProfiles;

  try {
    const profiles = readdirSync(codexHome)
      .map((entry) => /^(.+)\.config\.toml$/.exec(entry)?.[1])
      .filter((entry): entry is string => Boolean(entry));
    return profiles.length > 0 ? profiles : ["balanced"];
  } catch {
    return ["balanced"];
  }
}

export function parseArgs(args: string[], profiles: string[], fallbackProfile: string): ParseArgsResult {
  let profile = fallbackProfile;
  const remainingArgs: string[] = [];
  let index = 0;

  if (args[0] === "-h" || args[0] === "--help") {
    return { profile, remainingArgs, help: true };
  }

  while (index < args.length) {
    const arg = args[index];
    if (!arg) {
      index += 1;
      continue;
    }

    if (index === 0 && profiles.includes(arg)) {
      profile = arg;
      index += 1;
      continue;
    }

    if ((arg === "--profile" || arg === "--codex-profile" || arg === "--omx-profile") && args[index + 1]) {
      profile = args[index + 1] ?? profile;
      index += 2;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      profile = arg.slice("--profile=".length);
      index += 1;
      continue;
    }

    if (arg.startsWith("--codex-profile=")) {
      profile = arg.slice("--codex-profile=".length);
      index += 1;
      continue;
    }

    if (arg.startsWith("--omx-profile=")) {
      profile = arg.slice("--omx-profile=".length);
      index += 1;
      continue;
    }

    remainingArgs.push(arg);
    index += 1;
  }

  return { profile, remainingArgs, help: false };
}

export function parseCodexProfileRoot(content: string): CodexProfileRoot {
  return {
    ...tomlStringField(content, "model"),
    ...tomlStringField(content, "model_provider"),
    ...tomlStringField(content, "model_reasoning_effort"),
    ...tomlStringField(content, "model_instructions_file"),
  };
}

function tomlStringField(content: string, key: keyof CodexProfileRoot): Partial<CodexProfileRoot> {
  const match = new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(content);
  if (!match?.[1]) return {};
  const value = JSON.parse(`"${match[1]}"`) as string;
  if (key === "model") return { model: value };
  if (key === "model_provider") return { model_provider: value };
  if (key === "model_reasoning_effort") return { model_reasoning_effort: value };
  return { model_instructions_file: value };
}

export function codexConfigOverrides(profile: CodexProfileRoot): string[] {
  const overrides: string[] = [];
  appendConfigOverride(overrides, "model", profile.model);
  appendConfigOverride(overrides, "model_provider", profile.model_provider);
  appendConfigOverride(overrides, "model_reasoning_effort", profile.model_reasoning_effort);
  appendConfigOverride(overrides, "model_instructions_file", profile.model_instructions_file);
  return overrides;
}

function appendConfigOverride(args: string[], key: string, value: string | undefined): void {
  if (!value) return;
  args.push("-c", `${key}=${JSON.stringify(value)}`);
}

export function buildOmxArgs(args: string[], overrides: string[]): string[] {
  const firstArg = args[0];
  if (!firstArg) return overrides;

  if (isOmxMetaCommand(firstArg)) return args;
  if (isCodexForwardingSubcommand(firstArg)) return [firstArg, ...overrides, ...args.slice(1)];
  return [...overrides, ...args];
}

function isCodexForwardingSubcommand(command: string): boolean {
  return ["exec", "review", "resume", "ralph", "team"].includes(command);
}

function isOmxMetaCommand(command: string): boolean {
  return [
    "setup",
    "update",
    "uninstall",
    "doctor",
    "list",
    "cleanup",
    "version",
    "help",
    "status",
    "cancel",
    "reasoning",
    "state",
    "notepad",
    "project-memory",
    "trace",
    "code-intel",
    "wiki",
    "mcp-serve",
    "sparkshell",
    "tmux-hook",
    "hooks",
    "hud",
    "sidecar",
  ].includes(command);
}

function showHelp(profiles: string[], profile: string): void {
  console.log("用法：");
  console.log("  aiomx [profile] [omx/codex args...]");
  console.log("  aiomx --profile <profile> [omx/codex args...]");
  console.log("");
  console.log("说明：启动 Codex + OMX 主路径，并在启动前切换 ai-share 生成的 Codex/OMX profile。");
  console.log(`默认 profile：${profile}`);
  console.log(`可用 profile：${profiles.join("、") || "none"}`);
  console.log("");
  console.log("示例：");
  console.log("  aiomx");
  console.log("  aiomx coding");
  console.log('  aiomx max exec "请分析当前项目"');
}
