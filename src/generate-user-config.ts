#!/usr/bin/env bun

import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentsYaml, GlobalYaml, McpYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "./types.ts";
import {
  applyProviderGroups,
  buildCodexAgentConfigs,
  buildCodexCliConfigs,
  buildCodexInstructions,
  buildInstructionsPaths,
  buildOmxConfigs,
  buildRuntimeManifest,
  defaultProfileId,
  formatCodexAgentToml,
  formatCodexConfigToml,
  modelProviderGroups,
  requireValue,
} from "./config-builders.ts";
import { missingProviderApiKeyEnvNames } from "./cli/api-keys.ts";
import { pathExists, writeJson, writeText } from "./cli/fs.ts";
import { installLaunchers, installNativeSkills } from "./cli/install.ts";
import { ensureAiWorkspaceLinks } from "./cli/memory-link.ts";
import { parseCliOptions } from "./cli/options.ts";
import { NATIVE_SKILLS } from "./cli/native-skills.ts";
import { color } from "./cli/color.ts";
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

const [globalConfig, providersConfig, modelsConfig, profilesConfig, agentsConfig, mcpConfig] = await Promise.all([
  loadYaml<GlobalYaml>("global.yaml"),
  loadYaml<ProviderYaml>("provider.yaml"),
  loadYaml<ModelsYaml>("models.yaml"),
  loadYaml<ProfilesYaml>("profiles.yaml"),
  loadYaml<AgentsYaml>("agents.yaml"),
  loadYaml<McpYaml>("mcp.yaml"),
]);

const providers = providersConfig.providers ?? {};
const models = applyProviderGroups(modelsConfig, providers, providerGroups);
const codexCliConfigs = buildCodexCliConfigs(providers, models, profilesConfig, mcpConfig, (profileId) =>
  profileCodexInstructionsPath(paths.targetCodexConfigDir, profileId),
);
const selectedDefaultProfileId = defaultProfileId(globalConfig, profilesConfig);
const codexAgentConfigs = buildCodexAgentConfigs(agentsConfig, models, profilesConfig, selectedDefaultProfileId);
const omxConfigs = buildOmxConfigs(models, profilesConfig);
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
  const checkValidationErrors = validateYamlConsistency(
    profilesConfig,
    modelsConfig,
    providersConfig,
    globalConfig,
    mcpConfig,
  );
  if (checkValidationErrors.length > 0) {
    for (const err of checkValidationErrors) {
      console.error(`${color.yellow(`[${err.file}]`)} ${err.message}（${err.path}）`);
    }
    if (!force) {
      console.error("校验失败。使用 --force 可忽略校验继续生成。");
      process.exit(1);
    }
  }

  printCheckSummary({
    configuredProviderCount: Object.keys(providers).length,
    modelGroups: modelProviderGroups(modelsConfig),
    codexProfileIds: Object.keys(codexCliConfigs),
    mcpServerIds: Object.keys(mcpConfig.servers ?? {}),
    codexHome: paths.targetCodexConfigDir,
    selectedDefaultProfileId,
    providerGroups,
    missingApiKeys,
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

const genValidationErrors = validateYamlConsistency(
  profilesConfig,
  modelsConfig,
  providersConfig,
  globalConfig,
  mcpConfig,
);
if (genValidationErrors.length > 0) {
  for (const err of genValidationErrors) {
    console.error(`${color.yellow(`[${err.file}]`)} ${err.message}（${err.path}）`);
  }
  if (!force) {
    throw new Error("YAML 配置校验失败。使用 --force 可忽略。");
  }
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
if (dryRun || !(await pathExists(paths.targetCodexConfig))) {
  await writeText(paths.targetCodexConfig, formatCodexConfigToml(selectedCodexBaseConfig), { dryRun, force });
} else {
  console.log(
    `${color.yellow("保留")} ${color.cyan("Codex CLI 现有默认配置")}：${color.bold(paths.targetCodexConfig)}（只更新 profile/agent/OMX 生成文件）`,
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
    skillIds: NATIVE_SKILLS.map((skill) => skill.name),
    instructionFilesByProfile,
  }),
  { dryRun, force },
);

await installNativeSkills(paths, dryRun, force);
await installLaunchers(paths, dryRun);

printGenerationSummary({
  dryRun,
  paths,
  codexProfileIds: Object.keys(codexCliConfigs),
  providerGroups,
});

async function loadYaml<T extends object>(fileName: string): Promise<T> {
  const value = parseYamlObject(await readFile(resolve(paths.configDir, fileName), "utf8"));
  return value as T;
}
