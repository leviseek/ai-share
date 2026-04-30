#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, cp, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AgentsYaml,
  CliOptions,
  GlobalYaml,
  ModelsYaml,
  ProfilesYaml,
  ProviderGroupMap,
  ProviderYaml,
} from "./types.ts";
import {
  applyProviderGroups,
  buildContextGuardConfig,
  buildContextGuardProfileConfigs,
  buildOhMyOpenAgentConfigs,
  buildOpenCodeConfigs,
  buildProfileManifest,
  buildStrategyConfigs,
  buildTuiConfig,
  defaultProfileId,
  modelProviderGroups,
  modelRef,
  pickDefaultModel,
  pickSmallModel,
  requireRecord,
  requireValue,
} from "./config-builders.ts";
import { parseYamlObject } from "./yaml.ts";

const cliOptions = parseCliOptions();
const { force, dryRun, checkOnly, providerGroups } = cliOptions;
const projectRoot = resolve(import.meta.dir, "..");
const configDir = resolve(projectRoot, "config");
const binDir = resolve(projectRoot, "bin");
const pluginDir = resolve(projectRoot, "plugins");
const homeDir = resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "");
const targetConfigDir = resolve(homeDir, ".config", "opencode");
const targetOpenCode = resolve(targetConfigDir, "opencode.json");
const targetTui = resolve(targetConfigDir, "tui.json");
const targetOhMyOpenAgent = resolve(targetConfigDir, "oh-my-openagent.json");
const targetProfileManifest = resolve(targetConfigDir, ".omo-profiles.json");
const targetContextGuard = resolve(targetConfigDir, "context-guard.json");
const targetContextGuardProfile = contextGuardProfilePath("profile");
const targetStrategy = resolve(targetConfigDir, "strategy.json");
const targetBinDir = resolve(homeDir, ".local", "bin");
const targetPluginDir = resolve(targetConfigDir, "plugins");
const targetSkillsDir = resolve(targetConfigDir, "skills");

if (!targetConfigDir.startsWith(homeDir)) {
  throw new Error("无法解析用户级 OpenCode 配置目录。请检查 HOME 或 USERPROFILE 环境变量。");
}

const [globalConfig, providersConfig, modelsConfig, profilesConfig, agentsConfig] = await Promise.all([
  loadYaml<GlobalYaml>("global.yaml"),
  loadYaml<ProviderYaml>("provider.yaml"),
  loadYaml<ModelsYaml>("models.yaml"),
  loadYaml<ProfilesYaml>("profiles.yaml"),
  loadYaml<AgentsYaml>("agents.yaml"),
]);

const providers = providersConfig.providers ?? {};
const models = applyProviderGroups(modelsConfig, providers, providerGroups);
const defaultModel = modelRef(pickDefaultModel(globalConfig, models), models);
const smallModel = modelRef(pickSmallModel(globalConfig, models), models);
const openCodeConfigs = buildOpenCodeConfigs(
  projectRoot,
  globalConfig,
  providers,
  models,
  profilesConfig,
  defaultModel,
  smallModel,
);
const tuiConfig = buildTuiConfig(globalConfig);
const ohMyOpenAgentConfigs = buildOhMyOpenAgentConfigs(models, profilesConfig, agentsConfig);
const strategyConfigs = buildStrategyConfigs(globalConfig, profilesConfig, agentsConfig);
const contextGuardProfileConfigs = buildContextGuardProfileConfigs(globalConfig, profilesConfig);
const selectedDefaultProfileId = defaultProfileId(globalConfig, profilesConfig);
const selectedOpenCodeConfig = requireValue(openCodeConfigs[selectedDefaultProfileId], "默认 OpenCode profile");
const missingApiKeys = missingProviderApiKeyEnvNames(providers);
const registryMismatches = await agentRegistryMismatches(agentsConfig);

