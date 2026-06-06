#!/usr/bin/env bun

import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AgentsYaml,
  EnvYaml,
  GlobalYaml,
  McpYaml,
  ModelsYaml,
  ProfileEvalYaml,
  ProfilesYaml,
  ProviderYaml,
} from "./types.ts";
import {
  applyProviderGroups,
  buildCodexAgentConfigs,
  buildCodexCliConfigs,
  buildCodexInstructions,
  buildCodexEnvFileWithManagedBlock,
  buildInstructionsPaths,
  buildOmxConfigs,
  buildRuntimeManifest,
  codexEnvManagedBlockIsCurrent,
  defaultProfileId,
  formatCodexAgentToml,
  formatCodexConfigToml,
  modelProviderGroups,
  requireValue,
} from "./config-builders.ts";
import { missingProviderApiKeyEnvNames } from "./cli/api-keys.ts";
import { checkCodexEnvLocalProxies } from "./cli/env-runtime-check.ts";
import { atomicWriteFile, pathExists, StagedFileWriter, writeJson, writeText } from "./cli/fs.ts";
import { installLaunchers, installNativeSkills } from "./cli/install.ts";
import { ensureAiWorkspaceLinks } from "./cli/memory-link.ts";
import { parseCliOptions } from "./cli/options.ts";
import { NATIVE_SKILLS } from "./cli/native-skills.ts";
import { color } from "./cli/color.ts";
import { detectDefaultConfigDrift } from "./cli/default-config-drift.ts";
import { printCheckSummary, printGenerationSummary } from "./cli/output.ts";
import {
  buildGeneratorPaths,
  codexAgentConfigPath,
  profileCodexConfigPath,
  profileCodexInstructionsPath,
  profileOmxConfigPath,
} from "./cli/paths.ts";
import { checkVersions } from "./cli/registry-check.ts";
import { loadConfigYaml } from "./config/local-overlay.ts";
import { validateYamlConsistency } from "./config/validation.ts";

const cliOptions = parseCliOptions();
const { force, dryRun, checkOnly, providerGroups } = cliOptions;
const paths = buildGeneratorPaths();

if (!checkOnly) {
  await ensureAiWorkspaceLinks(paths, dryRun);
}

const [
  globalConfig,
  providersConfig,
  modelsConfig,
  profilesConfig,
  agentsConfig,
  mcpConfig,
  envConfig,
  profileEvalConfig,
] = await Promise.all([
  loadYaml<GlobalYaml>("global.yaml"),
  loadYaml<ProviderYaml>("provider.yaml"),
  loadYaml<ModelsYaml>("models.yaml"),
  loadYaml<ProfilesYaml>("profiles.yaml"),
  loadYaml<AgentsYaml>("agents.yaml"),
  loadYaml<McpYaml>("mcp.yaml"),
  loadYaml<EnvYaml>("env.yaml"),
  loadYaml<ProfileEvalYaml>("profile-eval.yaml"),
]);

const validationErrors = validateYamlConsistency(
  profilesConfig,
  modelsConfig,
  providersConfig,
  globalConfig,
  mcpConfig,
  agentsConfig,
  envConfig,
  profileEvalConfig,
);
if (validationErrors.length > 0) {
  printValidationErrors(validationErrors);
  if (!force) {
    if (checkOnly) {
      console.error("校验失败。使用 --force 可忽略校验继续生成。");
      process.exit(1);
    }
    throw new Error("YAML 配置校验失败。使用 --force 可忽略。");
  }
}

