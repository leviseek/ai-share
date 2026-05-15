import { describe, expect, it, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseYamlObject } from "../../yaml.ts";
import type { AgentsYaml, GlobalYaml, ModelsYaml, ProfilesYaml, ProviderYaml, ProviderGroupMap } from "../../types.ts";
import {
  applyProviderGroups,
  buildAiocOpenCodeConfigs,
  buildContextGuardConfig,
  buildContextGuardProfileConfigs,
  buildDingTalkNotifierConfig,
  buildOhMyOpenAgentConfigs,
  buildOpenCodeConfigs,
  buildStrategyConfigs,
} from "../../config-builders.ts";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("generator config snapshots", () => {
  let globalConfig: GlobalYaml;
  let providersConfig: ProviderYaml;
  let modelsConfig: ModelsYaml;
  let profilesConfig: ProfilesYaml;
  let agentsConfig: AgentsYaml;

  let models: ModelsYaml;
  let openCodeConfigs: Record<string, unknown>;
  let aiocConfigs: Record<string, unknown>;
  let omoConfigs: Record<string, unknown>;
  let strategyConfigs: Record<string, unknown>;

  beforeAll(() => {
    const configDir = resolve(projectRoot, "config");
    globalConfig = parseYamlObject(readFileSync(resolve(configDir, "global.yaml"), "utf-8"));
    providersConfig = parseYamlObject(readFileSync(resolve(configDir, "provider.yaml"), "utf-8"));
    modelsConfig = parseYamlObject(readFileSync(resolve(configDir, "models.yaml"), "utf-8")) as unknown as ModelsYaml;
    profilesConfig = parseYamlObject(
      readFileSync(resolve(configDir, "profiles.yaml"), "utf-8"),
    ) as unknown as ProfilesYaml;
    agentsConfig = parseYamlObject(readFileSync(resolve(configDir, "agents.yaml"), "utf-8"));

    const providers = providersConfig.providers ?? {};
    const providerGroups: ProviderGroupMap = {
      gpt: "codexapis",
      deepseek: "deepseek",
    };
    models = applyProviderGroups(modelsConfig, providers, providerGroups);

    openCodeConfigs = buildOpenCodeConfigs(projectRoot, globalConfig, providers, models, profilesConfig);

    aiocConfigs = buildAiocOpenCodeConfigs(openCodeConfigs as never, globalConfig);

    omoConfigs = buildOhMyOpenAgentConfigs(models, profilesConfig, agentsConfig);

    strategyConfigs = buildStrategyConfigs(globalConfig, profilesConfig, agentsConfig);
  });

  // 8 profiles × 4 output types = 32 snapshot tests
  const profiles = ["lite", "economy", "cheap", "balanced", "coding", "research", "writing", "max"] as const;

  for (const profileId of profiles) {
    it(`opencode ${profileId} matches snapshot`, () => {
      expect(openCodeConfigs[profileId]).toMatchSnapshot();
    });

    it(`aioc ${profileId} matches snapshot`, () => {
      expect(aiocConfigs[profileId]).toMatchSnapshot();
    });

    it(`omo ${profileId} matches snapshot`, () => {
      expect(omoConfigs[profileId]).toMatchSnapshot();
    });

    it(`strategy ${profileId} matches snapshot`, () => {
      expect(strategyConfigs[profileId]).toMatchSnapshot();
    });
  }

  // Context-guard config snapshot
  it("context-guard config matches snapshot", () => {
    expect(buildContextGuardConfig(globalConfig)).toMatchSnapshot();
  });

  // Context-guard per-profile configs snapshot
  it("context-guard profile configs match snapshot", () => {
    expect(buildContextGuardProfileConfigs(globalConfig, profilesConfig)).toMatchSnapshot();
  });

  // DingTalk notifier config snapshot
  it("dingtalk-notifier config matches snapshot", () => {
    expect(buildDingTalkNotifierConfig(globalConfig)).toMatchSnapshot();
  });
});
