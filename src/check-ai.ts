#!/usr/bin/env bun

import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseJsonc, stringifyJsonc } from "./jsonc.ts";

type Config = {
  $schema?: string;
  model?: string;
  small_model?: string;
  provider?: Record<string, Provider>;
};

type Provider = {
  name?: string;
  npm?: string;
  options?: {
    baseURL?: string;
    apiKey?: string;
    timeout?: number;
    chunkTimeout?: number;
    [key: string]: unknown;
  };
  models?: Record<string, Model>;
};

type Model = {
  id?: string;
  name?: string;
  options?: Record<string, unknown>;
  [key: string]: unknown;
};

const configPath = resolve(import.meta.dir, "..", "opencode.jsonc");
const readOnly = new Set(Bun.argv.slice(2)).has("--check");

await ensureConfigExists(configPath);
const config = asConfig(parseJsonc(await readFile(configPath, "utf8")));

const report = printReport(config);

if (readOnly) {
  if (report.hasUnsafeApiKey) process.exit(1);
  process.exit(0);
}

while (true) {
  const action = promptMenu("Choose an action", [
    "Set default model",
    "Update provider baseURL",
    "Update provider API key env var",
    "Set provider API key value",
    "Add provider",
    "Remove provider",
    "Add model to provider",
    "Remove model from provider",
    "Save and exit",
    "Exit without saving",
  ]);

  if (action === "Set default model") setDefaultModel(config);
  if (action === "Update provider baseURL") updateProviderBaseUrl(config);
  if (action === "Update provider API key env var") updateProviderApiKey(config);
  if (action === "Set provider API key value") setProviderApiKeyValue(config);
  if (action === "Add provider") addProvider(config);
  if (action === "Remove provider") removeProvider(config);
  if (action === "Add model to provider") addModel(config);
  if (action === "Remove model from provider") removeModel(config);
  if (action === "Save and exit") {
    validateNoPlainApiKeys(config);
    await writeFile(configPath, stringifyJsonc(config));
    console.log(`Saved ${configPath}`);
    break;
  }
  if (action === "Exit without saving") break;

  printReport(config);
}

async function ensureConfigExists(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`Missing OpenCode config: ${path}`);
  }
}

function asConfig(value: unknown): Config {
  if (!value || typeof value !== "object") throw new Error("OpenCode config must be an object.");
  const configValue = value as Config;
  configValue.provider ??= {};
  return configValue;
}

function printReport(config: Config): { hasUnsafeApiKey: boolean } {
  console.log("\nAI config report");
  console.log(`Config: ${configPath}`);
  console.log(`Default model: ${config.model ?? "not set"}`);
  console.log(`Small model: ${config.small_model ?? "not set"}`);

  const providers = Object.entries(config.provider ?? {});
  let hasUnsafeApiKey = false;
  if (providers.length === 0) {
    console.log("Providers: none");
    return { hasUnsafeApiKey };
  }

  console.log("Providers:");
  for (const [id, provider] of providers) {
    const models = Object.keys(provider.models ?? {});
    const apiKey = provider.options?.apiKey;
    const envName = getEnvName(apiKey);
    const apiKeyStatus = apiKey && !envName ? "unsafe plain value" : (apiKey ?? "not set");
    if (apiKey && !envName) hasUnsafeApiKey = true;
    console.log(`- ${id} (${provider.name ?? id})`);
    console.log(`  baseURL: ${provider.options?.baseURL ?? "not set"}`);
    console.log(
      `  apiKey: ${envName ? apiKey : apiKeyStatus}${envName ? `, env ${envName}=${Bun.env[envName] ? "set" : "missing"}` : ""}`,
    );
    console.log(`  models: ${models.length === 0 ? "none" : models.join(", ")}`);
  }

  if (hasUnsafeApiKey) {
    console.log(
      "\nUnsafe apiKey detected. opencode.jsonc only allows {env:VARIABLE_NAME}; never store real keys in config.",
    );
  }

  return { hasUnsafeApiKey };
}

function setDefaultModel(config: Config): void {
  const model = chooseModel(config);
  if (!model) return;
  config.model = model;
}

function updateProviderBaseUrl(config: Config): void {
  const provider = chooseProvider(config);
  if (!provider) return;
  const current = provider.value.options?.baseURL ?? "";
  const baseURL = promptText(`baseURL for ${provider.id}`, current);
  provider.value.options ??= {};
  provider.value.options.baseURL = baseURL;
}

function updateProviderApiKey(config: Config): void {
  const provider = chooseProvider(config);
  if (!provider) return;
  const current = getEnvName(provider.value.options?.apiKey) ?? suggestedEnvName(provider.id);
  const envName = promptText(`API key env var for ${provider.id}`, current);
  assertEnvName(envName);
  provider.value.options ??= {};
  provider.value.options.apiKey = `{env:${envName}}`;
}

function setProviderApiKeyValue(config: Config): void {
  const provider = chooseProvider(config);
  if (!provider) return;

  const envName = getEnvName(provider.value.options?.apiKey) ?? suggestedEnvName(provider.id);
  assertEnvName(envName);

  provider.value.options ??= {};
  provider.value.options.apiKey = `{env:${envName}}`;

  const apiKey = promptSecret(`API key value for ${envName}`);
  if (!apiKey) {
    console.log("Skipped empty API key value.");
    return;
  }

  Bun.env[envName] = apiKey;
  setUserEnvironmentVariable(envName, apiKey);
  console.log(`Saved API key to user environment variable: ${envName}`);
  console.log(`Config keeps only this reference: {env:${envName}}`);
}