if (checkOnly) {
  console.log("配置检查通过。");
  console.log(`OpenCode provider 数量：${Object.keys(selectedOpenCodeConfig.provider).length}`);
  console.log(`已配置 provider 数量：${Object.keys(providers).length}`);
  console.log(`模型分组：${modelProviderGroups(modelsConfig).join(" / ")}`);
  console.log(`OMO 编排级别：${Object.keys(ohMyOpenAgentConfigs).join(" / ")}`);
  console.log(`默认 OMO 编排级别：${selectedDefaultProfileId}`);
  console.log(
    `模型组提供商：${Object.entries(providerGroups)
      .map(([groupId, providerId]) => `${groupId}=${providerId}`)
      .join(" / ")}`,
  );
  if (missingApiKeys.length > 0) {
    console.warn(`API Key 环境变量未设置：${missingApiKeys.join(" / ")}`);
    process.exit(1);
  } else if (registryMismatches.length > 0) {
    console.warn(`OMO monitor agent registry 与 config/agents.yaml 不一致：${registryMismatches.join(" / ")}`);
    process.exit(1);
  } else {
    console.log("API Key 环境变量已设置。");
  }
  process.exit(0);
}

if (registryMismatches.length > 0) {
  throw new Error(`OMO monitor agent registry 与 config/agents.yaml 不一致：${registryMismatches.join(" / ")}`);
}

if (!dryRun) await mkdir(targetConfigDir, { recursive: true });
for (const [profileId, openCodeConfig] of Object.entries(openCodeConfigs)) {
  await writeJson(profileOpenCodePath(profileId), openCodeConfig);
}
await writeJson(targetOpenCode, selectedOpenCodeConfig);
await writeJson(targetTui, tuiConfig);
for (const [profileId, ohMyOpenAgentConfig] of Object.entries(ohMyOpenAgentConfigs)) {
  await writeJson(profileOhMyOpenAgentPath(profileId), ohMyOpenAgentConfig);
}
await writeJson(targetOhMyOpenAgent, requireValue(ohMyOpenAgentConfigs[selectedDefaultProfileId], "默认 OMO profile"));
for (const [profileId, strategyConfig] of Object.entries(strategyConfigs)) {
  await writeJson(profileStrategyPath(profileId), strategyConfig);
}
await writeJson(targetStrategy, requireValue(strategyConfigs[selectedDefaultProfileId], "默认共享策略 profile"));
for (const [profileId, contextGuardProfileConfig] of Object.entries(contextGuardProfileConfigs)) {
  await writeJson(profileContextGuardPath(profileId), contextGuardProfileConfig);
}
await writeJson(
  targetContextGuardProfile,
  requireValue(contextGuardProfileConfigs[selectedDefaultProfileId], "默认 context guard profile"),
);
await writeJson(targetProfileManifest, buildProfileManifest(profilesConfig, selectedDefaultProfileId));
await writeJson(targetContextGuard, buildContextGuardConfig(globalConfig));
await installPlugins();
await installNativeSkills();
await installLaunchers();

