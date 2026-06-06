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
import { atomicWriteFile, pathExists, writeJson, writeText } from "./cli/fs.ts";
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
import { validateYamlConsistency } from "./config/validation.ts";
import { parseYamlObject } from "./yaml.ts";

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

for (const [profileId, codexCliConfig] of Object.entries(codexCliConfigs)) {
  await writeText(
    profileCodexConfigPath(paths.targetCodexConfigDir, profileId),
    formatCodexConfigToml(codexCliConfig),
    { dryRun, force },
  );
}
if (dryRun || force || !(await pathExists(paths.targetCodexConfig))) {
  await writeText(paths.targetCodexConfig, formatCodexConfigToml(selectedCodexBaseConfig), { dryRun, force });
} else {
  console.log(
    `${color.yellow("保留")} ${color.cyan("Codex CLI 现有默认配置")}：${color.bold(paths.targetCodexConfig)}（如需覆盖请运行 bun run ai:gen -- --force）`,
  );
}

await writeText(paths.targetCodexInstructions, buildCodexInstructions(paths.projectRoot, selectedDefaultProfileId), {
  dryRun,
  force,
});
for (const profileId of Object.keys(codexCliConfigs)) {
  await writeText(
    profileCodexInstructionsPath(paths.targetCodexConfigDir, profileId),
    buildCodexInstructions(paths.projectRoot, profileId),
    { dryRun, force },
  );
}
for (const [agentId, codexAgentConfig] of Object.entries(codexAgentConfigs)) {
  await writeText(codexAgentConfigPath(paths.targetCodexAgentDir, agentId), formatCodexAgentToml(codexAgentConfig), {
    dryRun,
    force,
  });
}
for (const [profileId, omxConfig] of Object.entries(omxConfigs)) {
  await writeJson(profileOmxConfigPath(paths.targetCodexConfigDir, profileId), omxConfig, { dryRun, force });
}
await writeJson(paths.targetOmxConfig, requireValue(omxConfigs[selectedDefaultProfileId], "默认 OMX profile"), {
  dryRun,
  force,
});
await writeJson(
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
  { dryRun, force },
);

if (dryRun) {
  await writeText(paths.targetCodexEnv, buildCodexEnvFileWithManagedBlock(envConfig), { dryRun, force: true });
} else {
  const existingEnv = (await pathExists(paths.targetCodexEnv))
    ? await readFile(paths.targetCodexEnv, "utf8")
    : undefined;
  await atomicWriteFile(paths.targetCodexEnv, buildCodexEnvFileWithManagedBlock(envConfig, existingEnv));
  console.log(
    `${color.green("已更新")} ${color.cyan("Codex CLI .env managed block")}：${color.bold(paths.targetCodexEnv)}（保留 block 外用户内容）`,
  );
}

await installNativeSkills(paths, dryRun, force);
await installLaunchers(paths, dryRun);

printGenerationSummary({
  dryRun,
  force,
  paths,
  codexProfileIds: Object.keys(codexCliConfigs),
  providerGroups,
});

async function loadYaml<T extends object>(fileName: string): Promise<T> {
  const value = parseYamlObject(await readFile(resolve(paths.configDir, fileName), "utf8"));
  return value as T;
}

function printValidationErrors(errors: readonly { file: string; path: string; message: string }[]): void {
  for (const err of errors) {
    console.error(`${color.yellow(`[${err.file}]`)} ${err.message}（${err.path}）`);
  }
}
