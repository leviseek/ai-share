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
  const action = promptMenu("请选择操作", [
    "设置默认模型",
    "更新提供商 baseURL",
    "更新提供商 API Key 环境变量名",
    "设置提供商 API Key 值",
    "添加提供商",
    "移除提供商",
    "为提供商添加模型",
    "从提供商移除模型",
    "保存并退出",
    "不保存退出",
  ]);

  if (action === "设置默认模型") setDefaultModel(config);
  if (action === "更新提供商 baseURL") updateProviderBaseUrl(config);
  if (action === "更新提供商 API Key 环境变量名") updateProviderApiKey(config);
  if (action === "设置提供商 API Key 值") setProviderApiKeyValue(config);
  if (action === "添加提供商") addProvider(config);
  if (action === "移除提供商") removeProvider(config);
  if (action === "为提供商添加模型") addModel(config);
  if (action === "从提供商移除模型") removeModel(config);
  if (action === "保存并退出") {
    validateNoPlainApiKeys(config);
    await writeFile(configPath, stringifyJsonc(config));
    console.log(`已保存 ${configPath}`);
    break;
  }
  if (action === "不保存退出") break;

  printReport(config);
}

async function ensureConfigExists(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`缺少 OpenCode 配置文件：${path}`);
  }
}

function asConfig(value: unknown): Config {
  if (!value || typeof value !== "object") throw new Error("OpenCode 配置必须是对象。");
  const configValue = value as Config;
  configValue.provider ??= {};
  return configValue;
}

