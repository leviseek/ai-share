export function argsFromArgv(argv: readonly string[] = Bun.argv): string[] {
  return argv.slice(2);
}

export function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

export function parseOptionValue(
  args: readonly string[],
  name: string,
  options: { missingValue?: "undefined" | "true" | "error" } = {},
): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === name) {
      const nextValue = nextOptionValue(args, index);
      if (nextValue !== undefined) return nextValue;
      if (options.missingValue === "true") return "true";
      if (options.missingValue === "error") throw new Error(`缺少参数值：${name}`);
      return undefined;
    }
    if (value?.startsWith(`${name}=`)) {
      const inlineValue = value.slice(name.length + 1);
      if (inlineValue) return inlineValue;
      if (options.missingValue === "true") return "true";
      if (options.missingValue === "error") throw new Error(`缺少参数值：${name}`);
      return undefined;
    }
  }
  return undefined;
}

export function parseBooleanOption(name: string, value: string): boolean {
  if (["1", "true", "yes", "y"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "n"].includes(value.toLowerCase())) return false;
  throw new Error(`${name} 只支持 true/false：${value}`);
}

function nextOptionValue(args: readonly string[], index: number): string | undefined {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) return undefined;
  return value;
}
