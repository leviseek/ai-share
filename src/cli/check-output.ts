import { createColor, type ColorPalette } from "./color.ts";

export type CheckStatus = "ok" | "warning" | "error";

export type CheckItem = {
  name: string;
  status: CheckStatus;
  summary: string;
  details?: unknown;
};

export type CheckReport = {
  status: CheckStatus;
  online: boolean;
  canary: boolean;
  elapsed_ms: number;
  checks: CheckItem[];
};

export function renderCheckReport(report: CheckReport, providerId: string, useColor: boolean): string {
  const palette = createColor(useColor);
  const statusIcon = report.status === "ok" ? "✓" : report.status === "warning" ? "⚠" : "✗";
  const metadata = palette.white(
    `Provider: ${providerId}  在线检查: ${report.online ? "已启用" : "未启用"}  耗时: ${report.elapsed_ms}ms`,
  );
  const lines = [
    palette.bold(palette.cyan("AI Check")) +
      `  ${paintStatus(report.status, `${statusIcon} ${report.status.toUpperCase()}`, palette)}`,
    metadata,
  ];
  const toolCheck = report.checks.find((check) => check.name === "tools");
  const checks = report.checks.filter((check) => check.name !== "tools");
  if (checks.length > 0) {
    lines.push("", palette.bold(palette.cyan("配置与运行检查")));
    for (const check of checks) appendTableCheck(lines, check, palette);
  }
  if (toolCheck) {
    lines.push("", palette.bold(palette.cyan("工具与集成状态")));
    if (typeof toolCheck.details === "string") {
      for (const line of toolCheck.details.split(/\r?\n/)) {
        const formatted = formatToolLine(line, palette);
        if (formatted === "") {
          lines.push("");
        } else {
          if (/^(工具安装状态|安装指令|配置提示)：$/.test(line.trim()) && lines.at(-1) !== "") lines.push("");
          lines.push(formatted);
        }
      }
    } else {
      appendCheck(lines, toolCheck, palette);
    }
  }
  return lines.join("\n");
}

function appendTableCheck(lines: string[], check: CheckItem, palette: ColorPalette): void {
  const symbol = check.status === "ok" ? "✓" : check.status === "warning" ? "!" : "✗";
  lines.push(
    `${paintStatus(check.status, symbol, palette)} ${palette.bold(check.name)}${palette.white(":")} ${check.summary}`,
  );
  if (typeof check.details === "string")
    lines.push(...check.details.split(/\r?\n/).map((line) => palette.white(`  ${line}`)));
}

function appendCheck(lines: string[], check: CheckItem, palette: ColorPalette): void {
  const symbol = check.status === "ok" ? "✓" : check.status === "warning" ? "!" : "✗";
  lines.push(
    `${paintStatus(check.status, symbol, palette)} ${palette.bold(check.name)}${palette.white(":")} ${check.summary}`,
  );
  if (typeof check.details === "string")
    lines.push(...check.details.split(/\r?\n/).map((line) => palette.white(`  ${line}`)));
}

function formatToolLine(line: string, palette: ColorPalette): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  const sourceIndent = line.length - line.trimStart().length;
  if (trimmed === "配置提示：") return palette.bold(palette.magenta(trimmed));
  if (/^(OpenSpec|CodeGraph)$/.test(trimmed)) {
    return palette.bold(palette.cyan(`  ${trimmed}`));
  }
  if (sourceIndent >= 2 && /^(初始化|安装后初始化|会话使用)$/.test(trimmed)) {
    return palette.bold(palette.yellow(`  ${trimmed}`));
  }
  if (sourceIndent === 0 && trimmed.endsWith("：") && !trimmed.startsWith("- ")) {
    return palette.bold(palette.yellow(trimmed));
  }
  if (trimmed.includes("：已安装")) return `  ${trimmed.slice(2, -4)}${palette.green("：已安装")}`;
  if (trimmed.includes("：未安装")) return `  ${trimmed.slice(2, -4)}${palette.yellow("：未安装")}`;
  if (trimmed.startsWith("- ")) return palette.bold(palette.cyan(`  ${trimmed.slice(2)}`));
  return palette.white(`${sourceIndent >= 4 ? "    " : "  "}${trimmed}`);
}

function paintStatus(status: CheckStatus, text: string, palette: ColorPalette): string {
  if (status === "ok") return palette.green(text);
  if (status === "warning") return palette.yellow(text);
  return palette.red(text);
}
