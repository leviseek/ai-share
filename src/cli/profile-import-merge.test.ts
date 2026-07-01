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
    reasoning: gpt-5.4
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
    reasoning: gpt-5.4
    fast: gpt-5.4-mini

coding:
  name: 代码实施优先模式
  models:
    primary: gpt-5.5-coding
    reasoning: gpt-5.4
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
      "[safe] roles.reasoning.model 'gpt-5.4' 不在已知模型列表中",
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

  test("rejects YAML-unsafe profile ids and nested extension fields", () => {
    const unsafeProfileId: unknown = profile("bad:id", "gpt-5.5");
    const nestedExtension: unknown = {
      ...profile("nested-extension", "gpt-5.5"),
      roles: {
        ...profile("nested-extension", "gpt-5.5").roles,
        primary: {
          model: "gpt-5.5",
          provider: "custom",
        },
        custom: {
          model: "gpt-5.5",
        },
      },
      compaction: {
        threshold: 65000,
        max_input_tokens: 120000,
        model_role: "fast",
        strategy: "custom",
      },
    };
    const malformedCompaction: unknown = {
      ...profile("malformed-compaction", "gpt-5.5"),
      compaction: "fast",
    };

    const { validProfiles, errors } = validateImportedProfiles([unsafeProfileId, nestedExtension, malformedCompaction]);

    expect(validProfiles).toEqual([]);
    expect(errors).toContain("[bad:id] profile_id: 只能包含字母、数字、下划线和连字符");
    expect(errors).toContain("[nested-extension] roles.custom: 不支持的字段");
    expect(errors).toContain("[nested-extension] roles.primary.provider: 不支持的字段");
    expect(errors).toContain("[nested-extension] compaction.strategy: 不支持的字段");
    expect(errors).toContain("[malformed-compaction] compaction: 必须是对象");
  });

  test("rejects YAML-unsafe imported scalar values", () => {
    const unsafeScalars: unknown = {
      ...profile("unsafe-scalars", "gpt-5.5"),
      name: "unsafe\n  models:",
      roles: {
        primary: { model: "gpt-5.5 # injected" },
        reasoning: { model: "gpt-5.4" },
        fast: { model: "gpt-5.4-mini" },
      },
      compaction: {
        threshold: 65000,
        max_input_tokens: 120000,
        model_role: "fast # injected",
      },
    };

    const { validProfiles, errors } = validateImportedProfiles([unsafeScalars]);

    expect(validProfiles).toEqual([]);
    expect(errors).toContain("[unsafe-scalars] name: 不能包含换行");
    expect(errors).toContain("[unsafe-scalars] roles.primary.model: model ID 包含不安全字符");
    expect(errors).toContain("[unsafe-scalars] compaction.model_role: model_role 包含不安全字符");
  });
});

function profile(profileId: string, primary: string): TriRoleProfile {
  return {
    protocol: "tri-role/v1",
    profile_id: profileId,
    name: `${profileId} profile`,
    roles: {
      primary: { model: primary },
      reasoning: { model: "gpt-5.4" },
      fast: { model: "gpt-5.4-mini" },
    },
    compaction: {
      threshold: 65000,
      max_input_tokens: 120000,
      model_role: "fast",
    },
  };
}
