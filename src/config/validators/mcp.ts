import type { McpYaml } from "../../types.ts";
import { isEnvReference } from "../env-ref.ts";
import type { ValidationError } from "./common.ts";
import { isSensitiveName, looksLikeSecretLiteral } from "../../security/secret-patterns.ts";
import { isRecord } from "./common.ts";

export function validateMcpServers(errors: ValidationError[], mcpConfig: McpYaml): void {
  const mcpServers = isRecord(mcpConfig.servers) ? mcpConfig.servers : {};
  for (const [serverId, server] of Object.entries(mcpServers)) {
    if (!isRecord(server)) continue;
    const source = server;
    const isHttp = source.transport === "http" || source.url !== undefined;
    if (isHttp) {
      validateHttpMcpServer(errors, serverId, source);
      continue;
    }

    validateStdioMcpServer(errors, serverId, source);
  }
}

function validateHttpMcpServer(
  errors: ValidationError[],
  serverId: string,
  server: Readonly<Record<string, unknown>>,
): void {
  const url = typeof server.url === "string" ? server.url : undefined;
  if (!url) {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.url`,
      message: `HTTP MCP server '${serverId}' 缺少 url 字段`,
    });
  } else {
    for (const queryKey of sensitiveUrlQueryKeys(url)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.url`,
        message: `HTTP MCP server '${serverId}' 的 url 不应包含敏感查询参数 '${queryKey}'，请改用 bearer_token_env_var 或 OAuth 环境变量`,
      });
    }
  }

  if (server.command !== undefined) {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.command`,
      message: `HTTP MCP server '${serverId}' 不应配置 command 字段`,
    });
  }
}

function validateStdioMcpServer(
  errors: ValidationError[],
  serverId: string,
  server: Readonly<Record<string, unknown>>,
): void {
  if (typeof server.command !== "string" || !server.command) {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.command`,
      message: `stdio MCP server '${serverId}' 缺少 command 字段`,
    });
  }

  if (server.url !== undefined) {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.url`,
      message: `stdio MCP server '${serverId}' 不应配置 url 字段`,
    });
  }

  validateMcpEnv(errors, serverId, server.env);
}

function validateMcpEnv(errors: ValidationError[], serverId: string, env: unknown): void {
  if (!isRecord(env)) return;

  for (const [envKey, envValue] of Object.entries(env)) {
    if (typeof envValue !== "string") continue;

    if (isSensitiveName(envKey) && !isEnvReference(envValue)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.env.${envKey}`,
        message: `stdio MCP server '${serverId}' 的敏感 env '${envKey}' 必须使用 \${ENV_NAME} 占位，不允许写入明文`,
      });
    }

    if (looksLikeSecretLiteral(envValue)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.env.${envKey}`,
        message: `stdio MCP server '${serverId}' 的 env '${envKey}' 疑似包含明文 secret，请改为 \${ENV_NAME} 环境变量引用`,
      });
    }
  }
}

function sensitiveUrlQueryKeys(url: string): string[] {
  try {
    return [...new URL(url).searchParams.keys()].filter(isSensitiveName);
  } catch {
    return [];
  }
}
