import { createColor, type ColorPalette } from "./color.ts";

export type DoctorStatus = "ok" | "warning" | "error";

export type DoctorCheck = {
  name: string;
  status: DoctorStatus;
  summary: string;
  details?: unknown;
};

export type DoctorReport = {
  status: DoctorStatus;
  online: boolean;
  canary: boolean;
  elapsed_ms: number;
  checks: DoctorCheck[];
};

export function renderDoctorReport(report: DoctorReport, providerId: string, useColor: boolean): string {
  const palette = createColor(useColor);
  const status = paintStatus(report.status, report.status.toUpperCase(), palette);
  const metadata = palette.gray(`provider=${providerId} online=${report.online} (${report.elapsed_ms}ms)`);
  const lines = [`${palette.bold("ai:doctor")} ${status} ${metadata}`];

  for (const check of report.checks) {
    const symbol = check.status === "ok" ? "✓" : check.status === "warning" ? "!" : "✗";
    lines.push(
      `${paintStatus(check.status, symbol, palette)} ${palette.bold(check.name)}${palette.gray(":")} ${check.summary}`,
    );
  }
  return lines.join("\n");
}

function paintStatus(status: DoctorStatus, text: string, palette: ColorPalette): string {
  if (status === "ok") return palette.green(text);
  if (status === "warning") return palette.yellow(text);
  return palette.red(text);
}
