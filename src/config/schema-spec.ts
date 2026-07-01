export const ENV_REFERENCE_PATTERN = "^\\$\\{[A-Z_][A-Z0-9_]*\\}$";
export const ENV_NAME_PATTERN = "^[A-Z_][A-Z0-9_]*$";
export const ENV_FILE_NAME_PATTERN = "^[A-Za-z_][A-Za-z0-9_]*$";

export const MODEL_ROLES = ["primary", "reasoning", "fast"] as const;

export type SchemaNode =
  | StringSchemaNode
  | NumberSchemaNode
  | IntegerSchemaNode
  | BooleanSchemaNode
  | ArraySchemaNode
  | ObjectSchemaNode;

export type YamlSchemaSpec = {
  sourceFile: YamlSchemaSourceFile;
  schemaFileName: string;
  title: string;
  rootDisplayPath?: string;
  root: SchemaNode;
};

export type YamlSchemaSourceFile =
  | "global.yaml"
  | "provider.yaml"
  | "models.yaml"
  | "profiles.yaml"
  | "mcp.yaml"
  | "env.yaml"
  | "profile-eval.yaml";

type BaseSchemaNode = {
  description?: string;
};

type StringSchemaNode = BaseSchemaNode & {
  type: "string";
  minLength?: number;
  pattern?: string;
  enum?: readonly string[];
};

type NumberSchemaNode = BaseSchemaNode & {
  type: "number";
  exclusiveMinimum?: number;
  minimum?: number;
};

type IntegerSchemaNode = BaseSchemaNode & {
  type: "integer";
  exclusiveMinimum?: number;
  minimum?: number;
};

type BooleanSchemaNode = BaseSchemaNode & {
  type: "boolean";
};

type ArraySchemaNode = BaseSchemaNode & {
  type: "array";
  items: SchemaNode;
};

type ObjectSchemaNode = BaseSchemaNode & {
  type: "object";
  required?: readonly string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: SchemaNode | boolean;
  propertyNames?: {
    pattern: string;
  };
};

const modelRoleProperties = Object.fromEntries(MODEL_ROLES.map((role) => [role, stringSchema(`${role} model id.`)]));