function printReport(config: Config): { hasUnsafeApiKey: boolean } {
  console.log("\nAI 配置报告");
  console.log(`配置文件：${configPath}`);
  console.log(`默认模型：${config.model ?? "未设置"}`);
  console.log(`小模型：${config.small_model ?? "未设置"}`);

  const providers = Object.entries(config.provider ?? {});
  let hasUnsafeApiKey = false;
  if (providers.length === 0) {
    console.log("提供商：无");
    return { hasUnsafeApiKey };
  }

  console.log("提供商：");
  for (const [id, provider] of providers) {
    const models = Object.keys(provider.models ?? {});
    const apiKey = provider.options?.apiKey;
    const envName = getEnvName(apiKey);
    const apiKeyStatus = apiKey && !envName ? "不安全的明文值" : (apiKey ?? "未设置");
    if (apiKey && !envName) hasUnsafeApiKey = true;
    console.log(`- ${id} (${provider.name ?? id})`);
    console.log(`  baseURL: ${provider.options?.baseURL ?? "未设置"}`);
    console.log(
      `  apiKey: ${envName ? apiKey : apiKeyStatus}${envName ? `，环境变量 ${envName}=${Bun.env[envName] ? "已设置" : "缺失"}` : ""}`,
    );
    console.log(`  模型：${models.length === 0 ? "无" : models.join(", ")}`);
  }

  if (hasUnsafeApiKey) {
    console.log("\n检测到不安全的 apiKey。opencode.jsonc 只允许 {env:VARIABLE_NAME}，不要在配置中保存真实密钥。");
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
  const baseURL = promptText(`${provider.id} 的 baseURL`, current);
  provider.value.options ??= {};
  provider.value.options.baseURL = baseURL;
}

function updateProviderApiKey(config: Config): void {
  const provider = chooseProvider(config);
  if (!provider) return;
  const current = getEnvName(provider.value.options?.apiKey) ?? suggestedEnvName(provider.id);
  const envName = promptText(`${provider.id} 的 API Key 环境变量名`, current);
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

  const apiKey = promptSecret(`${envName} 的 API Key 值`);
  if (!apiKey) {
    console.log("已跳过空的 API Key 值。");
    return;
  }

  Bun.env[envName] = apiKey;
  setUserEnvironmentVariable(envName, apiKey);
  console.log(`已保存 API Key 到用户环境变量：${envName}`);
  console.log(`配置文件只保留该引用：{env:${envName}}`);
}

function addProvider(config: Config): void {
  config.provider ??= {};
  const id = promptText("提供商 ID", "my-provider");
  if (config.provider[id]) throw new Error(`提供商已存在：${id}`);

  const name = promptText("提供商显示名称", id);
  const baseURL = promptText("提供商 baseURL", "https://api.example.com/v1");
  const envName = promptText("API Key 环境变量名", suggestedEnvName(id));
  assertEnvName(envName);
  const firstModel = promptText("首个模型 ID", "model-id");
  const firstModelName = promptText("首个模型显示名称", firstModel);

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
  if (!confirmYes(`确认移除提供商 ${provider.id}？`)) return;
  delete config.provider?.[provider.id];

  if (config.model?.startsWith(`${provider.id}/`)) delete config.model;
  if (config.small_model?.startsWith(`${provider.id}/`)) delete config.small_model;
}

function addModel(config: Config): void {
  const provider = chooseProvider(config);
  if (!provider) return;
  provider.value.models ??= {};

  const id = promptText("模型 ID", "model-id");
  if (provider.value.models[id]) throw new Error(`模型已存在：${provider.id}/${id}`);

  const name = promptText("模型显示名称", id);
  const upstreamId = promptText("上游模型 ID，留空表示与模型 ID 相同", "");
  provider.value.models[id] = upstreamId ? { id: upstreamId, name } : { name };
}

function removeModel(config: Config): void {
  const provider = chooseProvider(config);
  if (!provider) return;
  const models = Object.keys(provider.value.models ?? {});
  if (models.length === 0) return console.log("没有可移除的模型。");

  const model = promptMenu("请选择要移除的模型", models);
  if (!confirmYes(`确认移除模型 ${provider.id}/${model}？`)) return;
  delete provider.value.models?.[model];

  if (config.model === `${provider.id}/${model}`) delete config.model;
  if (config.small_model === `${provider.id}/${model}`) delete config.small_model;
}

function chooseProvider(config: Config): { id: string; value: Provider } | undefined {
  const entries = Object.entries(config.provider ?? {});
  if (entries.length === 0) {
    console.log("尚未配置提供商。");
    return undefined;
  }

  const id = promptMenu(
    "请选择提供商",
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
    console.log("尚未配置模型。");
    return undefined;
  }

  return promptMenu("请选择模型", choices);
}

function promptMenu<T extends string>(title: string, choices: readonly T[]): T {
  console.log(`\n${title}`);
  choices.forEach((choice, index) => console.log(`${index + 1}. ${choice}`));

  while (true) {
    const answer = promptText("请选择", "1");
    const index = Number.parseInt(answer, 10) - 1;
    const choice = choices[index];
    if (choice) return choice;
    console.log("选择无效。");
  }
}

function promptText(label: string, defaultValue: string): string {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = prompt(`${label}${suffix}:`)?.trim();
  // 空输入表示接受显示的默认值。
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return answer ? answer : defaultValue;
}

function promptSecret(label: string): string {
  // Bun 的 prompt 在不同平台不稳定支持隐藏输入。
  // 该值不会写入 opencode.jsonc，但输入时可能在终端可见。
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
    throw new Error(`环境变量名无效：${envName}。只能使用大写字母、数字和下划线。`);
  }
}

function validateNoPlainApiKeys(config: Config): void {
  for (const [providerId, provider] of Object.entries(config.provider ?? {})) {
    const apiKey = provider.options?.apiKey;
    if (apiKey && !getEnvName(apiKey)) {
      throw new Error(`提供商 ${providerId} 配置了明文 apiKey。opencode.jsonc 只允许使用 {env:VARIABLE_NAME}。`);
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
      throw new Error(result.stderr.trim() || "设置 Windows 用户环境变量失败。");
    }
    return;
  }

  console.log("当前平台不会自动持久化环境变量。");
  console.log(`请将这一行添加到你的 shell 配置文件：export ${name}="${value.replaceAll('"', '\\"')}"`);
}

function escapePowerShell(value: string): string {
  return value.replaceAll("'", "''");
}