function addProvider(config: Config): void {
  config.provider ??= {};
  const id = promptText("Provider id", "my-provider");
  if (config.provider[id]) throw new Error(`Provider already exists: ${id}`);

  const name = promptText("Provider display name", id);
  const baseURL = promptText("Provider baseURL", "https://api.example.com/v1");
  const envName = promptText("API key env var", suggestedEnvName(id));
  assertEnvName(envName);
  const firstModel = promptText("First model id", "model-id");
  const firstModelName = promptText("First model display name", firstModel);

  config.provider[id] = {
    name,
    npm: "@ai-sdk/openai-compatible",
    options: {
      baseURL,
      apiKey: `{env:${envName}}`,
      timeout: 600000,
      chunkTimeout: 30000,
    },
    models: {
      [firstModel]: {
        name: firstModelName,
      },
    },
  };
}

function removeProvider(config: Config): void {
  const provider = chooseProvider(config);
  if (!provider) return;
  if (!confirmYes(`Remove provider ${provider.id}?`)) return;
  delete config.provider?.[provider.id];

  if (config.model?.startsWith(`${provider.id}/`)) delete config.model;
  if (config.small_model?.startsWith(`${provider.id}/`)) delete config.small_model;
}

function addModel(config: Config): void {
  const provider = chooseProvider(config);
  if (!provider) return;
  provider.value.models ??= {};

  const id = promptText("Model id", "model-id");
  if (provider.value.models[id]) throw new Error(`Model already exists: ${provider.id}/${id}`);

  const name = promptText("Model display name", id);
  const upstreamId = promptText("Upstream model id, blank means same as model id", "");
  provider.value.models[id] = upstreamId ? { id: upstreamId, name } : { name };
}

function removeModel(config: Config): void {
  const provider = chooseProvider(config);
  if (!provider) return;
  const models = Object.keys(provider.value.models ?? {});
  if (models.length === 0) return console.log("No models to remove.");

  const model = promptMenu("Choose model to remove", models);
  if (!confirmYes(`Remove model ${provider.id}/${model}?`)) return;
  delete provider.value.models?.[model];

  if (config.model === `${provider.id}/${model}`) delete config.model;
  if (config.small_model === `${provider.id}/${model}`) delete config.small_model;
}

function chooseProvider(config: Config): { id: string; value: Provider } | undefined {
  const entries = Object.entries(config.provider ?? {});
  if (entries.length === 0) {
    console.log("No providers configured.");
    return undefined;
  }

  const id = promptMenu(
    "Choose provider",
    entries.map(([providerId]) => providerId),
  );
  const value = config.provider?.[id];
  return value ? { id, value } : undefined;
}

function chooseModel(config: Config): string | undefined {
  const choices = Object.entries(config.provider ?? {}).flatMap(([providerId, provider]) =>
    Object.keys(provider.models ?? {}).map((modelId) => `${providerId}/${modelId}`),
  );

  if (choices.length === 0) {
    console.log("No models configured.");
    return undefined;
  }

  return promptMenu("Choose model", choices);
}

function promptMenu<T extends string>(title: string, choices: readonly T[]): T {
  console.log(`\n${title}`);
  choices.forEach((choice, index) => console.log(`${index + 1}. ${choice}`));

  while (true) {
    const answer = promptText("Select", "1");
    const index = Number.parseInt(answer, 10) - 1;
    const choice = choices[index];
    if (choice) return choice;
    console.log("Invalid selection.");
  }
}

function promptText(label: string, defaultValue: string): string {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = prompt(`${label}${suffix}:`)?.trim();
  // Empty input means accepting the displayed default value.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return answer ? answer : defaultValue;
}

function promptSecret(label: string): string {
  // Bun's prompt does not support hidden input consistently across platforms.
  // The value is never written to opencode.jsonc, but it may be visible in the terminal while typing.
  return prompt(`${label}:`)?.trim() ?? "";
}

function confirmYes(label: string): boolean {
  const answer = prompt(`${label} [y/N]:`)?.trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

function getEnvName(apiKey: string | undefined): string | undefined {
  return apiKey?.match(/^\{env:([A-Z0-9_]+)\}$/)?.[1];
}

function suggestedEnvName(providerId: string): string {
  return `${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

function assertEnvName(envName: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(envName)) {
    throw new Error(`Invalid env var name: ${envName}. Use uppercase letters, numbers, and underscores only.`);
  }
}

function validateNoPlainApiKeys(config: Config): void {
  for (const [providerId, provider] of Object.entries(config.provider ?? {})) {
    const apiKey = provider.options?.apiKey;
    if (apiKey && !getEnvName(apiKey)) {
      throw new Error(
        `Provider ${providerId} has a plain apiKey. Only {env:VARIABLE_NAME} is allowed in opencode.jsonc.`,
      );
    }
  }
}

function setUserEnvironmentVariable(name: string, value: string): void {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `[Environment]::SetEnvironmentVariable('${escapePowerShell(name)}', $env:AI_SHARE_API_KEY_VALUE, 'User')`,
      ],
      { env: { ...process.env, AI_SHARE_API_KEY_VALUE: value }, stdio: "pipe", encoding: "utf8" },
    );

    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || "Failed to set Windows user environment variable.");
    }
    return;
  }

  console.log("Persistent environment update is not automatic on this platform.");
  console.log(`Add this to your shell profile: export ${name}="${value.replaceAll('"', '\\"')}"`);
}

function escapePowerShell(value: string): string {
  return value.replaceAll("'", "''");
}