export const YAML_SCHEMA_SPECS: readonly YamlSchemaSpec[] = [
  {
    sourceFile: "global.yaml",
    schemaFileName: "global.schema.json",
    title: "ai-share global.yaml",
    root: objectSchema({
      properties: {
        default_profile: stringSchema("Default profile id from profiles.yaml."),
        codex_min_version: stringSchema("Minimum Codex CLI version checked by ai:check."),
      },
    }),
  },
  {
    sourceFile: "provider.yaml",
    schemaFileName: "provider.schema.json",
    title: "ai-share provider.yaml",
    root: objectSchema({
      required: ["providers"],
      properties: {
        providers: objectSchema({
          additionalProperties: objectSchema({
            required: ["base_url", "api_key"],
            properties: {
              name: stringSchema("Human-readable provider name."),
              short_name: stringSchema("Short provider label."),
              base_url: stringSchema("OpenAI-compatible base URL."),
              api_key: envReferenceSchema("Environment variable reference."),
              timeout: numberSchema("Request timeout metadata."),
              chunkTimeout: numberSchema("Chunk timeout metadata."),
            },
          }),
        }),
      },
    }),
  },
  {
    sourceFile: "models.yaml",
    schemaFileName: "models.schema.json",
    title: "ai-share models.yaml",
    rootDisplayPath: "models",
    root: objectSchema({
      additionalProperties: objectSchema({
        required: ["provider_group", "model_name", "cost", "limits"],
        properties: {
          provider: stringSchema("Resolved provider id generated from provider_group."),
          provider_group: stringSchema("Logical provider group such as gpt."),
          model_name: stringSchema("Upstream model name sent to provider."),
          capabilities: stringArraySchema("Model capability labels."),
          cost: objectSchema({
            required: ["input", "output"],
            properties: {
              input: positiveNumberSchema("Input cost metadata."),
              output: positiveNumberSchema("Output cost metadata."),
            },
          }),
          limits: objectSchema({
            required: ["context_window", "max_output"],
            properties: {
              context_window: positiveNumberSchema("Context window tokens."),
              max_output: positiveNumberSchema("Max output tokens."),
            },
          }),
          temperature: numberSchema("Default model temperature."),
          parameters: objectSchema({
            description: "Provider-specific model parameters.",
          }),
          fallback: stringArraySchema("Fallback model ids."),
        },
      }),
    }),
  },
  {
    sourceFile: "profiles.yaml",
    schemaFileName: "profiles.schema.json",
    title: "ai-share profiles.yaml",
    rootDisplayPath: "profiles",
    root: objectSchema({
      additionalProperties: objectSchema({
        required: ["models"],
        properties: {
          name: stringSchema("Human-readable profile name."),
          models: objectSchema({
            required: [...MODEL_ROLES],
            properties: modelRoleProperties,
          }),
          compaction: objectSchema({
            properties: {
              enabled: booleanSchema("Compaction enabled flag."),
              threshold: numberSchema("Compaction threshold metadata."),
              model: stringSchema("Compaction model id or model role."),
              max_input_tokens: numberSchema("Compaction max input token metadata."),
              prune: booleanSchema("Compaction prune flag."),
              reserved: numberSchema("Reserved token metadata."),
            },
          }),
        },
      }),
    }),
  },
  {
    sourceFile: "mcp.yaml",
    schemaFileName: "mcp.schema.json",
    title: "ai-share mcp.yaml",
    root: objectSchema({
      properties: {
        servers: objectSchema({
          additionalProperties: objectSchema({
            properties: {
              transport: enumStringSchema(["stdio", "http"], "MCP transport."),
              command: stringSchema("stdio MCP command."),
              args: stringArraySchema("stdio MCP command args."),
              env: objectSchema({
                propertyNames: { pattern: ENV_NAME_PATTERN },
                additionalProperties: stringSchema("Environment variable value or env reference."),
              }),
              url: stringSchema("HTTP MCP URL."),
              bearer_token_env_var: envNameSchema("Bearer token env var name."),
              oauth_client_id: stringSchema("OAuth client id."),
              oauth_resource: stringSchema("OAuth resource."),
            },
          }),
        }),
      },
    }),
  },
  {
    sourceFile: "env.yaml",
    schemaFileName: "env.schema.json",
    title: "ai-share env.yaml",
    root: objectSchema({
      properties: {
        variables: objectSchema({
          propertyNames: { pattern: ENV_FILE_NAME_PATTERN },
          additionalProperties: stringSchema("Codex .env variable value."),
        }),
      },
    }),
  },
  {
    sourceFile: "profile-eval.yaml",
    schemaFileName: "profile-eval.schema.json",
    title: "ai-share profile-eval.yaml",
    root: objectSchema({
      properties: {
        task_set: stringSchema("Profile evaluation task set id."),
        tasks: objectSchema({
          additionalProperties: objectSchema({
            required: ["prompt"],
            properties: {
              title: stringSchema("Human-readable task title."),
              category: stringSchema("Evaluation category label."),
              weight: positiveNumberSchema("Task weight in aggregate profile scoring."),
              prompt: stringSchema("Task prompt sent to Codex when --execute is enabled."),
              success_criteria: stringArraySchema("Manual success criteria for scoring."),
            },
          }),
        }),
        scoring: objectSchema({
          properties: {
            pass_score: positiveNumberSchema("Manual score threshold treated as passing."),
            dimensions: objectSchema({
              additionalProperties: objectSchema({
                properties: {
                  weight: positiveNumberSchema("Scoring dimension weight."),
                  description: stringSchema("Scoring dimension description."),
                },
              }),
            }),
          },
        }),
      },
    }),
  },
];

function stringSchema(description: string): Extract<SchemaNode, { type: "string" }> {
  return { type: "string", minLength: 1, description };
}

function envReferenceSchema(description: string): Extract<SchemaNode, { type: "string" }> {
  return { ...stringSchema(description), pattern: ENV_REFERENCE_PATTERN };
}

function envNameSchema(description: string): Extract<SchemaNode, { type: "string" }> {
  return { ...stringSchema(description), pattern: ENV_NAME_PATTERN };
}

function stringArraySchema(description: string): Extract<SchemaNode, { type: "array" }> {
  return {
    type: "array",
    items: stringSchema(description),
    description,
  };
}

function numberSchema(description: string): Extract<SchemaNode, { type: "number" }> {
  return { type: "number", description };
}

function positiveNumberSchema(description: string): Extract<SchemaNode, { type: "number" }> {
  return { ...numberSchema(description), exclusiveMinimum: 0 };
}

function booleanSchema(description: string): Extract<SchemaNode, { type: "boolean" }> {
  return { type: "boolean", description };
}

function objectSchema(input: Omit<ObjectSchemaNode, "type"> = {}): Extract<SchemaNode, { type: "object" }> {
  return { type: "object", ...input };
}

function enumStringSchema(values: readonly string[], description: string): Extract<SchemaNode, { type: "string" }> {
  return { ...stringSchema(description), enum: values };
}