const providers = providersConfig.providers ?? {};
const models = applyProviderGroups(modelsConfig, providers, providerGroups);
const codexCliConfigs = buildCodexCliConfigs(providers, models, profilesConfig, agentsConfig, mcpConfig, (profileId) =>
  profileCodexInstructionsPath(paths.targetCodexConfigDir, profileId),
);
const selectedDefaultProfileId = defaultProfileId(globalConfig, profilesConfig);
const codexAgentConfigs = buildCodexAgentConfigs(agentsConfig, models, profilesConfig, selectedDefaultProfileId);
const omxConfigs = buildOmxConfigs(models, profilesConfig, agentsConfig);
const selectedCodexCliConfig = requireValue(codexCliConfigs[selectedDefaultProfileId], "默认 Codex profile");
const selectedCodexBaseConfig = {
  ...selectedCodexCliConfig,
  model_instructions_file: paths.targetCodexInstructions,
};
const instructionFilesByProfile = Object.fromEntries(
  Object.keys(codexCliConfigs).map((profileId) => [
    profileId,
    buildInstructionsPaths(paths.projectRoot, profileId, ""),
  ]),
);
const missingApiKeys = missingProviderApiKeyEnvNames(providers);

if (checkOnly) {
  const defaultConfigDrift = await detectDefaultConfigDrift(
    paths.targetCodexConfig,
    formatCodexConfigToml(selectedCodexBaseConfig),
  );
  const localProxyChecks = await checkCodexEnvLocalProxies(envConfig);
  const envManagedBlockCurrent = codexEnvManagedBlockIsCurrent(
    envConfig,
    (await pathExists(paths.targetCodexEnv)) ? await readFile(paths.targetCodexEnv, "utf8") : undefined,
  );

  printCheckSummary({
    configuredProviderCount: Object.keys(providers).length,
    modelGroups: modelProviderGroups(modelsConfig),
    codexProfileIds: Object.keys(codexCliConfigs),
    mcpServerIds: Object.keys(mcpConfig.servers ?? {}),
    codexEnvVarNames: Object.keys(envConfig.variables ?? {}),
    codexHome: paths.targetCodexConfigDir,
    selectedDefaultProfileId,
    providerGroups,
    missingApiKeys,
    defaultConfigDrift,
    localProxyChecks,
    envManagedBlockCurrent,
  });

  const versionResults = checkVersions(globalConfig);
  if (versionResults.length > 0) {
    console.log("");
    for (const vr of versionResults) {
      if (!vr.ok) {
        console.warn(`${color.yellow(vr.name)} 版本 ${vr.current} 低于最低要求 ${vr.minimum}。建议升级。`);
      } else {
        console.log(`${color.green("✓")} ${vr.name} 版本 ${vr.current}（最低要求 ${vr.minimum}，通过）`);
      }
    }
  }

  process.exit(0);
}

if (!dryRun) {
  await Promise.all([
    mkdir(paths.targetCodexConfigDir, { recursive: true }),
    mkdir(paths.targetCodexAgentDir, { recursive: true }),
  ]);
}

const stagedWriter =
  !dryRun && force
    ? await StagedFileWriter.create(resolve(paths.targetCodexConfigDir, ".ai-share-staging"))
    : undefined;

