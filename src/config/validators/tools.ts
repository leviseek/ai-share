import { containsKnownSecretToken } from "../../security/secret-patterns.ts";
import { TOOL_SYSTEM_PACKAGE_PATTERN } from "../schema-spec.ts";
import type { ValidationError } from "./common.ts";
import { isRecord } from "./common.ts";

const SYSTEM_PACKAGE_PATTERN = new RegExp(TOOL_SYSTEM_PACKAGE_PATTERN);

export function validateTools(errors: ValidationError[], toolsConfig: unknown): void {
  if (!isRecord(toolsConfig) || !Array.isArray(toolsConfig.tools)) return;

  const seenIds = new Set<string>();
  toolsConfig.tools.forEach((tool, index) => {
    if (!isRecord(tool)) return;

    if (typeof tool.id === "string") {
      if (tool.id === "superpowers") {
        errors.push({
          file: "tools.yaml",
          path: `tools[${index}].id`,
          message: `tools[${index}].id 是 Superpowers 保留 id，不得作为普通工具 id`,
        });
      }
      if (seenIds.has(tool.id)) {
        errors.push({
          file: "tools.yaml",
          path: `tools[${index}].id`,
          message: `tools 包含重复工具 id '${tool.id}'`,
        });
      } else {
        seenIds.add(tool.id);
      }
    }

    for (const field of ["id", "label", "package", "executable", "version"] as const) {
      const value = tool[field];
      if (typeof value === "string" && containsKnownSecretToken(value)) {
        errors.push({
          file: "tools.yaml",
          path: `tools[${index}].${field}`,
          message: `tools[${index}].${field} 格式不符合要求`,
        });
      }
    }

    if (typeof tool.package !== "string" || !isRecord(tool.platforms)) return;
    for (const [platform, platformConfig] of Object.entries(tool.platforms)) {
      if (
        isRecord(platformConfig) &&
        (platformConfig.manager === "scoop" || platformConfig.manager === "brew") &&
        !SYSTEM_PACKAGE_PATTERN.test(tool.package)
      ) {
        const path = `tools[${index}].platforms.${platform}.manager/package`;
        errors.push({
          file: "tools.yaml",
          path,
          message: `${path} 不支持 scoped npm package`,
        });
      }
    }
  });
}
