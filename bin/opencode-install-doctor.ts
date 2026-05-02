#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

type Mode = "aiomo" | "aioc";
type Status = "OK" | "WARN" | "FAIL";
type Group = "Profile" | "Active Config" | "OMO Config" | "TUI & Plugin" | "Skills" | "Launchers" | "Runtime";
type Result = { group: Group; status: Status; label: string; detail: string };

const OMO_PLUGIN = "oh-my-openagent@3.17.5";
const SUPERPOWERS_PLUGIN = "superpowers@git+https://github.com/obra/superpowers.git";
const MONITOR_PLUGIN = "./plugins/omo-agent-monitor";
const REQUIRED_SUPERPOWERS_SKILLS = [
  "using-superpowers",
  "brainstorming",
  "writing-plans",
  "test-driven-development",
  "verification-before-completion",
] as const;
const GROUP_ORDER: Group[] = [
  "Profile",
  "Active Config",
  "OMO Config",
  "TUI & Plugin",
  "Skills",
  "Launchers",
  "Runtime",
];

const [modeArg, profileArg] = process.argv.slice(2);
if (!isMode(modeArg)) {
  console.error("Usage: opencode-install-doctor.ts <aiomo|aioc> [profile]");
  process.exit(2);
}

const mode = modeArg;
const homeDir = homedir();
const configBaseDir =
  process.platform !== "win32" && process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : join(homeDir, ".config");
const configDir = join(configBaseDir, "opencode");
const binDir = join(homeDir, ".local", "bin");
const manifestPath = join(configDir, ".omo-profiles.json");
const results: Result[] = [];

const colorEnabled = shouldUseColor();
const color = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  cyan: "\u001b[36m",
};

function isMode(value: string | undefined): value is Mode {
  return value === "aiomo" || value === "aioc";
}

function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY;
}

function paint(value: string, code: keyof typeof color): string {
  if (!colorEnabled) return value;
  return `${color[code]}${value}${color.reset}`;
}

function result(group: Group, status: Status, label: string, detail: string): void {
  results.push({ group, status, label, detail });
}

function ok(group: Group, label: string, detail: string): void {
  result(group, "OK", label, detail);
}

function warn(group: Group, label: string, detail: string): void {
  result(group, "WARN", label, detail);
}

function fail(group: Group, label: string, detail: string): void {
  result(group, "FAIL", label, detail);
}

function checkFile(group: Group, label: string, path: string, required = true): boolean {
  if (existsSync(path)) {
    ok(group, label, path);
    return true;
  }
  if (required) fail(group, label, `missing: ${path}`);
  else warn(group, label, `optional missing: ${path}`);
  return false;
}