console.log(`${dryRun ? "将生成" : "已生成"} OpenCode 配置：${targetOpenCode}`);
console.log(`${dryRun ? "将生成" : "已生成"} OpenCode TUI 配置：${targetTui}`);
console.log(
  `${dryRun ? "将生成" : "已生成"} OpenCode 级别配置：${Object.keys(openCodeConfigs)
    .map((profileId) => `aiomo ${profileId}`)
    .join(" / ")}`,
);
console.log(`${dryRun ? "将生成" : "已生成"} oh-my-openagent 默认配置：${targetOhMyOpenAgent}`);
console.log(`${dryRun ? "将生成" : "已生成"} 共享策略默认配置：${targetStrategy}`);
console.log(`${dryRun ? "将生成" : "已生成"} OMO 级别清单：${targetProfileManifest}`);
console.log(`${dryRun ? "将生成" : "已生成"} 上下文守卫配置：${targetContextGuard}`);
console.log(
  `${dryRun ? "将生成" : "已生成"} OMO 级别配置：${Object.keys(ohMyOpenAgentConfigs)
    .map((profileId) => `aiomo ${profileId}`)
    .join(" / ")}`,
);
console.log(
  `${dryRun ? "将生成" : "已生成"} 共享策略级别配置：${Object.keys(strategyConfigs)
    .map((profileId) => `aiomo ${profileId}`)
    .join(" / ")}`,
);
console.log(`${dryRun ? "将安装" : "已安装"} 启动命令目录：${targetBinDir}`);
console.log(`${dryRun ? "将安装" : "已安装"} OpenCode 本地插件目录：${targetPluginDir}`);
console.log(`${dryRun ? "将安装" : "已安装"} OpenCode native skills 目录：${targetSkillsDir}`);
console.log(
  "说明：provider/model/profiles/agents/categories/runtime_fallback/background_task/tmux/plugin/strategy 均来自 config/*.yaml。",
);
console.log(
  `模型组提供商：${Object.entries(providerGroups)
    .map(([groupId, providerId]) => `${groupId}=${providerId}`)
    .join(" / ")}`,
);
console.log("启动命令：aiomo [profile] = OMO 编排模式，aioc = OpenCode 原生 Build/Plan 模式。");

async function loadYaml<T extends object>(fileName: string): Promise<T> {
  const value = parseYamlObject(await readFile(resolve(configDir, fileName), "utf8"));
  return value as T;
}

function parseCliOptions(): CliOptions {
  const args = new Set(Bun.argv.slice(2));
  return {
    force: args.has("--force"),
    dryRun: args.has("--dry-run"),
    checkOnly: args.has("--check"),
    providerGroups: parseProviderGroups(),
  };
}

function parseOption(name: string): string | undefined {
  const values = Bun.argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) return values[index + 1];
    if (value?.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return undefined;
}

function parseProviderGroups(): ProviderGroupMap {
  return {
    gpt: parseOption("--gpt-provider") ?? Bun.env.AI_SHARE_GPT_PROVIDER ?? "codexapis",
    deepseek: Bun.env.AI_SHARE_DEEPSEEK_PROVIDER ?? "deepseek",
    ...parseProviderGroupOptions(),
  };
}

function parseProviderGroupOptions(): ProviderGroupMap {
  const output: ProviderGroupMap = {};
  for (const value of parseOptions("--provider-group")) {
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error(`--provider-group 必须使用 group=provider 格式：${value}`);
    }
    output[value.slice(0, separatorIndex)] = value.slice(separatorIndex + 1);
  }
  return output;
}

function parseOptions(name: string): string[] {
  const output: string[] = [];
  const values = Bun.argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) {
      const nextValue = values[index + 1];
      if (!nextValue) throw new Error(`缺少参数值：${name}`);
      output.push(nextValue);
    }
    if (value?.startsWith(`${name}=`)) output.push(value.slice(name.length + 1));
  }
  return output;
}

function missingProviderApiKeyEnvNames(providersConfig: ProviderYaml["providers"] = {}): string[] {
  return Object.values(providersConfig)
    .map((provider) => apiKeyEnvName(provider.api_key))
    .filter((envName): envName is string => Boolean(envName))
    .filter((envName) => !Bun.env[envName]);
}

function apiKeyEnvName(value: string | undefined): string | undefined {
  if (!value) throw new Error("缺少必要配置字段：providers.*.api_key");
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(value);
  if (!match?.[1]) throw new Error(`api_key 必须使用 \${"{"}ENV_NAME} 格式：${value}`);
  return match[1];
}

