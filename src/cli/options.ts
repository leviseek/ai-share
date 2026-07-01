import type { CliOptions, ProviderGroupMap } from "../types.ts";
import { DEFAULT_PROVIDER_GROUPS } from "../config/provider-groups.ts";

type EnvSource = Record<string, string | undefined>;

export function parseCliOptions(argv: readonly string[] = Bun.argv, env: EnvSource = Bun.env): CliOptions {
  const args = new Set(argv.slice(2));
  return {
    force: args.has("--force"),
    dryRun: args.has("--dry-run"),
    checkOnly: args.has("--check"),
    providerGroups: parseProviderGroups(argv, env),
    providerGroupsSpecified: providerGroupsSpecified(argv, env),
  };
}

function parseOption(argv: readonly string[], name: string): string | undefined {
  const values = argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) return values[index + 1];
    if (value?.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return undefined;
}

function parseProviderGroups(argv: readonly string[], env: EnvSource): ProviderGroupMap {
  const sharedProvider = parseOption(argv, "--provider") ?? env.AI_SHARE_PROVIDER;
  return {
    ...DEFAULT_PROVIDER_GROUPS,
    ...(sharedProvider
      ? Object.fromEntries(Object.keys(DEFAULT_PROVIDER_GROUPS).map((groupId) => [groupId, sharedProvider]))
      : {}),
    gpt:
      parseOption(argv, "--gpt-provider") ?? env.AI_SHARE_GPT_PROVIDER ?? sharedProvider ?? DEFAULT_PROVIDER_GROUPS.gpt,
    ...parseProviderGroupOptions(argv),
  };
}

function providerGroupsSpecified(argv: readonly string[], env: EnvSource): boolean {
  return (
    parseOption(argv, "--provider") !== undefined ||
    parseOption(argv, "--gpt-provider") !== undefined ||
    parseOptions(argv, "--provider-group").length > 0 ||
    env.AI_SHARE_PROVIDER !== undefined ||
    env.AI_SHARE_GPT_PROVIDER !== undefined
  );
}

function parseProviderGroupOptions(argv: readonly string[]): ProviderGroupMap {
  const output: ProviderGroupMap = {};
  for (const value of parseOptions(argv, "--provider-group")) {
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error(`--provider-group 必须使用 group=provider 格式：${value}`);
    }
    output[value.slice(0, separatorIndex)] = value.slice(separatorIndex + 1);
  }
  return output;
}

function parseOptions(argv: readonly string[], name: string): string[] {
  const output: string[] = [];
  const values = argv.slice(2);
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
