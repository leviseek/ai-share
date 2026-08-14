import { describe, expect, test } from "bun:test";
import {
  buildArchifySkillsCommand,
  parseArchifyInstallOptions,
  runArchifyInstall,
  type ArchifyInstallRunner,
} from "./archify-install.ts";

function okRunner(): ArchifyInstallRunner {
  return () => ({ status: 0, stdout: "installed", stderr: "" });
}

describe("parseArchifyInstallOptions", () => {
  test("defaults to install with proxy", () => {
    const options = parseArchifyInstallOptions(["bun", "archify-install.ts"]);
    expect(options.command).toBe("install");
    expect(options.useProxy).toBe(true);
  });

  test("accepts update command", () => {
    const options = parseArchifyInstallOptions(["bun", "archify-install.ts", "update"]);
    expect(options.command).toBe("update");
  });

  test("--no-proxy disables proxy", () => {
    const options = parseArchifyInstallOptions(["bun", "archify-install.ts", "--no-proxy"]);
    expect(options.useProxy).toBe(false);
  });

  test("rejects unknown positional argument", () => {
    expect(() => parseArchifyInstallOptions(["bun", "archify-install.ts", "wat"])).toThrow("未知参数");
  });
});

describe("buildArchifySkillsCommand", () => {
  test("install uses skills add with opencode agent and copy", () => {
    const args = buildArchifySkillsCommand("install");
    expect(args).toContain("skills");
    expect(args).toContain("add");
    expect(args).toContain("tt-a1i/archify");
    expect(args).toContain("opencode");
    expect(args).toContain("--copy");
    expect(args).toContain("--global");
  });

  test("update uses skills update globally", () => {
    const args = buildArchifySkillsCommand("update");
    expect(args).toContain("update");
    expect(args).toContain("archify");
    expect(args).toContain("--global");
  });
});

describe("runArchifyInstall", () => {
  test("returns ok and forwards stdout on success", () => {
    const result = runArchifyInstall({ runner: okRunner() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stdout).toBe("installed");
  });

  test("returns error when runner exits non-zero", () => {
    const failing: ArchifyInstallRunner = () => ({
      status: 1,
      stdout: "",
      stderr: "boom",
    });
    const result = runArchifyInstall({ runner: failing });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(String(result.error)).toContain("boom");
  });

  test("injects proxy env into the runner call", () => {
    let capturedEnv: Record<string, string> | undefined;
    const capturing: ArchifyInstallRunner = (_args, env) => {
      capturedEnv = env;
      return { status: 0, stdout: "ok", stderr: "" };
    };
    const result = runArchifyInstall({ runner: capturing, env: { HTTPS_PROXY: "http://127.0.0.1:7897" } });
    expect(result.ok).toBe(true);
    expect(capturedEnv?.HTTPS_PROXY).toBe("http://127.0.0.1:7897");
    expect(capturedEnv?.HTTP_PROXY).toBe("http://127.0.0.1:7897");
  });

  test("does not inject proxy when --no-proxy", () => {
    let capturedEnv: Record<string, string> | undefined;
    const capturing: ArchifyInstallRunner = (_args, env) => {
      capturedEnv = env;
      return { status: 0, stdout: "ok", stderr: "" };
    };
    const result = runArchifyInstall({
      argv: ["bun", "archify-install.ts", "--no-proxy"],
      runner: capturing,
    });
    expect(result.ok).toBe(true);
    expect(capturedEnv).toEqual({});
  });
});
