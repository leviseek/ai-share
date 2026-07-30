#!/usr/bin/env bun

import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { EnvYaml, GlobalYaml, McpYaml, ModelsYaml, ProviderYaml } from "./types.ts";
import {
  applyProviderGroups,
  buildCodexCliConfig,
  buildCodexInstructions,
  buildCodexEnvFileWithManagedBlock,
  buildInstructionsPaths,
  buildRuntimeManifest,
  formatCodexConfigToml,
  modelProviderGroups,
} from "./config-builders.ts";
import { collectConfigDiagnostics } from "./cli/config-diagnostics.ts";
import { atomicWriteFile, pathExists, StagedFileWriter, writeJson, writeText } from "./cli/fs.ts";
import { installNativeSkills } from "./cli/install.ts";
import { ensureAiWorkspaceLinks } from "./cli/memory-link.ts";
import { parseCliOptions } from "./cli/options.ts";
import { selectProviderGroupsIfInteractive } from "./cli/provider-select.ts";
import { NATIVE_SKILLS } from "./cli/native-skills.ts";
import { color } from "./cli/color.ts";
import { printCheckSummary, printGenerationSummary } from "./cli/output.ts";
import { buildGeneratorPaths } from "./cli/paths.ts";
import { listLocalConfigOverlays, loadConfigYaml } from "./config/local-overlay.ts";
import { validateYamlConsistency } from "./config/validation.ts";

const cliOptions = parseCliOptions();
const { force, dryRun, checkOnly } = cliOptions;
let { providerGroups } = cliOptions;
const paths = buildGeneratorPaths();

if (!checkOnly) {
  await ensureAiWorkspaceLinks(paths, dryRun);
}

const [globalConfig, providersConfig, modelsConfig, mcpConfig, envConfig] = await Promise.all([
  loadYaml<GlobalYaml>("global.yaml"),
  loadYaml<ProviderYaml>("provider.yaml"),
  loadYaml<ModelsYaml>("models.yaml"),
  loadYaml<McpYaml>("mcp.yaml"),
  loadYaml<EnvYaml>("env.yaml"),
]);

const validationErrors = validateYamlConsistency(modelsConfig, providersConfig, globalConfig, mcpConfig, envConfig);
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
const codexCliConfig = buildCodexCliConfig(providers, models, globalConfig, mcpConfig, paths.targetCodexInstructions);
const instructionFiles = buildInstructionsPaths(paths.projectRoot, "");
const localConfigOverlays = await listLocalConfigOverlays(paths.configDir);

if (checkOnly) {
  const diagnostics = await collectConfigDiagnostics({
    paths,
    providers,
    envConfig,
    globalConfig,
    expectedCodexConfig: formatCodexConfigToml(codexCliConfig),
  });

  printCheckSummary({
    configuredProviderCount: Object.keys(providers).length,
    modelGroups: modelProviderGroups(modelsConfig),
    modelId: globalConfig.model ?? "",
    mcpServerIds: Object.keys(mcpConfig.servers ?? {}),
    codexEnvVarNames: Object.keys(envConfig.variables ?? {}),
    localConfigOverlays,
    codexHome: paths.targetCodexConfigDir,
    providerGroups,
    missingApiKeys: diagnostics.missingApiKeys.value,
    defaultConfigDrift: diagnostics.defaultConfigDrift.value,
    localProxyChecks: diagnostics.localProxyChecks.value,
    envManagedBlockCurrent: diagnostics.envManagedBlockCurrent.value,
  });

  const versionResults = diagnostics.versionResults.value;
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
  if (dryRun || force || !(await pathExists(paths.targetCodexConfig))) {
    await writeGeneratedText(paths.targetCodexConfig, formatCodexConfigToml(codexCliConfig));
  } else {
    console.log(
      `${color.yellow("保留")} ${color.cyan("Codex CLI 现有默认配置")}：${color.bold(paths.targetCodexConfig)}（如需覆盖请运行 bun run ai:gen -- --force）`,
    );
  }

  await writeGeneratedText(paths.targetCodexInstructions, buildCodexInstructions(paths.projectRoot));
  await writeGeneratedJson(
    paths.targetRuntimeManifest,
    buildRuntimeManifest({
      paths,
      model: globalConfig.model ?? "",
      mcpServerIds: Object.keys(mcpConfig.servers ?? {}),
      codexEnvVarNames: Object.keys(envConfig.variables ?? {}),
      localConfigOverlays,
      skillIds: NATIVE_SKILLS.map((skill) => skill.name),
      instructionFiles,
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
} catch (error) {
  await stagedWriter?.cleanup();
  throw error;
}

printGenerationSummary({
  dryRun,
  force,
  paths,
  modelId: globalConfig.model ?? "",
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
