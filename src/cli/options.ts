import type { CliOptions, ProviderGroupMap } from "../types.ts";
import { DEFAULT_PROVIDER_GROUPS } from "../config/provider-groups.ts";
import { argsFromArgv, parseOptionValue, parseOptionValues } from "./args.ts";

type EnvSource = Record<string, string | undefined>;

export function parseCliOptions(argv: readonly string[] = Bun.argv, env: EnvSource = Bun.env): CliOptions {
  const values = argsFromArgv(argv);
  const args = new Set(values);
  return {
    force: args.has("--force"),
    dryRun: args.has("--dry-run"),
    checkOnly: args.has("--check"),
    providerGroups: parseProviderGroups(values, env),
    providerGroupsSpecified: providerGroupsSpecified(values, env),
  };
}

function parseProviderGroups(args: readonly string[], env: EnvSource): ProviderGroupMap {
  const sharedProvider = parseOptionValue(args, "--provider") ?? env.AI_SHARE_PROVIDER;
  return {
    ...DEFAULT_PROVIDER_GROUPS,
    ...(sharedProvider
      ? Object.fromEntries(Object.keys(DEFAULT_PROVIDER_GROUPS).map((groupId) => [groupId, sharedProvider]))
      : {}),
    gpt:
      parseOptionValue(args, "--gpt-provider") ??
      env.AI_SHARE_GPT_PROVIDER ??
      sharedProvider ??
      DEFAULT_PROVIDER_GROUPS.gpt,
    ...parseProviderGroupOptions(args),
  };
}

function providerGroupsSpecified(args: readonly string[], env: EnvSource): boolean {
  return (
    parseOptionValue(args, "--provider") !== undefined ||
    parseOptionValue(args, "--gpt-provider") !== undefined ||
    parseOptionValues(args, "--provider-group").length > 0 ||
    env.AI_SHARE_PROVIDER !== undefined ||
    env.AI_SHARE_GPT_PROVIDER !== undefined
  );
}

function parseProviderGroupOptions(args: readonly string[]): ProviderGroupMap {
  const output: ProviderGroupMap = {};
  for (const value of parseOptionValues(args, "--provider-group")) {
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error(`--provider-group 必须使用 group=provider 格式：${value}`);
    }
    output[value.slice(0, separatorIndex)] = value.slice(separatorIndex + 1);
  }
  return output;
}
