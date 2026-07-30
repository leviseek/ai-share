import { describe, expect, test } from "bun:test";
import { renderDoctorReport, type DoctorReport } from "./doctor-output.ts";

const report: DoctorReport = {
  status: "warning",
  online: false,
  canary: false,
  elapsed_ms: 42,
  checks: [
    { name: "local_proxy", status: "ok", summary: "本地代理可达：127.0.0.1:7897。" },
    { name: "api_key_env", status: "warning", summary: "缺少 API Key 环境变量。" },
    { name: "memory_privacy", status: "error", summary: "Memory privacy 检查失败。" },
  ],
};

describe("doctor output", () => {
  test("uses status colors for an interactive terminal", () => {
    const output = renderDoctorReport(report, "codexapis", true);

    expect(output).toContain("\u001b[33mWARNING\u001b[0m");
    expect(output).toContain("\u001b[32m✓\u001b[0m");
    expect(output).toContain("\u001b[33m!\u001b[0m");
    expect(output).toContain("\u001b[31m✗\u001b[0m");
    expect(output).toContain("\u001b[1mlocal_proxy\u001b[0m");
  });

  test("keeps non-interactive output free of ANSI sequences", () => {
    expect(renderDoctorReport(report, "codexapis", false)).toBe(
      [
        "ai:doctor WARNING provider=codexapis online=false (42ms)",
        "✓ local_proxy: 本地代理可达：127.0.0.1:7897。",
        "! api_key_env: 缺少 API Key 环境变量。",
        "✗ memory_privacy: Memory privacy 检查失败。",
      ].join("\n"),
    );
  });
});
