#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const VALID_MODES = new Set(["aiomo", "aioc"]);
const OMO_PLUGIN = "oh-my-openagent@3.17.5";
const SUPERPOWERS_PLUGIN = "superpowers@git+https://github.com/obra/superpowers.git";
const MONITOR_PLUGIN = "./plugins/omo-agent-monitor";

const [modeArg, profileArg] = process.argv.slice(2);
if (!VALID_MODES.has(modeArg)) {
  console.error("Usage: opencode-install-doctor.mjs <aiomo|aioc> [profile]");
  process.exit(2);
}

const mode = modeArg;
const homeDir = homedir();
const configBaseDir =
  process.platform !== "win32" && process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : join(homeDir, ".config");
const configDir = join(configBaseDir, "opencode");
const binDir = join(homeDir, ".local", "bin");
const manifestPath = join(configDir, ".omo-profiles.json");
const results = [];

function result(status, label, detail) {
  results.push({ status, label, detail });
}

function ok(label, detail) {
  result("OK", label, detail);
}

function warn(label, detail) {
  result("WARN", label, detail);
}

function fail(label, detail) {
  result("FAIL", label, detail);
}

function fileExists(path) {
  return existsSync(path);
}

function checkFile(label, path, required = true) {
  if (fileExists(path)) {
    ok(label, path);
    return true;
  }
  if (required) fail(label, `missing: ${path}`);
  else warn(label, `optional missing: ${path}`);
  return false;
}

