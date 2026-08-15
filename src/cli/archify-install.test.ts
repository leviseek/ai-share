import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildArchifyCommandPlan,
  parseArchifyInstallOptions,
  runArchifyInstall,
  type ArchifyInstallRunner,
} from "./archify-install.ts";

function okRunner(): ArchifyInstallRunner {
  return (invocation) => ({
    status: 0,
    stdout: invocation.executable === "bun" ? "installed" : "",
    stderr: "",
  });
}

describe("parseArchifyInstallOptions", () => {
  test("defaults to install with proxy", () => {
    const options = parseArchifyInstallOptions(["bun", "archify-install.ts"]);
    expect(options.command).toBe("install");
    expect(options.useProxy).toBe(true);
    expect(options.force).toBe(false);
  });

  test("accepts update command", () => {
    const options = parseArchifyInstallOptions(["bun", "archify-install.ts", "update"]);
    expect(options.command).toBe("update");
  });

  test("--no-proxy disables proxy", () => {
    const options = parseArchifyInstallOptions(["bun", "archify-install.ts", "--no-proxy"]);
    expect(options.useProxy).toBe(false);
  });

  test("accepts explicit ownership takeover", () => {
    const options = parseArchifyInstallOptions(["bun", "archify-install.ts", "--force"]);
    expect(options.force).toBe(true);
  });

  test("rejects unknown positional argument", () => {
    expect(() => parseArchifyInstallOptions(["bun", "archify-install.ts", "wat"])).toThrow("未知参数");
  });
});

describe("buildArchifyCommandPlan", () => {
  test("fetches the pinned commit before using a local skills source", () => {
    const sourceDir = "C:\\temp\\archify-source";
    const plan = buildArchifyCommandPlan(sourceDir);
    expect(plan[0]).toEqual({ executable: "git", args: ["init", "--quiet", sourceDir] });
    expect(plan[1]?.args).toContain("https://github.com/tt-a1i/archify.git");
    expect(plan[1]?.args).toContain("cffdd42eed0ebf013aa070378d94facdd3d56b10");
    expect(plan[2]?.args).toContain("FETCH_HEAD");
    expect(plan[3]?.executable).toBe("bun");
    expect(plan[3]?.args).toContain(sourceDir);
    expect(plan[3]?.args).toContain("opencode");
    expect(plan[3]?.args).toContain("--copy");
    expect(plan[3]?.args).toContain("--global");
  });
});

describe("runArchifyInstall", () => {
  test("returns ok and forwards stdout on success", async () => {
    const result = await runArchifyInstall({ runner: okRunner() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stdout).toBe("installed");
  });

  test("returns error when runner exits non-zero", async () => {
    const failing: ArchifyInstallRunner = () => ({
      status: 1,
      stdout: "",
      stderr: "boom",
    });
    const result = await runArchifyInstall({ runner: failing });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(String(result.error)).toContain("boom");
  });

  test("reports an unknown exit when the runner returns no diagnostics", async () => {
    const result = await runArchifyInstall({
      runner: () => ({ status: null, stdout: "", stderr: "" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(String(result.error)).toContain("exit unknown");
  });

  test("injects proxy env into the runner call", async () => {
    let capturedEnv: Record<string, string> | undefined;
    const capturing: ArchifyInstallRunner = (_args, env) => {
      capturedEnv = env;
      return { status: 0, stdout: "ok", stderr: "" };
    };
    const result = await runArchifyInstall({ runner: capturing, env: { HTTPS_PROXY: "http://127.0.0.1:7897" } });
    expect(result.ok).toBe(true);
    expect(capturedEnv?.HTTPS_PROXY).toBe("http://127.0.0.1:7897");
    expect(capturedEnv?.HTTP_PROXY).toBe("http://127.0.0.1:7897");
  });

  test("does not inject proxy when --no-proxy", async () => {
    let capturedEnv: Record<string, string> | undefined;
    const capturing: ArchifyInstallRunner = (_args, env) => {
      capturedEnv = env;
      return { status: 0, stdout: "ok", stderr: "" };
    };
    const result = await runArchifyInstall({
      argv: ["bun", "archify-install.ts", "--no-proxy"],
      runner: capturing,
    });
    expect(result.ok).toBe(true);
    expect(capturedEnv).toEqual({});
  });

  test("does not invoke the installer for an unmanaged existing target", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-archify-collision-"));
    try {
      const skillDir = join(root, "home", ".agents", "skills", "archify");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), "# User Archify\n", "utf8");
      let invoked = false;
      const result = await runArchifyInstall({
        projectRoot: root,
        env: { HOME: join(root, "home"), OPENCODE_CONFIG_DIR: join(root, "opencode") },
        config: {
          archify: {
            repo: "tt-a1i/archify",
            skill: "archify",
            ref: "cffdd42eed0ebf013aa070378d94facdd3d56b10",
            enabled: true,
          },
        },
        runner: () => {
          invoked = true;
          return { status: 0, stdout: "installed", stderr: "" };
        },
      });
      expect(result.ok).toBe(false);
      expect(invoked).toBe(false);
      if (!result.ok) expect(String(result.error)).toContain("拒绝覆盖");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("records ownership after a successful pinned install", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-archify-install-"));
    try {
      const skillDir = join(root, "home", ".agents", "skills", "archify");
      const config = {
        archify: {
          repo: "tt-a1i/archify",
          skill: "archify",
          ref: "cffdd42eed0ebf013aa070378d94facdd3d56b10",
          enabled: true,
        },
      } as const;
      const result = await runArchifyInstall({
        projectRoot: root,
        env: { HOME: join(root, "home"), OPENCODE_CONFIG_DIR: join(root, "opencode") },
        config,
        runner: () => {
          mkdirSync(skillDir, { recursive: true });
          writeFileSync(join(skillDir, "SKILL.md"), "# Archify\n", "utf8");
          return { status: 0, stdout: "installed", stderr: "" };
        },
        persistOwnership: true,
      });
      expect(result.ok).toBe(true);
      expect(readFileSync(join(skillDir, ".ai-share-managed"), "utf8")).toBe("ai-share\n");
      expect(JSON.parse(readFileSync(join(skillDir, ".ai-share-archify-ref.json"), "utf8"))).toEqual({
        repo: config.archify.repo,
        skill: config.archify.skill,
        ref: config.archify.ref,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
