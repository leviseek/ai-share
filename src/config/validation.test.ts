import { describe, expect, test } from "bun:test";
import { buildYamlJsonSchemas } from "./schema.ts";
import { validateYamlConsistency, type ValidationError } from "./validation.ts";

describe("provider model validation", () => {
  test("accepts required provider model fields and an optional boolean native flag", () => {
    const errors = validateFixture();

    expect(errors).toEqual([]);
  });

  test("requires provider models", () => {
    const fixture = createFixture();
    delete fixture.providers.providers.codexapis.models;

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "provider.yaml",
      path: "providers.codexapis.models",
      message: "缺少 providers.codexapis.models 字段",
    });
  });

  test("requires at least one provider model", () => {
    const fixture = createFixture();
    fixture.providers.providers.codexapis.models = [];

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "provider.yaml",
      path: "providers.codexapis.models",
      message: "provider 'codexapis' 的 models 不得为空",
    });
  });

  test("requires a provider default model", () => {
    const fixture = createFixture();
    delete fixture.providers.providers.codexapis.default_model;

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "provider.yaml",
      path: "providers.codexapis.default_model",
      message: "缺少 providers.codexapis.default_model 字段",
    });
  });

  test("requires provider native to be boolean when present", () => {
    const fixture = createFixture();
    fixture.providers.providers.codexapis.native = "yes";

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "provider.yaml",
      path: "providers.codexapis.native",
      message: "providers.codexapis.native 必须是布尔值",
    });
  });

  test("rejects unknown provider fields", () => {
    const fixture = createFixture();
    Object.assign(fixture.providers.providers.codexapis, { unexpected: true });

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "provider.yaml",
      path: "providers.codexapis.unexpected",
      message: "providers.codexapis.unexpected 是未知字段",
    });
  });

  test("rejects duplicate provider model ids", () => {
    const fixture = createFixture();
    fixture.providers.providers.codexapis.models = ["gpt-a", "gpt-a"];

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "provider.yaml",
      path: "providers.codexapis.models[1]",
      message: "provider 'codexapis' 的 models 包含重复模型 'gpt-a'",
    });
  });

  test("rejects provider model references absent from models.yaml", () => {
    const fixture = createFixture();
    fixture.providers.providers.codexapis.models = ["missing-model"];
    fixture.providers.providers.codexapis.default_model = "missing-model";
    fixture.global.model = "missing-model";

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "provider.yaml",
      path: "providers.codexapis.models[0]",
      message: "provider 'codexapis' 引用未定义模型 'missing-model'",
    });
  });

  test("rejects inherited provider model references absent from models.yaml", () => {
    const fixture = createFixture();
    fixture.providers.providers.codexapis.models = ["constructor"];
    fixture.providers.providers.codexapis.default_model = "constructor";
    fixture.global.model = "constructor";

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "provider.yaml",
      path: "providers.codexapis.models[0]",
      message: "provider 'codexapis' 引用未定义模型 'constructor'",
    });
  });

  test("rejects inherited global model references absent from models.yaml", () => {
    const fixture = createFixture();
    fixture.global.model = "constructor";
    fixture.providers.providers.codexapis.models = ["constructor"];
    fixture.providers.providers.codexapis.default_model = "constructor";

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "global.yaml",
      path: "model",
      message: "global.model 引用未定义模型 'constructor'",
    });
  });

  test("rejects a provider default model outside that provider's models", () => {
    const fixture = createFixture();
    fixture.providers.providers.codexapis.default_model = "gpt-b";
    fixture.global.model = "gpt-b";

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "provider.yaml",
      path: "providers.codexapis.default_model",
      message: "provider 'codexapis' 的 default_model 'gpt-b' 不在 models 中",
    });
  });

  test("rejects a global model outside the selected provider models", () => {
    const fixture = createFixture();
    fixture.global.model = "gpt-b";

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "global.yaml",
      path: "model",
      message: "global.model 'gpt-b' 不在 provider 'codexapis' 的 models 中",
    });
  });

  test("accepts a global model associated with the selected provider even when it is not the default", () => {
    const fixture = createFixture();
    fixture.providers.providers.codexapis.models = ["gpt-5.5", "gpt-5.6-sol"];
    fixture.providers.providers.codexapis.default_model = "gpt-5.5";
    fixture.models["gpt-5.5"] = { model_name: "gpt-5.5" };
    fixture.models["gpt-5.6-sol"] = { model_name: "gpt-5.6-sol" };
    fixture.global.model = "gpt-5.6-sol";

    const errors = validateFixture(fixture);

    expect(errors).toEqual([]);
  });
});

test("provider JSON Schema requires a non-empty unique model list", () => {
  const schemas = buildYamlJsonSchemas();

  expect(schemas["provider.schema.json"]).toMatchObject({
    properties: {
      providers: {
        additionalProperties: {
          properties: {
            models: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
            },
          },
        },
      },
    },
  });
});

function validateFixture(fixture = createFixture()): ValidationError[] {
  return validateYamlConsistency(fixture.models, fixture.providers, fixture.global);
}

type Fixture = {
  global: {
    model: string;
    provider: string;
  };
  providers: {
    providers: {
      codexapis: {
        name: string;
        base_url: string;
        api_key: string;
        models?: string[];
        default_model?: string;
        native?: boolean | string;
      };
    };
  };
  models: Record<string, { model_name: string }>;
};

function createFixture(): Fixture {
  return {
    global: {
      model: "gpt-a",
      provider: "codexapis",
    },
    providers: {
      providers: {
        codexapis: {
          name: "Codex APIs",
          base_url: "https://example.com/v1",
          api_key: "${CODEXAPIS_API_KEY}",
          models: ["gpt-a"],
          default_model: "gpt-a",
          native: false,
        },
      },
    },
    models: {
      "gpt-a": {
        model_name: "gpt-a",
      },
      "gpt-b": {
        model_name: "gpt-b",
      },
    },
  };
}
