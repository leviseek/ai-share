#!/usr/bin/env bun

import { resolve } from "node:path";
import { buildCodexCliConfig, formatCodexConfigToml } from "../config-builders.ts";
import { loadValidatedConfig, ConfigValidationError, formatValidationError } from "../config/load.ts";
import { resolveProviderId } from "./options.ts";

const projectRoot = resolve(import.meta.dirname, "..", "..");

if (import.meta.main) {
  try {
    const config = await loadValidatedConfig(resolve(projectRoot, "config"));
    const providerId = resolveProviderId({
      defaultProvider: config.global.provider,
    });
    if (!config.providers.providers[providerId]) throw new Error(`提供商未定义：${providerId}`);
    Bun.TOML.parse(formatCodexConfigToml(buildCodexCliConfig(config, providerId, "<CODEX_HOME>/AGENTS.md")));
    console.log(`配置检查通过：model=${config.global.model} provider=${providerId}`);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      for (const finding of error.errors) console.error(formatValidationError(finding));
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  }
}
