import { YAML_SCHEMA_SPECS, type SchemaNode, type YamlSchemaSourceFile } from "../schema-spec.ts";
import type { ValidationError } from "./common.ts";
import { isRecord } from "./common.ts";

export type YamlSchemaInput = Record<YamlSchemaSourceFile, unknown>;

export function validateYamlSchemaShapes(input: YamlSchemaInput): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const spec of YAML_SCHEMA_SPECS) {
    validateNode(errors, spec.sourceFile, spec.root, input[spec.sourceFile], spec.rootDisplayPath ?? "");
  }

  return errors;
}

function validateNode(
  errors: ValidationError[],
  file: YamlSchemaSourceFile,
  node: SchemaNode,
  value: unknown,
  path: string,
): void {
  if (node.type === "string") {
    validateStringNode(errors, file, node, value, path);
    return;
  }

  if (node.type === "number" || node.type === "integer") {
    validateNumberNode(errors, file, node, value, path);
    return;
  }

  if (node.type === "boolean") {
    if (typeof value !== "boolean") {
      pushError(errors, file, path, `${displayPath(path)} 必须是布尔值`);
    }
    return;
  }

  if (node.type === "array") {
    if (!Array.isArray(value)) {
      pushError(errors, file, path, `${displayPath(path)} 必须是数组`);
      return;
    }
    value.forEach((item, index) => validateNode(errors, file, node.items, item, `${path}[${index}]`));
    return;
  }

  validateObjectNode(errors, file, node, value, path);
}

function validateStringNode(
  errors: ValidationError[],
  file: YamlSchemaSourceFile,
  node: Extract<SchemaNode, { type: "string" }>,
  value: unknown,
  path: string,
): void {
  if (typeof value !== "string") {
    pushError(errors, file, path, `${displayPath(path)} 必须是${node.minLength === 1 ? "非空" : ""}字符串`);
    return;
  }

  if (node.minLength !== undefined && value.length < node.minLength) {
    pushError(errors, file, path, `${displayPath(path)} 必须是非空字符串`);
    return;
  }

  if (node.enum !== undefined && !node.enum.includes(value)) {
    pushError(errors, file, path, `${displayPath(path)} 必须是 ${formatEnum(node.enum)}`);
    return;
  }

  if (node.pattern !== undefined && !new RegExp(node.pattern).test(value)) {
    pushError(errors, file, path, `${displayPath(path)} 格式不符合要求`);
  }
}

function validateNumberNode(
  errors: ValidationError[],
  file: YamlSchemaSourceFile,
  node: Extract<SchemaNode, { type: "number" | "integer" }>,
  value: unknown,
  path: string,
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushError(errors, file, path, `${displayPath(path)} 必须是${node.type === "integer" ? "整数" : "数字"}`);
    return;
  }

  if (node.type === "integer" && !Number.isInteger(value)) {
    pushError(errors, file, path, `${displayPath(path)} 必须是整数`);
    return;
  }

  if (node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) {
    pushError(errors, file, path, `${displayPath(path)} 必须大于 ${node.exclusiveMinimum}`);
    return;
  }

  if (node.minimum !== undefined && value < node.minimum) {
    pushError(errors, file, path, `${displayPath(path)} 必须大于等于 ${node.minimum}`);
  }
}

function validateObjectNode(
  errors: ValidationError[],
  file: YamlSchemaSourceFile,
  node: Extract<SchemaNode, { type: "object" }>,
  value: unknown,
  path: string,
): void {
  if (!isRecord(value)) {
    pushError(errors, file, path, `${displayPath(path)} 必须是对象`);
    return;
  }

  for (const requiredKey of node.required ?? []) {
    if (value[requiredKey] === undefined || value[requiredKey] === null) {
      const requiredPath = appendPath(path, requiredKey);
      pushError(errors, file, requiredPath, `缺少 ${displayPath(requiredPath)} 字段`);
    }
  }

  for (const [propertyName, propertyNode] of Object.entries(node.properties ?? {})) {
    if (value[propertyName] !== undefined) {
      validateNode(errors, file, propertyNode, value[propertyName], appendPath(path, propertyName));
    }
  }

  if (node.propertyNames !== undefined) {
    validatePropertyNames(errors, file, node.propertyNames.pattern, value, path);
  }

  validateAdditionalProperties(errors, file, node, value, path);
}

function validatePropertyNames(
  errors: ValidationError[],
  file: YamlSchemaSourceFile,
  pattern: string,
  value: Record<string, unknown>,
  path: string,
): void {
  const regex = new RegExp(pattern);
  for (const propertyName of Object.keys(value)) {
    if (!regex.test(propertyName)) {
      const propertyPath = appendPath(path, propertyName);
      pushError(errors, file, propertyPath, `${displayPath(path)} key '${propertyName}' 格式不符合要求`);
    }
  }
}

function validateAdditionalProperties(
  errors: ValidationError[],
  file: YamlSchemaSourceFile,
  node: Extract<SchemaNode, { type: "object" }>,
  value: Record<string, unknown>,
  path: string,
): void {
  if (node.additionalProperties === undefined || node.additionalProperties === true) return;
  const knownProperties = new Set(Object.keys(node.properties ?? {}));

  for (const [propertyName, propertyValue] of Object.entries(value)) {
    if (knownProperties.has(propertyName)) continue;

    const propertyPath = appendPath(path, propertyName);
    if (node.additionalProperties === false) {
      pushError(errors, file, propertyPath, `${displayPath(propertyPath)} 是未知字段`);
      continue;
    }
    validateNode(errors, file, node.additionalProperties, propertyValue, propertyPath);
  }
}

function appendPath(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

function displayPath(path: string): string {
  return path || "根配置";
}

function formatEnum(values: readonly string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join("、")} 或 ${values.at(-1)}`;
}

function pushError(errors: ValidationError[], file: YamlSchemaSourceFile, path: string, message: string): void {
  errors.push({
    file,
    path: displayPath(path),
    message,
  });
}
