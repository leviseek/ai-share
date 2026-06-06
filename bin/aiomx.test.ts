import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { buildOmxArgs, codexConfigOverrides, parseArgs, parseCodexProfileRoot } from "./aiomx.ts";

const profiles = ["balanced", "coding", "max", "research"];

describe("aiomx launcher contract", () => {
  test("parses generated profile selectors without forwarding them to omx", () => {
    expect(parseArgs(["coding", "exec", "修复测试"], profiles, "balanced")).toEqual({
      profile: "coding",
      remainingArgs: ["exec", "修复测试"],
      help: false,
    });
    expect(parseArgs(["--profile", "research", "team", "分析"], profiles, "balanced")).toEqual({
      profile: "research",
      remainingArgs: ["team", "分析"],
      help: false,
    });
    expect(parseArgs(["--codex-profile=max", "review"], profiles, "balanced")).toEqual({
      profile: "max",
      remainingArgs: ["review"],
      help: false,
    });
  });

  test("keeps help local to the launcher", () => {
    expect(parseArgs(["--help"], profiles, "balanced")).toEqual({
      profile: "balanced",
      remainingArgs: [],
      help: true,
    });
  });

  test("injects Codex config overrides only into Codex-forwarding commands", () => {
    const overrides = ["-c", 'model="gpt-5.5"', "-c", 'model_provider="codexapis"'];

    expect(buildOmxArgs([], overrides)).toEqual(overrides);
    expect(buildOmxArgs(["version"], overrides)).toEqual(["version"]);
    expect(buildOmxArgs(["exec", "分析当前项目"], overrides)).toEqual(["exec", ...overrides, "分析当前项目"]);
    expect(buildOmxArgs(["--sandbox", "workspace-write"], overrides)).toEqual([
      ...overrides,
      "--sandbox",
      "workspace-write",
    ]);
  });

  test("parses generated Codex TOML root fields into -c overrides", () => {
    const profile = parseCodexProfileRoot(`model = "gpt-5.5"
model_provider = "codexapis"
model_reasoning_effort = "medium"
model_instructions_file = "C:\\\\Users\\\\levi\\\\.codex\\\\balanced.AGENTS.md"
`);

    expect(profile).toEqual({
      model: "gpt-5.5",
      model_provider: "codexapis",
      model_reasoning_effort: "medium",
      model_instructions_file: "C:\\Users\\levi\\.codex\\balanced.AGENTS.md",
    });
    expect(codexConfigOverrides(profile)).toEqual([
      "-c",
      'model="gpt-5.5"',
      "-c",
      'model_provider="codexapis"',
      "-c",
      'model_reasoning_effort="medium"',
      "-c",
      'model_instructions_file="C:\\\\Users\\\\levi\\\\.codex\\\\balanced.AGENTS.md"',
    ]);
  });

  test("launches with a temporary CODEX_HOME profile and active OMX config", () => {
    const root = mkdtempSync(join(tmpdir(), "aiomx-contract-"));
    try {
      const codexHome = join(root, "codex-home");
      const fakeBin = join(root, "bin");
      const logPath = join(root, "omx.log");
      mkdirSync(codexHome, { recursive: true });
      writeFakeOmx(fakeBin);

      const omxConfig = {
        env: {
          OMX_DEFAULT_FRONTIER_MODEL: "gpt-5.3-codex",
        },
      };
      writeFileSync(
        join(codexHome, "ai-share.runtime.json"),
        JSON.stringify({
          default_profile: "balanced",
          managed: {
            codex_profiles: ["balanced", "coding"],
          },
        }),
      );
      writeFileSync(
        join(codexHome, "coding.config.toml"),
        [
          'model = "gpt-5.3-codex"',
          'model_provider = "codexapis"',
          'model_reasoning_effort = "high"',
          `model_instructions_file = ${JSON.stringify(join(codexHome, "coding.AGENTS.md"))}`,
          "",
        ].join("\n"),
      );
      writeFileSync(join(codexHome, "coding.omx-config.json"), JSON.stringify(omxConfig));

      const result = spawnSync(process.execPath, [join(import.meta.dir, "aiomx.ts"), "coding", "exec", "hello-task"], {
        encoding: "utf8",
        env: {
          ...process.env,
          AIOMX_TEST_LOG: logPath,
          CODEX_HOME: codexHome,
          PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
        },
      });

      if (result.status !== 0) {
        throw new Error(`aiomx failed with status ${result.status}\n${result.stdout}\n${result.stderr}`);
      }

      expect(JSON.parse(readFileSync(join(codexHome, ".omx-config.json"), "utf8"))).toEqual(omxConfig);
      expect(
        readdirSync(codexHome).some((entry) => entry.startsWith("..omx-config.json.") && entry.endsWith(".tmp")),
      ).toBe(false);
      const log = readFileSync(logPath, "utf8");
      expect(log).toContain(`CODEX_HOME=${codexHome}`);
      expect(log).toContain("OMX_DEFAULT_FRONTIER_MODEL=gpt-5.3-codex");
      expect(log).toContain("ARGS=exec");
      expect(log).toContain("model_provider");
      expect(log).toContain("codexapis");
      expect(log).toContain("hello-task");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeFakeOmx(fakeBin: string): void {
  mkdirSync(fakeBin, { recursive: true });
  if (process.platform === "win32") {
    writeFileSync(
      join(fakeBin, "omx.cmd"),
      [
        "@echo off",
        '> "%AIOMX_TEST_LOG%" echo CODEX_HOME=%CODEX_HOME%',
        '>> "%AIOMX_TEST_LOG%" echo OMX_DEFAULT_FRONTIER_MODEL=%OMX_DEFAULT_FRONTIER_MODEL%',
        '>> "%AIOMX_TEST_LOG%" echo ARGS=%*',
        "exit /b 0",
        "",
      ].join("\r\n"),
    );
    return;
  }

  const scriptPath = join(fakeBin, "omx");
  writeFileSync(
    scriptPath,
    [
      "#!/bin/sh",
      "{",
      "  printf 'CODEX_HOME=%s\\n' \"$CODEX_HOME\"",
      "  printf 'OMX_DEFAULT_FRONTIER_MODEL=%s\\n' \"$OMX_DEFAULT_FRONTIER_MODEL\"",
      "  printf 'ARGS=%s\\n' \"$*\"",
      '} > "$AIOMX_TEST_LOG"',
      "",
    ].join("\n"),
  );
  chmodSync(scriptPath, 0o755);
}