try {
  for (const [profileId, codexCliConfig] of Object.entries(codexCliConfigs)) {
    await writeGeneratedText(
      profileCodexConfigPath(paths.targetCodexConfigDir, profileId),
      formatCodexConfigToml(codexCliConfig),
    );
  }
  if (dryRun || force || !(await pathExists(paths.targetCodexConfig))) {
    await writeGeneratedText(paths.targetCodexConfig, formatCodexConfigToml(selectedCodexBaseConfig));
  } else {
    console.log(
      `${color.yellow("保留")} ${color.cyan("Codex CLI 现有默认配置")}：${color.bold(paths.targetCodexConfig)}（如需覆盖请运行 bun run ai:gen -- --force）`,
    );
  }

  await writeGeneratedText(
    paths.targetCodexInstructions,
    buildCodexInstructions(paths.projectRoot, selectedDefaultProfileId),
  );
  for (const profileId of Object.keys(codexCliConfigs)) {
    await writeGeneratedText(
      profileCodexInstructionsPath(paths.targetCodexConfigDir, profileId),
      buildCodexInstructions(paths.projectRoot, profileId),
    );
  }
  for (const [agentId, codexAgentConfig] of Object.entries(codexAgentConfigs)) {
    await writeGeneratedText(
      codexAgentConfigPath(paths.targetCodexAgentDir, agentId),
      formatCodexAgentToml(codexAgentConfig),
    );
  }
  for (const [profileId, omxConfig] of Object.entries(omxConfigs)) {
    await writeGeneratedJson(profileOmxConfigPath(paths.targetCodexConfigDir, profileId), omxConfig);
  }
  await writeGeneratedJson(
    paths.targetOmxConfig,
    requireValue(omxConfigs[selectedDefaultProfileId], "默认 OMX profile"),
  );
  await writeGeneratedJson(
    paths.targetRuntimeManifest,
    buildRuntimeManifest({
      paths,
      defaultProfileId: selectedDefaultProfileId,
      profileIds: Object.keys(codexCliConfigs),
      agentIds: Object.keys(codexAgentConfigs),
      mcpServerIds: Object.keys(mcpConfig.servers ?? {}),
      codexEnvVarNames: Object.keys(envConfig.variables ?? {}),
      skillIds: NATIVE_SKILLS.map((skill) => skill.name),
      instructionFilesByProfile,
      profilesConfig,
    }),
  );

  if (dryRun) {
    await writeText(paths.targetCodexEnv, buildCodexEnvFileWithManagedBlock(envConfig), { dryRun, force: true });
  } else if (stagedWriter) {
    const existingEnv = (await pathExists(paths.targetCodexEnv))
      ? await readFile(paths.targetCodexEnv, "utf8")
      : undefined;
    await stagedWriter.writeText(paths.targetCodexEnv, buildCodexEnvFileWithManagedBlock(envConfig, existingEnv));
  } else {
    const existingEnv = (await pathExists(paths.targetCodexEnv))
      ? await readFile(paths.targetCodexEnv, "utf8")
      : undefined;
    await atomicWriteFile(paths.targetCodexEnv, buildCodexEnvFileWithManagedBlock(envConfig, existingEnv));
    console.log(
      `${color.green("已更新")} ${color.cyan("Codex CLI .env managed block")}：${color.bold(paths.targetCodexEnv)}（保留 block 外用户内容）`,
    );
  }

  await installNativeSkills(
    paths,
    dryRun,
    force,
    stagedWriter ? (path, content) => stagedWriter.writeText(path, content) : undefined,
  );
  if (stagedWriter) {
    await stagedWriter.promote();
    console.log(
      `${color.green("已提交")} ${color.cyan("Codex 配置 staging")}：${color.bold(paths.targetCodexConfigDir)}`,
    );
  }
  await installLaunchers(paths, dryRun);
} catch (error) {
  await stagedWriter?.cleanup();
  throw error;
}

printGenerationSummary({
  dryRun,
  force,
  paths,
  codexProfileIds: Object.keys(codexCliConfigs),
  providerGroups,
});

async function loadYaml<T extends object>(fileName: string): Promise<T> {
  return (await loadConfigYaml(paths.configDir, fileName)) as T;
}

function printValidationErrors(errors: readonly { file: string; path: string; message: string }[]): void {
  for (const err of errors) {
    console.error(`${color.yellow(`[${err.file}]`)} ${err.message}（${err.path}）`);
  }
}

async function writeGeneratedText(path: string, content: string): Promise<void> {
  if (stagedWriter) {
    await stagedWriter.writeText(path, content);
    return;
  }
  await writeText(path, content, { dryRun, force });
}

async function writeGeneratedJson(path: string, value: unknown): Promise<void> {
  if (stagedWriter) {
    await stagedWriter.writeJson(path, value);
    return;
  }
  await writeJson(path, value, { dryRun, force });
}
