import { describe, expect, test } from "bun:test";
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
});
