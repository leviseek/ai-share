import { describe, expect, test } from "bun:test";
import type { TriRoleProfile } from "../protocol/tri-role.ts";
import { mergeProfileYaml, validateImportSecurity, validateImportedProfiles } from "./profile-import-merge.ts";

describe("profile-import merge", () => {
  test("appends new profiles without changing existing blocks", () => {
    const existingYaml = `# profiles

lite:
  name: 轻量编排
  models:
    primary: gpt-5.4
    reasoning: deepseek-v4-flash-think
    fast: gpt-5.4-mini
`;

    const result = mergeProfileYaml(existingYaml, [profile("analysis", "gpt-5.5")]);

    expect(result.replacedProfileIds).toEqual([]);
    expect(result.appendedProfileIds).toEqual(["analysis"]);
    expect(result.yaml).toContain("lite:\n  name: 轻量编排");
    expect(result.yaml).toContain("analysis:\n  name: analysis profile");
  });

  test("replaces an existing profile block instead of appending a duplicate", () => {
    const existingYaml = `# profiles

balanced:
  name: 旧均衡
  models:
    primary: gpt-5.4
    reasoning: deepseek-v4-flash-think
    fast: gpt-5.4-mini

coding:
  name: 代码实施优先模式
  models:
    primary: gpt-5.3-codex
    reasoning: deepseek-v4-pro-think
    fast: gpt-5.4-mini
`;

    const result = mergeProfileYaml(existingYaml, [profile("balanced", "gpt-5.5")]);

    expect(result.replacedProfileIds).toEqual(["balanced"]);
    expect(result.appendedProfileIds).toEqual([]);
    expect(result.yaml.match(/^balanced:/gm)?.length).toBe(1);
    expect(result.yaml).toContain("balanced:\n  name: balanced profile");
    expect(result.yaml).toContain("primary: gpt-5.5");
    expect(result.yaml).not.toContain("旧均衡");
    expect(result.yaml).toContain("coding:\n  name: 代码实施优先模式");
  });

  test("validates imported tri-role profile shape and model security", () => {
    const { validProfiles, errors } = validateImportedProfiles([
      profile("safe", "gpt-5.5"),
      { protocol: "tri-role/v1", profile_id: "broken", roles: {} },
    ]);

    expect(validProfiles.map((p) => p.profile_id)).toEqual(["safe"]);
    expect(errors).toContain("[broken] roles.primary: 缺少 roles.primary");

    expect(validateImportSecurity(validProfiles, { "gpt-5.5": {}, "gpt-5.4-mini": {} })).toEqual([
      "[safe] roles.reasoning.model 'deepseek-v4-pro-think' 不在已知模型列表中",
    ]);
  });

  test("rejects unsupported tri-role extension fields", () => {
    const withStrategies: unknown = {
      ...profile("with-strategies", "gpt-5.5"),
      strategies: {
        custom: true,
      },
    };

    const { validProfiles, errors } = validateImportedProfiles([withStrategies]);

    expect(validProfiles).toEqual([]);
    expect(errors).toContain("[with-strategies] strategies: 不支持的字段");
  });
});

function profile(profileId: string, primary: string): TriRoleProfile {
  return {
    protocol: "tri-role/v1",
    profile_id: profileId,
    name: `${profileId} profile`,
    roles: {
      primary: { model: primary },
      reasoning: { model: "deepseek-v4-pro-think" },
      fast: { model: "gpt-5.4-mini" },
    },
    compaction: {
      threshold: 65000,
      max_input_tokens: 120000,
      model_role: "fast",
    },
  };
}
