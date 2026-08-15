export function parseJsonc(content: string): unknown {
  const withoutComments = stripJsoncComments(content.replace(/^\uFEFF/, ""));
  return JSON.parse(stripJsoncTrailingCommas(withoutComments));
}

export function stripJsoncComments(content: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    const next = content[index + 1] ?? "";

    if (inLineComment) {
      if (character === "\n" || character === "\r") {
        inLineComment = false;
        output += character;
      }
      continue;
    }

    if (inBlockComment) {
      if (character === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      } else if (character === "\n" || character === "\r") {
        output += character;
      }
      continue;
    }

    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === "/" && next === "/") {
      inLineComment = true;
      index += 1;
    } else if (character === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
    } else {
      output += character;
    }
  }

  if (inBlockComment) throw new Error("JSONC 注释未闭合");
  return output;
}

function stripJsoncTrailingCommas(content: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character !== ",") {
      output += character;
      continue;
    }

    let nextIndex = index + 1;
    while (/\s/.test(content[nextIndex] ?? "")) nextIndex += 1;
    if (content[nextIndex] !== "]" && content[nextIndex] !== "}") output += character;
  }

  return output;
}
