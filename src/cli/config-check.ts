#!/usr/bin/env bun

import { resolve } from "node:path";
import { buildOpenCodeConfig, buildInstructionsPaths, formatOpenCodeConfigJsonc } from "../config-builders.ts";
import { loadValidatedConfig, ConfigValidationError, formatValidationError } from "../config/load.ts";
import { resolveProviderId } from "./options.ts";
import { formatInstallRunResult, runInstall } from "./ai-install.ts";
import { resolveProviderModelDecision } from "../config/provider-model.ts";

const projectRoot = resolve(import.meta.dirname, "..", "..");

if (import.meta.main) {
  try {
    const config = await loadValidatedConfig(resolve(projectRoot, "config"));
    const providerId = resolveProviderId({
      defaultProvider: config.global.provider,
    });
    if (!config.providers.providers[providerId]) throw new Error(`提供商未定义：${providerId}`);
    const modelDecision = resolveProviderModelDecision(config, providerId);
    const output = formatOpenCodeConfigJsonc(
      buildOpenCodeConfig(
        config,
        providerId,
        modelDecision.modelId,
        buildInstructionsPaths(projectRoot),
        "<OPENCODE_CONFIG_DIR>/skills",
      ),
    );
    JSON.parse(output.slice(output.indexOf("{")));
    console.log(`配置检查通过：model=${modelDecision.modelId} provider=${providerId}`);
    const installResult = await runInstall();
    console.log(formatInstallRunResult(installResult));
    if (!installResult.ok) process.exitCode = 1;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      for (const finding of error.errors) console.error(formatValidationError(finding));
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  }
}