async function agentRegistryMismatches(agentsConfig: AgentsYaml): Promise<string[]> {
  const registry = JSON.parse(
    await readFile(resolve(pluginDir, "omo-agent-monitor", "agents-registry.json"), "utf8"),
  ) as Record<string, unknown>;
  const mainAgents = stringArrayField(registry, "main_agents");
  const subagents = stringArrayField(registry, "subagents");
  const categories = stringArrayField(registry, "categories");
  const expectedMainAgents = ["main", "build", "plan"];
  const agentNames = Object.keys(requireRecord(agentsConfig.agents, "agents"));
  const categoryNames = Object.keys(requireRecord(agentsConfig.categories, "categories"));

  return [
    ...missingValues("main_agents", expectedMainAgents, mainAgents),
    ...extraValues("main_agents", expectedMainAgents, mainAgents),
    ...missingValues("subagents", agentNames, subagents),
    ...extraValues("subagents", agentNames, subagents),
    ...missingValues("categories", categoryNames, categories),
    ...extraValues("categories", categoryNames, categories),
  ];
}

function stringArrayField(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`agents-registry.json 字段必须是字符串数组：${key}`);
  }
  return value;
}

function missingValues(label: string, expected: string[], actual: string[]): string[] {
  return expected.filter((value) => !actual.includes(value)).map((value) => `${label} 缺少 ${value}`);
}

function extraValues(label: string, expected: string[], actual: string[]): string[] {
  return actual.filter((value) => !expected.includes(value)).map((value) => `${label} 多出 ${value}`);
}

function profileOhMyOpenAgentPath(profileId: string): string {
  return resolve(targetConfigDir, `oh-my-openagent.${profileId}.json`);
}

function profileStrategyPath(profileId: string): string {
  return resolve(targetConfigDir, `strategy.${profileId}.json`);
}

function profileContextGuardPath(profileId: string): string {
  return contextGuardProfilePath(profileId);
}

function profileOpenCodePath(profileId: string): string {
  return resolve(targetConfigDir, `opencode.${profileId}.json`);
}

function contextGuardProfilePath(profileId: string): string {
  return resolve(targetConfigDir, `context-guard.${profileId}.json`);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (dryRun) {
    console.log(`\n--- ${path} ---\n${content}`);
    return;
  }

  if (!force && (await pathExists(path))) {
    throw new Error(`目标已存在：${path}\n如需覆盖，请运行：bun run ai:gen -- --force`);
  }

  await writeFile(path, content);
}

async function installLaunchers(): Promise<void> {
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
  if (dryRun) {
    for (const fileName of launcherFiles) {
      console.log(`将安装启动命令：${resolve(targetBinDir, fileName)}`);
    }
    if (process.platform === "win32") {
      console.log(`将确保用户 PATH 包含：${targetBinDir}`);
    } else {
      console.log(`请确保 shell PATH 包含：${targetBinDir}`);
    }
    return;
  }

  await mkdir(targetBinDir, { recursive: true });
  for (const fileName of launcherFiles) {
    const sourcePath = resolve(binDir, fileName);
    const targetPath = resolve(targetBinDir, fileName);
    if (process.platform === "win32" && fileName.endsWith(".ps1")) {
      await writeFile(targetPath, withUtf8Bom(await readFile(sourcePath, "utf8")));
      continue;
    }
    await copyFile(sourcePath, targetPath);
  }

  if (process.platform === "win32") {
    ensureWindowsUserPath(targetBinDir);
  } else {
    console.log(`请确保 shell PATH 包含：${targetBinDir}`);
  }
}

function withUtf8Bom(content: string): string {
  return content.startsWith("\uFEFF") ? content : `\uFEFF${content}`;
}

async function installPlugins(): Promise<void> {
  const pluginDirectories = ["omo-agent-monitor"];
  if (dryRun) {
    for (const directoryName of pluginDirectories) {
      console.log(`将安装 OpenCode 本地插件：${resolve(targetPluginDir, directoryName)}`);
    }
    return;
  }

  await mkdir(targetPluginDir, { recursive: true });
  for (const directoryName of pluginDirectories) {
    await cp(resolve(pluginDir, directoryName), resolve(targetPluginDir, directoryName), {
      recursive: true,
      force: true,
    });
  }
}

