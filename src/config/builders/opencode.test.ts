import { expect, test } from "bun:test";

import { buildAiocOpenCodeConfigs, buildOpenCodeConfigs } from "./opencode.ts";
import type { GlobalYaml, ModelsYaml, ProfilesYaml, ProviderSource } from "../../types.ts";

const globalConfig: GlobalYaml = {
  opencode: {
    plugins: ["oh-my-openagent@3.17.5", "./plugins/omo-agent-monitor"],
    aioc_excluded_plugins: ["oh-my-openagent@3.17.5", "./plugins/omo-agent-monitor"],
  },
};

const providers: Record<string, ProviderSource> = {
  test: {
    name: "Test",
    npm: "@test/provider",
    base_url: "https://example.test/v1",
    api_key: "${TEST_API_KEY}",
  },
};

const models: ModelsYaml = {
  gpt: {
    provider: "test",
    model_name: "primary-model",
  },
  mini: {
    provider: "test",
    model_name: "fast-model",
  },
};

const profiles: ProfilesYaml = {
  balanced: {
    models: {
      primary: "gpt",
      fast: "mini",
    },
  },
};

test("generated OpenCode configs only include configured OMO plugins", () => {
  const openCodeConfigs = buildOpenCodeConfigs("D:/ai-share", globalConfig, providers, models, profiles);
  const aiocOpenCodeConfigs = buildAiocOpenCodeConfigs(openCodeConfigs, globalConfig);

  expect(openCodeConfigs.balanced?.plugin).toEqual(["oh-my-openagent@3.17.5", "./plugins/omo-agent-monitor"]);
  expect(aiocOpenCodeConfigs.balanced?.plugin).toEqual([]);
});
