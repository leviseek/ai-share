export type OpenCodeConfig = {
  $schema: "https://opencode.ai/config.json";
  model: string;
  instructions: string[];
  skills: { paths: string[] };
  provider: Record<string, OpenCodeProvider>;
  agent: Record<string, OpenCodeAgent>;
  plugin?: string[];
  mcp?: Record<string, OpenCodeMcpServer>;
};

export type OpenCodeProvider = OpenCodeCompatibleProvider | OpenCodeNativeProvider;

export type OpenCodeCompatibleProvider = {
  name?: string;
  npm: "@ai-sdk/openai-compatible";
  options: {
    baseURL: string;
    apiKey: string;
  };
  models: Record<string, OpenCodeModel>;
};

export type OpenCodeNativeProvider = {
  whitelist: string[];
  options: {
    baseURL: string;
    apiKey: string;
  };
};

export type OpenCodeModel = {
  id: string;
  name: string;
  reasoning?: boolean;
  options?: { reasoningEffort: "low" | "medium" | "high" };
};

export type OpenCodeAgent = {
  description: string;
  mode: "primary" | "subagent" | "all";
  prompt: string;
  model?: string;
  options?: { reasoningEffort: "low" | "medium" | "high" };
};

export type OpenCodeMcpServer = OpenCodeLocalMcpServer | OpenCodeRemoteMcpServer;

export type OpenCodeLocalMcpServer = {
  type: "local";
  command: string[];
  environment?: Record<string, string>;
};

export type OpenCodeRemoteMcpServer = {
  type: "remote";
  url: string;
  headers?: Record<string, string>;
  oauth?: { clientId: string };
};