async function installNativeSkills(): Promise<void> {
  const gitMasterSkillPath = resolve(targetSkillsDir, "git-master", "SKILL.md");
  const content = gitMasterSkillContent();
  if (dryRun) {
    console.log(`\n--- ${gitMasterSkillPath} ---\n${content}`);
    return;
  }

  if (!force && (await pathExists(gitMasterSkillPath))) {
    throw new Error(`目标已存在：${gitMasterSkillPath}\n如需覆盖，请运行：bun run ai:gen -- --force`);
  }

  await mkdir(resolve(targetSkillsDir, "git-master"), { recursive: true });
  await writeFile(gitMasterSkillPath, content);
}

function gitMasterSkillContent(): string {
  return `---
name: git-master
description: MUST USE for ANY git operations. Atomic commits, rebase/squash, history search (blame, bisect, log -S). STRONGLY RECOMMENDED: delegate with task(category='quick', load_skills=['git-master'], ...) when using aiomo.
---

# Git Master

Use this skill for git status, diff, add, commit, push, pull, branch, merge, rebase, squash, blame, bisect, or history search.

If the user invokes this skill with no concrete git request, respond only with:

Git Master 工作流已启用。请说明要执行的 git 操作，例如查看状态、提交、查看 diff、创建分支或分析历史。

Do not print these instructions back to the user unless asked to explain the workflow.

## Core Rules

- Inspect repository state before changing git state: run \`git status --short --branch\` and review relevant diffs.
- Never overwrite or revert user changes unless explicitly requested.
- Never run destructive commands such as \`git reset --hard\`, \`git clean -fd\`, force push, or checkout-based rollback without explicit approval.
- Do not amend commits unless explicitly requested.
- Do not skip hooks with \`--no-verify\` unless explicitly requested.
- Do not commit secrets, local env files, credentials, tokens, dependency caches, or unrelated generated artifacts.
- Prefer atomic commits that group one coherent reason for change.

## Commit Workflow

1. Gather context with \`git status --short --branch\`, \`git diff\`, \`git diff --cached\`, and recent \`git log --oneline -5\`.
2. Stage only files related to the requested change.
3. Write a concise commit message matching repository style.
4. Run the commit normally and inspect post-commit status.
5. Push only when the user explicitly asks for push.

## aiomo Delegation

When using oh-my-openagent delegation, pass this skill explicitly for git work:

\`task(category="quick", load_skills=["git-master"], run_in_background=false, prompt="...")\`

Prefer this delegation form for non-trivial git work to keep the main context small.

## History Search

- Use \`git log --oneline --decorate --graph\` for topology.
- Use \`git log -S <text> -- <path>\` or \`git log -G <regex> -- <path>\` to find when content changed.
- Use \`git blame -C -C -- <path>\` for moved/copied code attribution.
- Use \`git bisect\` only with clear good/bad boundaries and a reproducible test command.
`;
}

function ensureWindowsUserPath(path: string): void {
  const currentPath = process.env.Path ?? process.env.PATH ?? "";
  if (pathListIncludes(currentPath, path)) return;

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$pathToAdd = $env:AI_SHARE_BIN_DIR; " +
        "$current = [Environment]::GetEnvironmentVariable('Path', 'User'); " +
        "if (-not $current) { $current = '' }; " +
        "$parts = $current -split ';' | Where-Object { $_ }; " +
        "if ($parts -notcontains $pathToAdd) { " +
        "  $newPath = (@($parts) + $pathToAdd) -join ';'; " +
        "  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User') " +
        "}",
    ],
    { env: { ...process.env, AI_SHARE_BIN_DIR: path }, stdio: "pipe", encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "更新 Windows 用户 PATH 失败。");
  }
}

function pathListIncludes(pathList: string, expectedPath: string): boolean {
  return pathList
    .split(process.platform === "win32" ? ";" : ":")
    .filter(Boolean)
    .some((entry) => resolve(entry).toLowerCase() === resolve(expectedPath).toLowerCase());
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