function readJsonIfExists(group: Group, label: string, path: string, required = true): unknown {
  if (!checkFile(group, label, path, required)) return null;
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    ok(group, `${label} JSON`, "parsed");
    return data;
  } catch (error) {
    fail(group, `${label} JSON`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

function findSuperpowersPackageDir(): string | null {
  const packageCacheDir = join(homeDir, ".cache", "opencode", "packages");
  if (!existsSync(packageCacheDir)) return null;

  return findSuperpowersPackageDirInTree(packageCacheDir, 0);
}

function findSuperpowersPackageDirInTree(directory: string, depth: number): string | null {
  const packageDir = join(directory, "node_modules", "superpowers");
  if (existsSync(join(packageDir, "package.json"))) return packageDir;
  if (depth >= 6) return null;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const found = findSuperpowersPackageDirInTree(join(directory, entry.name), depth + 1);
    if (found) return found;
  }

  return null;
}

function checkSuperpowersInstall(): void {
  const packageDir = findSuperpowersPackageDir();
  if (!packageDir) {
    fail(
      "Skills",
      "superpowers plugin package",
      `missing under ${join(homeDir, ".cache", "opencode", "packages")}; run bun run ai:gen -- --force or opencode run "Tell me about your superpowers" with network access`,
    );
    return;
  }

  ok("Skills", "superpowers plugin package", packageDir);
  const missingSkills: string[] = [];
  for (const skillName of REQUIRED_SUPERPOWERS_SKILLS) {
    const skillPath = join(packageDir, "skills", skillName, "SKILL.md");
    if (!checkFile("Skills", `superpowers/${skillName}`, skillPath)) missingSkills.push(skillName);
  }
  if (missingSkills.length > 0) {
    fail(
      "Skills",
      "superpowers missing skills",
      `${missingSkills.join(", ")}; run bun run ai:gen -- --force or opencode run "Tell me about your superpowers" with network access`,
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pluginList(config: unknown): string[] | null {
  const record = asRecord(config);
  return Array.isArray(record?.plugin)
    ? record.plugin.filter((plugin): plugin is string => typeof plugin === "string")
    : null;
}

function checkPluginPresence(group: Group, label: string, config: unknown, plugin: string, expected: boolean): void {
  const plugins = pluginList(config);
  if (!plugins) {
    fail(group, label, "missing plugin array");
    return;
  }
  const hasPlugin = plugins.includes(plugin);
  if (expected && hasPlugin) ok(group, label, plugin);
  else if (expected) fail(group, label, `missing plugin: ${plugin}`);
  else if (hasPlugin) fail(group, label, `unexpected plugin: ${plugin}`);
  else ok(group, label, `absent: ${plugin}`);
}

function defaultProfileFromManifest(manifest: unknown): string {
  if (profileArg) return profileArg;
  const record = asRecord(manifest);
  return typeof record?.default_profile === "string" && record.default_profile.trim()
    ? record.default_profile
    : "balanced";
}

function checkSelectedProfile(manifest: unknown, profile: string): void {
  const record = asRecord(manifest);
  if (!record) return;
  const profiles = Array.isArray(record.profiles)
    ? record.profiles.filter((item): item is string => typeof item === "string")
    : [];
  if (profiles.includes(profile)) ok("Profile", "selected profile", `${profile} in manifest`);
  else
    fail(
      "Profile",
      "selected profile",
      `${profile} not in ${profiles.length ? profiles.join(" / ") : "manifest profile list"}`,
    );
}

function checkOptionalProfileJson(label: string, profilePath: string, activePath: string): void {
  const profileJson = readJsonIfExists("OMO Config", label, profilePath, false);
  if (profileJson) readJsonIfExists("OMO Config", `${label} active`, activePath, true);
}

function pathListIncludes(pathList: string, expectedPath: string): boolean {
  const separator = process.platform === "win32" ? ";" : ":";
  const normalize =
    process.platform === "win32" ? (path: string) => resolve(path).toLowerCase() : (path: string) => resolve(path);
  const expected = normalize(expectedPath);
  return pathList
    .split(separator)
    .filter(Boolean)
    .some((entry) => normalize(entry) === expected);
}

function checkPath(): void {
  const currentPath = process.env.Path ?? process.env.PATH ?? "";
  if (pathListIncludes(currentPath, binDir)) ok("Runtime", "PATH", `includes ${binDir}`);
  else warn("Runtime", "PATH", `does not include ${binDir}`);
}

function checkOpencodeDiscovery(): void {
  const probe =
    process.platform === "win32"
      ? spawnSync("where.exe", ["opencode"], { encoding: "utf8", stdio: "pipe" })
      : spawnSync("sh", ["-c", "command -v opencode"], { encoding: "utf8", stdio: "pipe" });
  if (probe.status === 0) ok("Runtime", "opencode command", (probe.stdout || "found").trim());
  else warn("Runtime", "opencode command", (probe.stderr || probe.stdout || "not found").trim());
}

function checkOpencodeRuntime(): void {
  const probe = spawnSync("opencode", ["--version"], { encoding: "utf8", stdio: "pipe" });
  if (probe.status === 0)
    ok("Runtime", "opencode runtime", (probe.stdout || probe.stderr || "version probe passed").trim());
  else warn("Runtime", "opencode runtime", (probe.stderr || probe.stdout || "opencode --version failed").trim());
}

function checkInstalledLaunchers(): void {
  const launcherFiles =
    process.platform === "win32"
      ? [
          "aiomo.cmd",
          "aiomo.ps1",
          "aioc.cmd",
          "aioc.ps1",
          "opencode-launcher-common.ps1",
          "opencode-context-guard.ts",
          "aiomo-monitor.cmd",
          "aiomo-monitor.ps1",
        ]
      : ["aiomo", "aioc", "opencode-launcher-common.sh", "opencode-context-guard.ts", "aiomo-monitor"];
  for (const fileName of launcherFiles) {
    checkFile("Launchers", `launcher ${fileName}`, join(binDir, fileName));
  }
  checkFile("Launchers", "context guard module check", join(binDir, "context-guard", "check.ts"));
  checkFile("Launchers", "context guard module watch", join(binDir, "context-guard", "watch.ts"));
  checkFile("Launchers", "install doctor", join(binDir, "opencode-install-doctor.ts"));
}

function checkLocalPluginInstall(): void {
  const pluginDir = join(configDir, "plugins", "omo-agent-monitor");
  checkFile("TUI & Plugin", "monitor plugin package", join(pluginDir, "package.json"));
  checkFile("TUI & Plugin", "monitor plugin server", join(pluginDir, "server.js"));
  checkFile("TUI & Plugin", "monitor plugin tui", join(pluginDir, "tui.js"));
  checkFile("TUI & Plugin", "monitor plugin registry", join(pluginDir, "agents-registry.json"));
}

function checkCommonFiles(): void {
  const tui = readJsonIfExists("TUI & Plugin", "tui config", join(configDir, "tui.json"), true);
  checkPluginPresence("TUI & Plugin", "tui monitor plugin", tui, MONITOR_PLUGIN, true);
  checkLocalPluginInstall();
  checkFile("Skills", "git-master skill", join(configDir, "skills", "git-master", "SKILL.md"));
  checkSuperpowersInstall();
  checkInstalledLaunchers();
  checkPath();
  checkOpencodeDiscovery();
  checkOpencodeRuntime();
}

function statusText(status: Status): string {
  if (status === "OK") return paint("OK", "green");
  if (status === "WARN") return paint("WARN", "yellow");
  return paint("FAIL", "red");
}

function printResults(profile: string): void {
  const counts = countByStatus();
  const summaryStatus: Status = counts.FAIL > 0 ? "FAIL" : counts.WARN > 0 ? "WARN" : "OK";
  console.log(paint(`${mode} install doctor: ${profile}`, "bold"));
  console.log(
    `${statusText(summaryStatus).padEnd(colorEnabled ? 14 : 5)} Summary: ${counts.OK} OK, ${counts.WARN} WARN, ${counts.FAIL} FAIL`,
  );
  console.log("");

  const visibleGroups = GROUP_ORDER.filter((group) => results.some((result) => result.group === group));
  visibleGroups.forEach((group, groupIndex) => {
    const isLastGroup = groupIndex === visibleGroups.length - 1;
    const groupResults = results.filter((result) => result.group === group);
    console.log(`${isLastGroup ? "└─" : "├─"} ${paint(group, "cyan")}`);
    groupResults.forEach((item, itemIndex) => {
      const isLastItem = itemIndex === groupResults.length - 1;
      const prefix = `${isLastGroup ? "  " : "│ "}${isLastItem ? "└─" : "├─"}`;
      console.log(
        `${prefix} ${statusText(item.status).padEnd(colorEnabled ? 14 : 5)} ${item.label}: ${paint(item.detail, "dim")}`,
      );
    });
  });
}

function countByStatus(): Record<Status, number> {
  return results.reduce<Record<Status, number>>(
    (counts, entry) => {
      counts[entry.status] += 1;
      return counts;
    },
    { OK: 0, WARN: 0, FAIL: 0 },
  );
}

const manifest = readJsonIfExists("Profile", "profile manifest", manifestPath, true);
const profile = defaultProfileFromManifest(manifest);
checkSelectedProfile(manifest, profile);

if (mode === "aiomo") {
  const profileConfig = readJsonIfExists(
    "Profile",
    "aiomo profile config",
    join(configDir, "profiles", "opencode", `${profile}.json`),
    true,
  );
  checkPluginPresence("Profile", "aiomo profile OMO plugin", profileConfig, OMO_PLUGIN, true);
  checkPluginPresence("Profile", "aiomo profile superpowers plugin", profileConfig, SUPERPOWERS_PLUGIN, true);
  checkPluginPresence("Profile", "aiomo profile monitor plugin", profileConfig, MONITOR_PLUGIN, true);

  const activeConfig = readJsonIfExists(
    "Active Config",
    "active opencode config",
    join(configDir, "opencode.json"),
    true,
  );
  checkPluginPresence("Active Config", "active OMO plugin", activeConfig, OMO_PLUGIN, true);
  checkPluginPresence("Active Config", "active superpowers plugin", activeConfig, SUPERPOWERS_PLUGIN, true);
  checkPluginPresence("Active Config", "active monitor plugin", activeConfig, MONITOR_PLUGIN, true);

  readJsonIfExists(
    "OMO Config",
    "OMO profile config",
    join(configDir, "profiles", "oh-my-openagent", `${profile}.json`),
    true,
  );
  readJsonIfExists("OMO Config", "OMO active config", join(configDir, "oh-my-openagent.json"), true);
  checkOptionalProfileJson(
    "strategy profile config",
    join(configDir, "profiles", "strategy", `${profile}.json`),
    join(configDir, "strategy.json"),
  );
  checkOptionalProfileJson(
    "context guard profile config",
    join(configDir, "profiles", "context-guard", `${profile}.json`),
    join(configDir, "context-guard.profile.json"),
  );
} else {
  const profileConfig = readJsonIfExists(
    "Profile",
    "aioc profile config",
    join(configDir, "profiles", "aioc", `${profile}.json`),
    true,
  );
  checkPluginPresence("Profile", "aioc profile OMO plugin", profileConfig, OMO_PLUGIN, false);
  checkPluginPresence("Profile", "aioc profile monitor plugin", profileConfig, MONITOR_PLUGIN, false);
  checkPluginPresence("Profile", "aioc profile superpowers plugin", profileConfig, SUPERPOWERS_PLUGIN, true);

  const activeConfig = readJsonIfExists(
    "Active Config",
    "active opencode config",
    join(configDir, "opencode.json"),
    true,
  );
  checkPluginPresence("Active Config", "active OMO plugin", activeConfig, OMO_PLUGIN, false);
  checkPluginPresence("Active Config", "active monitor plugin", activeConfig, MONITOR_PLUGIN, false);
  checkPluginPresence("Active Config", "active superpowers plugin", activeConfig, SUPERPOWERS_PLUGIN, true);
}

checkCommonFiles();
printResults(profile);

process.exit(results.some((entry) => entry.status === "FAIL") ? 1 : 0);
