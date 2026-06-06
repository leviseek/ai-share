import type { McpYaml } from "../../types.ts";
import type { ValidationError } from "./common.ts";
import {
  isEnvName,
  isEnvReference,
  isRecord,
  isSensitiveName,
  isStringArray,
  looksLikeSecretLiteral,
  validateOptionalString,
} from "./common.ts";

export function validateMcpServers(errors: ValidationError[], mcpConfig: McpYaml): void {
  const mcpServers = mcpConfig.servers;
  if (mcpServers !== undefined && !isRecord(mcpServers)) {
    errors.push({
      file: "mcp.yaml",
      path: "servers",
      message: "MCP servers 必须是对象",
    });
  }
  for (const [serverId, server] of Object.entries(isRecord(mcpServers) ? mcpServers : {})) {
    if (!isRecord(server)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}`,
        message: `MCP server '${serverId}' 必须是对象`,
      });
      continue;
    }
    validateMcpServerShape(errors, serverId, server);
    const isHttp = server.transport === "http" || server.url !== undefined;
    if (isHttp) {
      validateHttpMcpServer(errors, serverId, server);
      continue;
    }

    validateStdioMcpServer(errors, serverId, server);
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
  const bearerTokenEnvVar = server.bearer_token_env_var;
  if (bearerTokenEnvVar !== undefined && (typeof bearerTokenEnvVar !== "string" || !isEnvName(bearerTokenEnvVar))) {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.bearer_token_env_var`,
      message: `HTTP MCP server '${serverId}' 的 bearer_token_env_var 必须是环境变量名`,
    });
  }
}

function validateStdioMcpServer(
  errors: ValidationError[],
  serverId: string,
  server: Readonly<Record<string, unknown>>,
): void {
  const command = typeof server.command === "string" ? server.command : undefined;
  if (!command) {
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

function validateMcpServerShape(
  errors: ValidationError[],
  serverId: string,
  server: Readonly<Record<string, unknown>>,
): void {
  const transport = server.transport;
  if (transport !== undefined && transport !== "stdio" && transport !== "http") {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.transport`,
      message: `MCP server '${serverId}' 的 transport 必须是 stdio 或 http`,
    });
  }
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.command`, server.command);
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.url`, server.url);
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.bearer_token_env_var`, server.bearer_token_env_var);
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.oauth_client_id`, server.oauth_client_id);
  validateOptionalString(errors, "mcp.yaml", `servers.${serverId}.oauth_resource`, server.oauth_resource);
  if (server.args !== undefined && !isStringArray(server.args)) {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.args`,
      message: `MCP server '${serverId}' 的 args 必须是字符串数组`,
    });
  }
}

function validateMcpEnv(errors: ValidationError[], serverId: string, env: unknown): void {
  if (env === undefined) return;
  if (!isRecord(env)) {
    errors.push({
      file: "mcp.yaml",
      path: `servers.${serverId}.env`,
      message: `stdio MCP server '${serverId}' 的 env 必须是对象`,
    });
    return;
  }

  for (const [envKey, envValue] of Object.entries(env)) {
    if (!isEnvName(envKey)) {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.env.${envKey}`,
        message: `stdio MCP server '${serverId}' 的 env key '${envKey}' 必须是环境变量名`,
      });
    }

    if (typeof envValue !== "string") {
      errors.push({
        file: "mcp.yaml",
        path: `servers.${serverId}.env.${envKey}`,
        message: `stdio MCP server '${serverId}' 的 env '${envKey}' 必须是字符串`,
      });
      continue;
    }

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
