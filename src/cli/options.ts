import type { CliOptions, ProviderGroupMap } from "../types.ts";

export function parseCliOptions(): CliOptions {
  const args = new Set(Bun.argv.slice(2));
  return {
    force: args.has("--force"),
    dryRun: args.has("--dry-run"),
    checkOnly: args.has("--check"),
    providerGroups: parseProviderGroups(),
  };
}

function parseOption(name: string): string | undefined {
  const values = Bun.argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) return values[index + 1];
    if (value?.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return undefined;
}

function parseProviderGroups(): ProviderGroupMap {
  return {
    gpt: parseOption("--gpt-provider") ?? Bun.env.AI_SHARE_GPT_PROVIDER ?? "codexapis",
    deepseek: Bun.env.AI_SHARE_DEEPSEEK_PROVIDER ?? "deepseek",
    ...parseProviderGroupOptions(),
  };
}

function parseProviderGroupOptions(): ProviderGroupMap {
  const output: ProviderGroupMap = {};
  for (const value of parseOptions("--provider-group")) {
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error(`--provider-group 必须使用 group=provider 格式：${value}`);
    }
    output[value.slice(0, separatorIndex)] = value.slice(separatorIndex + 1);
  }
  return output;
}

function parseOptions(name: string): string[] {
  const output: string[] = [];
  const values = Bun.argv.slice(2);
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
