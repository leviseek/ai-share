type YamlObject = Record<string, unknown>;

type StackItem = {
  indent: number;
  value: YamlObject;
};

export function parseYamlObject(text: string): YamlObject {
  const root: YamlObject = {};
  const stack: StackItem[] = [{ indent: -1, value: root }];
  const lines = text.replaceAll("\r\n", "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const originalLine = lines[index] ?? "";
    const line = stripComment(originalLine);
    if (!line.trim()) continue;

    const indent = countIndent(line);
    const trimmed = line.trim();
    while (stack.length > 1 && indent <= (stack.at(-1)?.indent ?? -1)) stack.pop();

    const parent = stack.at(-1)?.value;
    if (!parent) throw new Error(`YAML 缩进无效：第 ${index + 1} 行`);

    if (trimmed.startsWith("- ")) {
      throw new Error(`暂不支持顶层或对象数组 YAML 语法：第 ${index + 1} 行`);
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 0) throw new Error(`YAML 行缺少冒号：第 ${index + 1} 行`);

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key) throw new Error(`YAML 键名为空：第 ${index + 1} 行`);

    if (rawValue === "") {
      const list = collectList(lines, index + 1, indent);
      if (list) {
        parent[key] = list.values;
        index = list.endIndex;
        continue;
      }

      const child: YamlObject = {};
      parent[key] = child;
      stack.push({ indent, value: child });
      continue;
    }

    if (rawValue === "|") {
      const block = collectBlock(lines, index + 1, indent);
      parent[key] = block.value;
      index = block.endIndex;
      continue;
    }

    if (rawValue === "[]") {
      parent[key] = [];
      continue;
    }

    parent[key] = parseScalar(rawValue);
  }

  return root;
}

function collectList(
  lines: readonly string[],
  startIndex: number,
  parentIndent: number,
): { values: unknown[]; endIndex: number } | undefined {
  const values: unknown[] = [];
  let endIndex = startIndex - 1;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = stripComment(lines[index] ?? "");
    if (!line.trim()) continue;

    const indent = countIndent(line);
    const trimmed = line.trim();
    if (indent <= parentIndent) break;
    if (!trimmed.startsWith("- ")) break;

    values.push(parseScalar(trimmed.slice(2).trim()));
    endIndex = index;
  }

  return values.length > 0 ? { values, endIndex } : undefined;
}

function collectBlock(
  lines: readonly string[],
  startIndex: number,
  parentIndent: number,
): { value: string; endIndex: number } {
  const blockLines: string[] = [];
  let endIndex = startIndex - 1;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      blockLines.push("");
      endIndex = index;
      continue;
    }

    const indent = countIndent(line);
    if (indent <= parentIndent) break;
    blockLines.push(line.slice(Math.min(indent, parentIndent + 2)));
    endIndex = index;
  }

  return { value: `${blockLines.join("\n").trimEnd()}\n`, endIndex };
}

function parseScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function stripComment(line: string): string {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    if (char === "#" && !inSingleQuote && !inDoubleQuote) return line.slice(0, index).trimEnd();
  }

  return line.trimEnd();
}

function countIndent(line: string): number {
  return line.length - line.trimStart().length;
}
