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

describe("tool validation", () => {
  test("accepts a valid tool source", () => {
    expect(validateFixture(createFixture())).toEqual([]);
  });

  test.each(["opencode", "tool.exe", "tool.cmd", "my_tool-1.2"])("accepts executable basename %s", (executable) => {
    const fixture = createFixture();
    toolAt(fixture, 0).executable = executable;

    expect(validateFixture(fixture)).toEqual([]);
  });

  test.each(["cmd /c whoami", "./tool", "C:\\tool.exe", "${TOOL}"])('rejects unsafe executable "%s"', (executable) => {
    const fixture = createFixture();
    toolAt(fixture, 0).executable = executable;

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].executable",
      message: "tools[0].executable 格式不符合要求",
    });
  });

  test.each([
    "@scope/tool@git+https://github.com/example/tool.git",
    "./tool",
    "C:\\tools\\tool",
    "file://./tool",
    "tool@https://user:password@example.com/tool.tgz",
    "tool?download=true",
    "tool#latest",
  ])('rejects unsafe package spec "%s"', (packageId) => {
    const fixture = createFixture();
    toolAt(fixture, 0).package = packageId;

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].package",
      message: "tools[0].package 格式不符合要求",
    });
  });

  test("rejects a secret-like package literal at runtime", () => {
    const fixture = createFixture();
    toolAt(fixture, 0).package = "sk-abcdefghijklmnop";

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].package",
      message: "tools[0].package 格式不符合要求",
    });
  });

  test("accepts a scoped package for Bun", () => {
    const fixture = createFixture();
    toolAt(fixture, 0).package = "@scope/tool";

    expect(validateFixture(fixture)).toEqual([]);
  });

  test.each([
    ["win32", "scoop"],
    ["darwin", "brew"],
  ] as const)("rejects a scoped package for %s manager %s", (platform, manager) => {
    const fixture = createFixture();
    toolAt(fixture, 0).package = "@scope/tool";
    toolAt(fixture, 0).platforms = { [platform]: { manager } };

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: `tools[0].platforms.${platform}.manager/package`,
      message: `tools[0].platforms.${platform}.manager/package 不支持 scoped npm package`,
    });
  });

  test.each([
    ["id", "sk-abcdefghijklmnop"],
    ["label", "Deploy sk-abcdefghijklmnop"],
    ["package", "sk-abcdefghijklmnop"],
    ["executable", "sk-abcdefghijklmnop"],
    ["version", "1.2.3-sk-abcdefghijklmnop"],
  ] as const)("rejects a known secret token in a tool %s", (field, value) => {
    const fixture = createFixture();
    toolAt(fixture, 0)[field] = value;

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: `tools[0].${field}`,
      message: `tools[0].${field} 格式不符合要求`,
    });
  });

  test("rejects the reserved Superpowers tool id", () => {
    const fixture = createFixture();
    toolAt(fixture, 0).id = "superpowers";

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].id",
      message: "tools[0].id 是 Superpowers 保留 id，不得作为普通工具 id",
    });
  });

  test("rejects duplicate tool ids", () => {
    const fixture = createFixture();
    fixture.tools.tools.push({ ...toolAt(fixture, 0), label: "Duplicate" });

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: "tools[2].id",
      message: "tools 包含重复工具 id 'opencode'",
    });
  });

  test("rejects unknown platform and manager", () => {
    const fixture = createFixture();
    toolAt(fixture, 0).platforms = { win32: { manager: "apt" }, android: { manager: "bun" } };

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].platforms.win32.manager",
      message: "tools[0].platforms.win32.manager 必须是 bun、scoop 或 brew",
    });
    expect(errors).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].platforms.android",
      message: "tools[0].platforms key 'android' 格式不符合要求",
    });
  });

  test("rejects empty and unsafe package ids", () => {
    const fixture = createFixture();
    toolAt(fixture, 0).package = "https://example.com/tool.tgz";
    toolAt(fixture, 1).package = "";

    const errors = validateFixture(fixture);

    expect(errors).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].package",
      message: "tools[0].package 格式不符合要求",
    });
    expect(errors).toContainEqual({
      file: "tools.yaml",
      path: "tools[1].package",
      message: "tools[1].package 必须是非空字符串",
    });
  });

  test("rejects invalid tool versions", () => {
    const fixture = createFixture();
    toolAt(fixture, 0).version = ">=1.0.0";

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].version",
      message: "tools[0].version 格式不符合要求",
    });
  });

  test("rejects tools without platforms", () => {
    const fixture = createFixture();
    toolAt(fixture, 0).platforms = {};

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].platforms",
      message: "tools[0].platforms 至少需要一个平台配置",
    });
  });

  test("rejects unknown tool fields", () => {
    const fixture = createFixture();
    Object.assign(toolAt(fixture, 0), { command: "opencode" });

    expect(validateFixture(fixture)).toContainEqual({
      file: "tools.yaml",
      path: "tools[0].command",
      message: "tools[0].command 是未知字段",
    });
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

test("tools JSON Schema defines required fields and manager enum", () => {
  const schemas = buildYamlJsonSchemas();

  expect(schemas["tools.schema.json"]).toMatchObject({
    properties: {
      tools: {
        "x-uniqueItemsBy": "id",
        items: {
          required: ["id", "label", "package", "executable", "required", "version", "platforms"],
          properties: {
            platforms: {
              additionalProperties: {
                properties: {
                  manager: { enum: ["bun", "scoop", "brew"] },
                },
              },
            },
            executable: {
              pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$",
            },
          },
        },
      },
    },
  });
});

function validateFixture(fixture = createFixture()): ValidationError[] {
  return validateYamlConsistency(
    fixture.models,
    fixture.providers,
    fixture.global,
    undefined,
    undefined,
    undefined,
    undefined,
    fixture.tools,
  );
}

function toolAt(fixture: Fixture, index: number): Fixture["tools"]["tools"][number] {
  const tool = fixture.tools.tools[index];
  if (!tool) throw new Error(`Test tool missing at index ${index}`);
  return tool;
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
  tools: {
    tools: {
      id: string;
      label: string;
      package: string;
      executable: string;
      required: boolean;
      version: string;
      platforms: Record<string, { manager: string }>;
    }[];
  };
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
    tools: {
      tools: [
        {
          id: "opencode",
          label: "OpenCode CLI",
          package: "opencode-ai",
          executable: "opencode",
          required: true,
          version: "latest",
          platforms: {
            win32: { manager: "bun" },
            darwin: { manager: "bun" },
            linux: { manager: "bun" },
          },
        },
        {
          id: "typescript",
          label: "TypeScript",
          package: "typescript",
          executable: "tsc",
          required: false,
          version: "^5.0.0",
          platforms: { linux: { manager: "bun" } },
        },
      ],
    },
  };
}