function readJsonIfExists(label, path, required = true) {
  if (!checkFile(label, path, required)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    ok(`${label} JSON`, "parsed");
    return data;
  } catch (error) {
    fail(`${label} JSON`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

function pluginList(config) {
  return Array.isArray(config?.plugin) ? config.plugin : null;
}

function checkPluginPresence(label, config, plugin, expected) {
  const plugins = pluginList(config);
  if (!plugins) {
    fail(label, "missing plugin array");
    return;
  }
  const hasPlugin = plugins.includes(plugin);
  if (expected && hasPlugin) ok(label, plugin);
  else if (expected) fail(label, `missing plugin: ${plugin}`);
  else if (hasPlugin) fail(label, `unexpected plugin: ${plugin}`);
  else ok(label, `absent: ${plugin}`);
}

function defaultProfileFromManifest(manifest) {
  if (profileArg) return profileArg;
  if (manifest && typeof manifest.default_profile === "string" && manifest.default_profile.trim()) {
    return manifest.default_profile;
  }
  return "balanced";
}

function checkSelectedProfile(manifest, profile) {
  if (!manifest) return;
  const profiles = Array.isArray(manifest.profiles) ? manifest.profiles.filter((item) => typeof item === "string") : [];
  if (profiles.includes(profile)) ok("selected profile", `${profile} in manifest`);
  else fail("selected profile", `${profile} not in ${profiles.length ? profiles.join(" / ") : "manifest profile list"}`);
}

function checkOptionalProfileJson(label, profilePath, activePath) {
  const profileJson = readJsonIfExists(label, profilePath, false);
  if (profileJson) readJsonIfExists(`${label} active`, activePath, true);
}

function pathListIncludes(pathList, expectedPath) {
  const separator = process.platform === "win32" ? ";" : ":";
  const normalize = process.platform === "win32" ? (path) => resolve(path).toLowerCase() : (path) => resolve(path);
  const expected = normalize(expectedPath);
  return pathList
    .split(separator)
    .filter(Boolean)
    .some((entry) => normalize(entry) === expected);
}

function checkPath() {
  const currentPath = process.env.Path ?? process.env.PATH ?? "";
  if (pathListIncludes(currentPath, binDir)) ok("PATH", `includes ${binDir}`);
  else warn("PATH", `does not include ${binDir}`);
}

function checkOpencodeDiscovery() {
  const probe =
    process.platform === "win32"
      ? spawnSync("where.exe", ["opencode"], { encoding: "utf8", stdio: "pipe" })
      : spawnSync("sh", ["-c", "command -v opencode"], { encoding: "utf8", stdio: "pipe" });
  if (probe.status === 0) ok("opencode command", (probe.stdout || "found").trim());
  else warn("opencode command", (probe.stderr || probe.stdout || "not found").trim());
}

function checkOpencodeRuntime() {
  const probe = spawnSync("opencode", ["--version"], { encoding: "utf8", stdio: "pipe" });
  if (probe.status === 0) ok("opencode runtime", (probe.stdout || probe.stderr || "version probe passed").trim());
  else warn("opencode runtime", (probe.stderr || probe.stdout || "opencode --version failed").trim());
}

function checkInstalledLaunchers() {
  const launcherFiles =
    process.platform === "win32"
      ? [
          "aiomo.cmd",
          "aiomo.ps1",
          "aioc.cmd",
          "aioc.ps1",
          "opencode-launcher-common.ps1",
          "opencode-context-guard.mjs",
          "aiomo-monitor.cmd",
          "aiomo-monitor.ps1",
        ]
      : ["aiomo", "aioc", "opencode-launcher-common.sh", "opencode-context-guard.mjs", "aiomo-monitor"];
  for (const fileName of launcherFiles) {
    checkFile(`launcher ${fileName}`, join(binDir, fileName));
  }
  checkFile("install doctor", join(binDir, "opencode-install-doctor.mjs"));
}

function checkLocalPluginInstall() {
  const pluginDir = join(configDir, "plugins", "omo-agent-monitor");
  checkFile("monitor plugin package", join(pluginDir, "package.json"));
  checkFile("monitor plugin server", join(pluginDir, "server.js"));
  checkFile("monitor plugin tui", join(pluginDir, "tui.js"));
  checkFile("monitor plugin registry", join(pluginDir, "agents-registry.json"));
}

function checkCommonFiles() {
  const tui = readJsonIfExists("tui config", join(configDir, "tui.json"), true);
  checkPluginPresence("tui monitor plugin", tui, MONITOR_PLUGIN, true);
  checkLocalPluginInstall();
  checkFile("git-master skill", join(configDir, "skills", "git-master", "SKILL.md"));
  checkInstalledLaunchers();
  checkPath();
  checkOpencodeDiscovery();
  checkOpencodeRuntime();
}

const manifest = readJsonIfExists("profile manifest", manifestPath, true);
const profile = defaultProfileFromManifest(manifest);
checkSelectedProfile(manifest, profile);

if (mode === "aiomo") {
  const profileConfig = readJsonIfExists("aiomo profile config", join(configDir, `opencode.${profile}.json`), true);
  checkPluginPresence("aiomo profile OMO plugin", profileConfig, OMO_PLUGIN, true);
  checkPluginPresence("aiomo profile superpowers plugin", profileConfig, SUPERPOWERS_PLUGIN, true);
  checkPluginPresence("aiomo profile monitor plugin", profileConfig, MONITOR_PLUGIN, true);

  const activeConfig = readJsonIfExists("active opencode config", join(configDir, "opencode.json"), true);
  checkPluginPresence("active OMO plugin", activeConfig, OMO_PLUGIN, true);
  checkPluginPresence("active superpowers plugin", activeConfig, SUPERPOWERS_PLUGIN, true);
  checkPluginPresence("active monitor plugin", activeConfig, MONITOR_PLUGIN, true);

  readJsonIfExists("OMO profile config", join(configDir, `oh-my-openagent.${profile}.json`), true);
  readJsonIfExists("OMO active config", join(configDir, "oh-my-openagent.json"), true);
  checkOptionalProfileJson("strategy profile config", join(configDir, `strategy.${profile}.json`), join(configDir, "strategy.json"));
  checkOptionalProfileJson(
    "context guard profile config",
    join(configDir, `context-guard.${profile}.json`),
    join(configDir, "context-guard.profile.json"),
  );
} else {
  const profileConfig = readJsonIfExists("aioc profile config", join(configDir, `opencode.aioc.${profile}.json`), true);
  checkPluginPresence("aioc profile OMO plugin", profileConfig, OMO_PLUGIN, false);
  checkPluginPresence("aioc profile monitor plugin", profileConfig, MONITOR_PLUGIN, false);
  checkPluginPresence("aioc profile superpowers plugin", profileConfig, SUPERPOWERS_PLUGIN, true);

  const activeConfig = readJsonIfExists("active opencode config", join(configDir, "opencode.json"), true);
  checkPluginPresence("active OMO plugin", activeConfig, OMO_PLUGIN, false);
  checkPluginPresence("active monitor plugin", activeConfig, MONITOR_PLUGIN, false);
  checkPluginPresence("active superpowers plugin", activeConfig, SUPERPOWERS_PLUGIN, true);
}

checkCommonFiles();

console.log(`${mode} install doctor: ${profile}`);
for (const { status, label, detail } of results) {
  console.log(`${status.padEnd(5)} ${label}: ${detail}`);
}

process.exit(results.some((entry) => entry.status === "FAIL") ? 1 : 0);
