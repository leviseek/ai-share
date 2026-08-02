import { describe, expect, test } from "bun:test";
import { formatInstalledToolDocs, formatInstallRunResult, type InstallRunResult } from "./ai-install.ts";

const result = {
  ok: true,
  tools: [
    { id: "opencode", label: "OpenCode CLI", installed: true },
    { id: "opencode-desktop", label: "OpenCode Desktop", installed: false },
    { id: "wezterm", label: "WezTerm", installed: false },
    { id: "openspec", label: "OpenSpec", installed: true },
    { id: "superpowers", label: "Superpowers", installed: true },
    { id: "codegraph", label: "CodeGraph", installed: true },
  ],
  hints: [{ kind: "configure-openspec", toolId: "openspec", command: "openspec", args: ["init"] }],
} satisfies InstallRunResult;

describe("install output boundaries", () => {
  test("check output excludes session usage and keeps initialization guidance", () => {
    const output = formatInstallRunResult(result, false);

    expect(output).not.toContain("使用提示");
    expect(output).not.toContain("会话使用");
    expect(output).toContain("配置提示");
    expect(output).toContain("openspec init");
  });

  test("tool docs include only installed tools and session usage", () => {
    const output = formatInstalledToolDocs(result, false);

    expect(output).toContain("工具使用提示");
    expect(output).toContain("OpenSpec");
    expect(output).toContain("CodeGraph");
    expect(output).toContain("Superpowers");
    expect(output).not.toContain("OpenCode Desktop");
    expect(output).not.toContain("安装指令");
    expect(output).not.toContain("配置提示");
  });

  test("tool docs report detection failures in Chinese", () => {
    expect(formatInstalledToolDocs({ ok: false, error: new Error("boom") }, false)).toBe("检测失败：boom");
  });
});
