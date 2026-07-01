#!/usr/bin/env bun

import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  EnvYaml,
  GlobalYaml,
  McpYaml,
  ModelsYaml,
  ProviderGroupMap,
  ProviderSource,
  ProfileEvalYaml,
  ProfilesYaml,
  ProviderYaml,
} from "./types.ts";
import {
  applyProviderGroups,
  buildCodexCliConfigs,
  buildCodexInstructions,
  buildCodexEnvFileWithManagedBlock,
  buildInstructionsPaths,
  buildRuntimeManifest,
  codexEnvManagedBlockIsCurrent,
  defaultProfileId,
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
import { buildGeneratorPaths, profileCodexConfigPath, profileCodexInstructionsPath } from "./cli/paths.ts";
import { checkVersions } from "./cli/registry-check.ts";
import { listLocalConfigOverlays, loadConfigYaml } from "./config/local-overlay.ts";
import { validateYamlConsistency } from "./config/validation.ts";

const cliOptions = parseCliOptions();
const { force, dryRun, checkOnly } = cliOptions;
let { providerGroups } = cliOptions;
const paths = buildGeneratorPaths();

if (!checkOnly) {
  await ensureAiWorkspaceLinks(paths, dryRun);
}

const [globalConfig, providersConfig, modelsConfig, profilesConfig, mcpConfig, envConfig, profileEvalConfig] =
  await Promise.all([
    loadYaml<GlobalYaml>("global.yaml"),
    loadYaml<ProviderYaml>("provider.yaml"),
    loadYaml<ModelsYaml>("models.yaml"),
    loadYaml<ProfilesYaml>("profiles.yaml"),
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
if (!checkOnly && !cliOptions.providerGroupsSpecified) {
  providerGroups = await selectProviderGroupsIfInteractive(providerGroups, providers, modelsConfig);
}
const models = applyProviderGroups(modelsConfig, providers, providerGroups);
const effectiveProfilesConfig = alignProfilesToSingleProvider(profilesConfig, modelsConfig, providerGroups);
const codexCliConfigs = buildCodexCliConfigs(providers, models, effectiveProfilesConfig, mcpConfig, (profileId) =>
  profileCodexInstructionsPath(paths.targetCodexConfigDir, profileId),
);
const selectedDefaultProfileId = defaultProfileId(globalConfig, effectiveProfilesConfig);
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
const localConfigOverlays = await listLocalConfigOverlays(paths.configDir);

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
    localConfigOverlays,
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
  await Promise.all([mkdir(paths.targetCodexConfigDir, { recursive: true })]);
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
  await writeGeneratedJson(
    paths.targetRuntimeManifest,
    buildRuntimeManifest({
      paths,
      defaultProfileId: selectedDefaultProfileId,
      profileIds: Object.keys(codexCliConfigs),
      mcpServerIds: Object.keys(mcpConfig.servers ?? {}),
      codexEnvVarNames: Object.keys(envConfig.variables ?? {}),
      localConfigOverlays,
      skillIds: NATIVE_SKILLS.map((skill) => skill.name),
      instructionFilesByProfile,
      profilesConfig: effectiveProfilesConfig,
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

async function selectProviderGroupsIfInteractive(
  currentProviderGroups: ProviderGroupMap,
  providers: Record<string, ProviderSource>,
  modelsConfig: ModelsYaml,
): Promise<ProviderGroupMap> {
  const providerIds = Object.keys(providers);
  const providerGroupIds = configuredProviderGroupIds(modelsConfig);
  if (providerIds.length === 0 || providerGroupIds.length === 0) return currentProviderGroups;
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    return currentProviderGroups;
  }

  const selectedProviderId = await selectProviderForGroups({
    providers,
    providerIds,
    currentProviderGroups,
  });
  const selectedProviderGroups: ProviderGroupMap = {};
  for (const groupId of providerGroupIds) {
    selectedProviderGroups[groupId] = selectedProviderId;
  }
  console.log(`${color.green("已选择 provider")}：${selectedProviderId}`);
  return selectedProviderGroups;
}

function configuredProviderGroupIds(modelsConfig: ModelsYaml): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const model of Object.values(modelsConfig)) {
    if (typeof model.provider_group !== "string" || seen.has(model.provider_group)) continue;
    seen.add(model.provider_group);
    output.push(model.provider_group);
  }
  return output;
}

function alignProfilesToSingleProvider(
  profilesConfig: ProfilesYaml,
  modelsConfig: ModelsYaml,
  providerGroups: ProviderGroupMap,
): ProfilesYaml {
  const selectedProviderIds = [...new Set(Object.values(providerGroups))];
  if (selectedProviderIds.length !== 1) return profilesConfig;

  const targetGroupId = modelGroupForSingleProvider(requireValue(selectedProviderIds[0], "provider"));
  if (!targetGroupId) return profilesConfig;

  return Object.fromEntries(
    Object.entries(profilesConfig).map(([profileId, profile]) => {
      const familyProfiles = familyProfileModels()[targetGroupId];
      const modelIds = familyProfiles[profileId] ?? familyProfiles.balanced;
      if (!modelIds || !profile.models) return [profileId, profile];
      if (!modelIdsExist(modelIds, modelsConfig)) return [profileId, profile];
      return [
        profileId,
        {
          ...profile,
          models: {
            ...profile.models,
            ...modelIds,
          },
        },
      ];
    }),
  );
}

function modelGroupForSingleProvider(providerId: string): "gpt" | undefined {
  void providerId;
  return "gpt";
}

function modelIdsExist(modelIds: Record<"primary" | "reasoning" | "fast", string>, modelsConfig: ModelsYaml): boolean {
  return modelIds.primary in modelsConfig && modelIds.reasoning in modelsConfig && modelIds.fast in modelsConfig;
}

function familyProfileModels(): Readonly<
  Record<"gpt", Record<string, Record<"primary" | "reasoning" | "fast", string>>>
> {
  return {
    gpt: {
      lite: { primary: "gpt-5.4", reasoning: "gpt-5.4", fast: "gpt-5.4-mini" },
      economy: { primary: "gpt-5.4-mini", reasoning: "gpt-5.4", fast: "gpt-5.4-mini" },
      cheap: { primary: "gpt-5.4-mini", reasoning: "gpt-5.4", fast: "gpt-5.4-mini" },
      balanced: { primary: "gpt-5.5", reasoning: "gpt-5.5", fast: "gpt-5.4-mini" },
      coding: { primary: "gpt-5.5-coding", reasoning: "gpt-5.5-coding", fast: "gpt-5.4-mini" },
      research: { primary: "gpt-5.5", reasoning: "gpt-5.5", fast: "gpt-5.4-mini" },
      writing: { primary: "gpt-5.5", reasoning: "gpt-5.5", fast: "gpt-5.4-mini" },
      max: { primary: "gpt-5.5", reasoning: "gpt-5.5", fast: "gpt-5.4" },
    },
  };
}

async function selectProviderForGroups(input: {
  providers: Record<string, ProviderSource>;
  providerIds: string[];
  currentProviderGroups: ProviderGroupMap;
}): Promise<string> {
  const choices = input.providerIds;
  const currentDefaultProvider = input.currentProviderGroups.gpt;
  let selectedIndex = Math.max(0, choices.indexOf(currentDefaultProvider ?? ""));

  return await new Promise<string>((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let finished = false;
    const cleanup = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l");
    };
    const finish = (providerId: string): void => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(providerId);
    };
    const selectedChoice = (): string => requireValue(choices[selectedIndex] ?? choices[0], "provider 选择");
    const render = (): void => {
      stdout.write("\x1b[H\x1b[2J");
      stdout.write(`${color.cyan("ai:gen provider 选择")}：${color.bold("选择一次后立即生成")}\n`);
      stdout.write("↑/↓ 切换，Enter 确认；也可按数字键或鼠标点击选择。\n\n");
      choices.forEach((providerId, index) => {
        const provider = input.providers[providerId];
        const marker = index === selectedIndex ? color.green("›") : " ";
        const label = provider?.name ?? providerId;
        const baseUrl = provider?.base_url ? ` ${provider.base_url}` : "";
        stdout.write(`${marker} ${index + 1}. ${providerId} (${label})${baseUrl}\n`);
      });
    };
    const onData = (data: Buffer): void => {
      const value = data.toString("utf8");
      if (value === "\u0003") {
        cleanup();
        process.exit(130);
      }
      if (value.includes("\r") || value.includes("\n")) {
        finish(selectedChoice());
        return;
      }
      if (value === "\x1b[A") {
        selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
        render();
        return;
      }
      if (value === "\x1b[B") {
        selectedIndex = (selectedIndex + 1) % choices.length;
        render();
        return;
      }
      const numberValue = Number(value);
      if (Number.isInteger(numberValue) && numberValue >= 1 && numberValue <= choices.length) {
        finish(requireValue(choices[numberValue - 1], "provider 选择"));
        return;
      }

      const mouseClick = sgrMousePattern().exec(value);
      if (mouseClick?.[1]) {
        const row = Number(mouseClick[1]);
        const clickedIndex = row - 4;
        if (Number.isInteger(clickedIndex) && clickedIndex >= 0 && clickedIndex < choices.length) {
          finish(requireValue(choices[clickedIndex], "provider 选择"));
        }
      }
    };

    stdout.write("\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
    render();
  });
}

function sgrMousePattern(): RegExp {
  return new RegExp(`${escapeSequence()}\\[<0;\\d+;(\\d+)M`);
}

function escapeSequence(): string {
  return String.fromCharCode(27);
}
