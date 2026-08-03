import { YAML_SCHEMA_SPECS, type SchemaNode } from "./schema-spec.ts";

export type JsonSchema = Record<string, unknown>;

export function buildYamlJsonSchemas(): Record<string, JsonSchema> {
  return Object.fromEntries(
    YAML_SCHEMA_SPECS.map((spec) => [spec.schemaFileName, rootSchema(spec.title, schemaNodeToJsonSchema(spec.root))]),
  );
}

export function formatSchemaJson(schema: JsonSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

function rootSchema(title: string, body: JsonSchema): JsonSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title,
    ...body,
  };
}

function schemaNodeToJsonSchema(node: SchemaNode): JsonSchema {
  const base = {
    type: node.type,
    ...optionalDescription(node.description),
  };

  if (node.type === "string") {
    return {
      ...base,
      ...optionalNumber("minLength", node.minLength),
      ...optionalStringArray("enum", node.enum),
      ...optionalString("pattern", node.pattern),
    };
  }

  if (node.type === "number" || node.type === "integer") {
    return {
      ...base,
      ...optionalNumber("minimum", node.minimum),
      ...optionalNumber("exclusiveMinimum", node.exclusiveMinimum),
    };
  }

  if (node.type === "boolean") return base;

  if (node.type === "array") {
    return {
      ...base,
      items: schemaNodeToJsonSchema(node.items),
      ...optionalNumber("minItems", node.minItems),
      ...optionalBoolean("uniqueItems", node.uniqueItems),
    };
  }

  return {
    ...base,
    ...optionalStringArray("required", node.required),
    ...optionalProperties(node.properties),
    ...optionalAdditionalProperties(node.additionalProperties),
    ...optionalPropertyNames(node.propertyNames),
  };
}

function optionalDescription(description: string | undefined): JsonSchema {
  return description === undefined ? {} : { description };
}

function optionalNumber(key: string, value: number | undefined): JsonSchema {
  return value === undefined ? {} : { [key]: value };
}

function optionalBoolean(key: string, value: boolean | undefined): JsonSchema {
  return value === undefined ? {} : { [key]: value };
}

function optionalString(key: string, value: string | undefined): JsonSchema {
  return value === undefined ? {} : { [key]: value };
}

function optionalStringArray(key: string, value: readonly string[] | undefined): JsonSchema {
  return value === undefined ? {} : { [key]: [...value] };
}

function optionalProperties(properties: Record<string, SchemaNode> | undefined): JsonSchema {
  if (properties === undefined) return {};
  return {
    properties: Object.fromEntries(
      Object.entries(properties).map(([propertyName, property]) => [propertyName, schemaNodeToJsonSchema(property)]),
    ),
  };
}

function optionalAdditionalProperties(additionalProperties: SchemaNode | boolean | undefined): JsonSchema {
  if (additionalProperties === undefined) return {};
  if (typeof additionalProperties === "boolean") return { additionalProperties };
  return { additionalProperties: schemaNodeToJsonSchema(additionalProperties) };
}

function optionalPropertyNames(propertyNames: { pattern: string } | undefined): JsonSchema {
  return propertyNames === undefined ? {} : { propertyNames };
}
