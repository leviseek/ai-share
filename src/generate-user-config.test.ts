import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const projectRoot = resolve(import.meta.dir, "..");

describe("generate-user-config", () => {
  test("--check 只执行配置检查并成功退出", () => {
    const result = Bun.spawnSync({
      cmd: ["bun", "run", "./src/generate-user-config.ts", "--check"],
      cwd: projectRoot,
      env: testEnv(),
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toContain("配置检查通过。");
    expect(stdout).toContain("默认 OMO 编排级别：balanced");
  });

  test("--check 在 API Key 缺失时失败", () => {
    const result = Bun.spawnSync({
      cmd: ["bun", "run", "./src/generate-user-config.ts", "--check"],
      cwd: projectRoot,
      env: testEnvWithoutApiKeys(),
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(result.exitCode).toBe(1);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr).toContain("API Key 环境变量未设置：CODEXAPIS_API_KEY / PACKYAPI_API_KEY / DEEPSEEK_API_KEY");
  });

  test("--dry-run 预览生成内容但不创建用户配置目录", async () => {
    const homeDir = await mkdtemp(resolve(tmpdir(), "ai-share-test-"));
    try {
      const result = Bun.spawnSync({
        cmd: ["bun", "run", "./src/generate-user-config.ts", "--dry-run"],
        cwd: projectRoot,
        env: testEnv(homeDir),
        stderr: "pipe",
        stdout: "pipe",
      });

      expect(result.exitCode).toBe(0);
      const stdout = new TextDecoder().decode(result.stdout);
      expect(stdout).toContain("将生成 OpenCode 配置");
      expect(stdout).toContain("将安装 启动命令目录");
      if (process.platform === "win32") expect(stdout).toContain("aioc.ps1");
      expect(await Bun.file(resolve(homeDir, ".config", "opencode")).exists()).toBe(false);
    } finally {
      await rm(homeDir, { force: true, recursive: true });
    }
  });
});

function testEnv(homeDir?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(homeDir ? { HOME: homeDir, USERPROFILE: homeDir } : {}),
    CODEXAPIS_API_KEY: "test-codexapis-key",
    DEEPSEEK_API_KEY: "test-deepseek-key",
    PACKYAPI_API_KEY: "test-packyapi-key",
  };
}

function testEnvWithoutApiKeys(): NodeJS.ProcessEnv {
  const { CODEXAPIS_API_KEY, DEEPSEEK_API_KEY, PACKYAPI_API_KEY, ...env } = process.env;
  void CODEXAPIS_API_KEY;
  void DEEPSEEK_API_KEY;
  void PACKYAPI_API_KEY;
  return env;
}
