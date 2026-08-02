export const ENV_REFERENCE_PATTERN = "^\\$\\{[A-Z_][A-Z0-9_]*\\}$";
export const ENV_NAME_PATTERN = "^[A-Z_][A-Z0-9_]*$";
export const ENV_FILE_NAME_PATTERN = "^[A-Za-z_][A-Za-z0-9_]*$";
export const CONFIG_ID_PATTERN = "^[a-z0-9]+(?:[.-][a-z0-9]+)*$";
export const AGENT_ID_PATTERN = "^[a-z][a-z0-9_-]*$";
export const SEMVER_PATTERN = "^\\d+\\.\\d+\\.\\d+$";
export const HTTPS_URL_PATTERN = "^https://[^\\s]+$";
export const HTTP_URL_PATTERN = "^https?://[^\\s]+$";

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
  | "mcp.yaml"
  | "env.yaml"
  | "agents.yaml";

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

export const YAML_SCHEMA_SPECS: readonly YamlSchemaSpec[] = [
  {
    sourceFile: "global.yaml",
    schemaFileName: "global.schema.json",
    title: "ai-share global.yaml",
    root: objectSchema({
      required: ["model", "provider"],
      properties: {
        model: patternStringSchema(CONFIG_ID_PATTERN, "Default OpenCode model id from models.yaml."),
        provider: patternStringSchema(CONFIG_ID_PATTERN, "Default provider id from provider.yaml."),
        opencode_min_version: patternStringSchema(SEMVER_PATTERN, "Minimum OpenCode CLI version checked by ai:doctor."),
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
          propertyNames: { pattern: CONFIG_ID_PATTERN },
          additionalProperties: objectSchema({
            required: ["base_url", "api_key"],
            properties: {
              name: stringSchema("Human-readable provider name."),
              base_url: patternStringSchema(HTTPS_URL_PATTERN, "OpenAI-compatible HTTPS base URL."),
              api_key: envReferenceSchema("Environment variable reference."),
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
      propertyNames: { pattern: CONFIG_ID_PATTERN },
      additionalProperties: objectSchema({
        required: ["model_name"],
        properties: {
          model_name: stringSchema("Upstream model name sent to provider."),
          reasoning_effort: enumStringSchema(["low", "medium", "high"], "OpenCode model reasoning effort."),
        },
      }),
    }),
  },
  {
    sourceFile: "mcp.yaml",
    schemaFileName: "mcp.schema.json",
    title: "ai-share mcp.yaml",
    root: objectSchema({
      required: ["servers"],
      properties: {
        servers: objectSchema({
          propertyNames: { pattern: CONFIG_ID_PATTERN },
          additionalProperties: objectSchema({
            properties: {
              transport: enumStringSchema(["stdio", "http"], "MCP transport."),
              command: stringSchema("stdio MCP command."),
              args: stringArraySchema("stdio MCP command args."),
              env: objectSchema({
                propertyNames: { pattern: ENV_NAME_PATTERN },
                additionalProperties: stringSchema("Environment variable value or env reference."),
              }),
              url: patternStringSchema(HTTP_URL_PATTERN, "HTTP MCP URL."),
              bearer_token_env_var: envNameSchema("Bearer token env var name."),
              oauth_client_id: stringSchema("OAuth client id."),
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
      required: ["variables"],
      properties: {
        variables: objectSchema({
          propertyNames: { pattern: ENV_FILE_NAME_PATTERN },
          additionalProperties: stringSchema("OpenCode launcher environment value."),
        }),
      },
    }),
  },
  {
    sourceFile: "agents.yaml",
    schemaFileName: "agents.schema.json",
    title: "ai-share agents.yaml",
    root: objectSchema({
      required: ["agents"],
      properties: {
        agents: objectSchema({
          propertyNames: { pattern: AGENT_ID_PATTERN },
          additionalProperties: objectSchema({
            required: ["description", "mode", "prompt"],
            properties: {
              description: stringSchema("Human-facing guidance for when OpenCode should use the agent."),
              model: patternStringSchema(CONFIG_ID_PATTERN, "Model id from models.yaml."),
              reasoning_effort: enumStringSchema(["low", "medium", "high"], "OpenCode reasoning effort override."),
              mode: enumStringSchema(["primary", "subagent", "all"], "OpenCode agent mode."),
              prompt: stringSchema("Core prompt that defines the agent behavior."),
            },
          }),
        }),
      },
    }),
  },
];

function stringSchema(description: string): Extract<SchemaNode, { type: "string" }> {
  return { type: "string", minLength: 1, description };
}

function patternStringSchema(pattern: string, description: string): Extract<SchemaNode, { type: "string" }> {
  return { ...stringSchema(description), pattern };
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

function objectSchema(input: Omit<ObjectSchemaNode, "type"> = {}): Extract<SchemaNode, { type: "object" }> {
  return { type: "object", additionalProperties: false, ...input };
}

function enumStringSchema(values: readonly string[], description: string): Extract<SchemaNode, { type: "string" }> {
  return { ...stringSchema(description), enum: values };
}
