import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import type { AiNodeSummaryCache, AiNodeSummaryModelConfig } from "./ai-summary.ts";
import {
  buildPromptInput,
  createAiNodeSummaryCache,
  generateAiNodeSummary,
  resolveAiNodeSummaryModelConfig,
} from "./ai-summary.ts";
import type { StudioSnapshot } from "./data.ts";

const now = "2026-07-02T00:00:00.000Z";

describe("Studio AI node summary", () => {
  test("generates and reuses persisted cached summaries", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "rie-ai-summary-"));
    const cache = createAiNodeSummaryCache(repoRoot);
    let calls = 0;

    await writeFixtureFiles(repoRoot);
    const first = await generateAiNodeSummary({
      snapshot: fixtureSnapshot(),
      nodeId: "codefile:src/main.ts",
      cache,
      repoRoot,
      modelConfig: modelConfig(),
      now,
      fetchImpl: () => {
        calls++;
        return Promise.resolve(
          jsonResponse({
            choices: [{ message: { content: "main.ts 负责应用入口编排，连接 src 目录并暴露启动逻辑。" } }],
          }),
        );
      },
    });
    const second = await generateAiNodeSummary({
      snapshot: fixtureSnapshot(),
      nodeId: "codefile:src/main.ts",
      cache,
      repoRoot,
      modelConfig: modelConfig(),
      now,
      fetchImpl: () => Promise.reject(new Error("fetch should not be called on cache hit")),
    });

    expect(calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.summary).toBe(first.summary);
    expect(second.cacheKey).toBe(first.cacheKey);
    expect(first.overview.dependencyCount).toBe(1);
    expect(first.overview.dependentCount).toBe(1);
    expect(first.overview.author).toBe("Levi");
    expect(first.details.exposed.some((symbol) => symbol.name === "main")).toBe(true);
    expect(first.details.exposed.find((symbol) => symbol.name === "main")?.typeInference).toContain("()");
    expect(second.fileContext?.path).toBe("src/main.ts");
    expect(second.fileContext?.snippets.length).toBeGreaterThan(0);
  });

  test("uses structured overview and exposed API details from JSON responses", async () => {
    const result = await generateAiNodeSummary({
      snapshot: fixtureSnapshot(),
      nodeId: "codefile:src/main.ts",
      cache: memoryCache(),
      modelConfig: modelConfig(),
      now,
      fetchImpl: () =>
        Promise.resolve(
          jsonResponse({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "main.ts 是应用入口。",
                    overview: {
                      intent: "应用入口编排。",
                      dependencyCount: 1,
                      dependentCount: 1,
                      date: now,
                      author: "Levi",
                    },
                    details: {
                      description: "main.ts 暴露 main() 供启动流程调用。",
                      exposed: [
                        {
                          name: "main",
                          kind: "function",
                          typeInference: "() => string",
                          implemented: true,
                          intent: "启动应用。",
                          inputs: "none",
                          outputs: "helper() 的返回值",
                          usage: "import { main } from './main';",
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          }),
        ),
    });

    expect(result.overview.intent).toBe("应用入口编排。");
    expect(result.overview.date).toBe(now);
    expect(result.details.description).toContain("main()");
    expect(result.details.exposed[0]?.inputs).toBe("none");
    expect(result.details.exposed[0]?.typeInference).toBe("() => string");
    expect(result.details.exposed[0]?.implemented).toBe(true);
  });
  test("parses DeepSeek JSON responses with raw newlines inside strings", async () => {
    const result = await generateAiNodeSummary({
      snapshot: fixtureSnapshot(),
      nodeId: "codefile:src/main.ts",
      cache: memoryCache(),
      modelConfig: modelConfig(),
      now,
      fetchImpl: () =>
        Promise.resolve(
          jsonResponse({
            choices: [
              {
                message: {
                  content: `{
  "summary": "main.ts 是应用入口。",
  "overview": {
    "intent": "应用入口编排。

包含启动逻辑。",
    "dependencyCount": 1,
    "dependentCount": 1,
    "date": "${now}",
    "author": "Levi"
  },
  "details": {
    "description": "第一段说明。

第二段说明。",
    "exposed": [
      {
        "name": "main",
        "kind": "function",
        "typeInference": "() => string",
        "implemented": true,
        "intent": "启动应用。

返回 helper 输出。",
        "inputs": "none",
        "outputs": "string",
        "usage": "import { main } from './main';"
      }
    ]
  }
}`,
                },
              },
            ],
          }),
        ),
    });

    expect(result.summary).toBe("main.ts 是应用入口。");
    expect(result.summary).not.toContain('"overview"');
    expect(result.overview.intent).toContain("应用入口编排");
    expect(result.details.description).toContain("第二段说明");
    expect(result.details.exposed[0]?.name).toBe("main");
    expect(result.details.exposed[0]?.intent).toContain("返回 helper 输出");
  });

  test("extracts display fields from truncated DeepSeek JSON responses", async () => {
    const result = await generateAiNodeSummary({
      snapshot: fixtureSnapshot(),
      nodeId: "codefile:src/main.ts",
      cache: memoryCache(),
      modelConfig: modelConfig(),
      now,
      fetchImpl: () =>
        Promise.resolve(
          jsonResponse({
            choices: [
              {
                message: {
                  content: `{
  "summary": "该模块实现了内购商店弹窗LayerPop界面及iapPurchase对象，支持显示价格、发起购买、恢复购买等功能。",
  "overview": {
    "intent": "提供内购商店弹窗及IAP购买处理逻辑",
    "dependencyCount": 20,
    "dependentCount": 1,
    "date": "2026-07-03",
    "author": "unknown"
  },
  "details": {
    "description": "定义了LayerPop类用于管理商店弹窗的显示和交互，包括按钮布局、价格展示、购买回调等。\n\n同时包含了iapPurchase对象的startRequest和restorePurchase方法。",
    "exposed": [
      { "name": "LayerPop.ctor", "kind": "function", "inputs": "`,
                },
              },
            ],
          }),
        ),
    });

    expect(result.summary).toContain("内购商店弹窗");
    expect(result.summary).not.toContain('"overview"');
    expect(result.overview.intent).toBe("提供内购商店弹窗及IAP购买处理逻辑");
    expect(result.overview.dependencyCount).toBe(20);
    expect(result.details.description).toContain("LayerPop类");
    expect(result.details.description).not.toContain('"exposed"');
  });
  test("changes cache key when model changes", async () => {
    const snapshot = fixtureSnapshot();
    const first = await generateWithMemoryCache(snapshot, "gpt-5.5");
    const second = await generateWithMemoryCache(snapshot, "gpt-5.4-mini");

    expect(first.cacheKey).not.toBe(second.cacheKey);
  });

  test("resolves AI summary model to direct DeepSeek API", () => {
    const config = resolveAiNodeSummaryModelConfig({ DEEPSEEK_API_KEY: "test-deepseek-key" }, []);

    expect(config.modelId).toBe("deepseek-v4-pro");
    expect(config.model.model_name).toBe("deepseek-v4-pro");
    expect(config.providerId).toBe("deepseek");
    expect(config.provider.base_url).toBe("https://api.deepseek.com/v1");
    expect(config.apiKey).toBe("test-deepseek-key");
  });

  test("requires DeepSeek API key for AI summaries", () => {
    expect(() => resolveAiNodeSummaryModelConfig({}, [])).toThrow("缺少环境变量：DEEPSEEK_API_KEY");
  });

  test("keeps AI summaries longer than local display summaries without truncating output", async () => {
    const longSummary = `main.ts ${"负责协调 Lua、TypeScript 与配置节点的上下文分析。".repeat(80)}`;
    const result = await generateAiNodeSummary({
      snapshot: fixtureSnapshot(),
      nodeId: "codefile:src/main.ts",
      cache: memoryCache(),
      modelConfig: modelConfig(),
      now,
      fetchImpl: () => Promise.resolve(jsonResponse({ choices: [{ message: { content: longSummary } }] })),
    });

    expect(result.summary).toBe(longSummary);
  });

  test("adds safe file snippets to prompt input for file-class nodes", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "rie-ai-summary-"));
    await writeFixtureFiles(repoRoot);
    const prompt = await buildPromptInput(fixtureSnapshot(), "codefile:src/main.ts", repoRoot);

    expect(prompt.fileContext?.path).toBe("src/main.ts");
    expect(prompt.fileContext?.snippets.some((snippet) => snippet.text.includes("export function main"))).toBe(true);
    expect(JSON.stringify(prompt.fileContext)).not.toContain("abc123");
    expect(JSON.stringify(prompt.fileContext)).toContain("<redacted>");
  });

  test("adds Lua high-signal snippets for Lua code files", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "rie-ai-summary-"));
    await writeFixtureFiles(repoRoot);
    const prompt = await buildPromptInput(fixtureSnapshot(), "codefile:src/init.lua", repoRoot);

    expect(prompt.fileContext?.language).toBe("lua");
    expect(prompt.fileContext?.snippets.some((snippet) => snippet.text.includes("require('src.util')"))).toBe(true);
    expect(prompt.fileContext?.snippets.some((snippet) => snippet.text.includes("function M.run"))).toBe(true);
  });

  test("changes cache key when file content changes", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "rie-ai-summary-"));
    await writeFixtureFiles(repoRoot);
    const first = await generateWithMemoryCache(fixtureSnapshot(), "gpt-5.5", repoRoot);
    await writeFile(join(repoRoot, "src", "main.ts"), "export function main() { return 'changed'; }\n");
    const second = await generateWithMemoryCache(fixtureSnapshot(), "gpt-5.5", repoRoot);

    expect(first.cacheKey).not.toBe(second.cacheKey);
  });

  test("does not read file content for non-file node types", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "rie-ai-summary-"));
    await writeFixtureFiles(repoRoot);
    const prompt = await buildPromptInput(fixtureSnapshot(), "dir:src", repoRoot);

    expect(prompt.fileContext).toBeUndefined();
  });

  test("skips file context when node path escapes repo root", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "rie-ai-summary-"));
    const snapshot = fixtureSnapshot();
    const node = snapshot.nodes.find((item) => item.id === "config:config.yaml");
    if (node !== undefined) node.path = "../outside.yaml";
    const prompt = await buildPromptInput(snapshot, "config:config.yaml", repoRoot);

    expect(prompt.fileContext?.diagnostics).toContain("file context skipped: path outside repo");
    expect(prompt.fileContext?.snippets).toHaveLength(0);
  });

  test("redacts secret-like metadata before composing prompt input", async () => {
    const prompt = await buildPromptInput(fixtureSnapshot(), "config:config.yaml");

    expect(JSON.stringify(prompt)).not.toContain("should-not-leak");
    expect(prompt.node.metadata.api_key).toBeUndefined();
  });

  test("reports missing nodes with a Chinese error", async () => {
    try {
      await generateAiNodeSummary({
        snapshot: fixtureSnapshot(),
        nodeId: "missing",
        cache: memoryCache(),
        modelConfig: modelConfig(),
        fetchImpl: () => Promise.resolve(jsonResponse({ choices: [] })),
      });
      throw new Error("expected missing node failure");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error instanceof Error ? error.message : "").toContain("未找到节点");
    }
  });
});

async function generateWithMemoryCache(snapshot: StudioSnapshot, modelId: string, repoRoot?: string) {
  return await generateAiNodeSummary({
    snapshot,
    nodeId: "codefile:src/main.ts",
    cache: memoryCache(),
    ...(repoRoot === undefined ? {} : { repoRoot }),
    modelConfig: modelConfig(modelId),
    now,
    fetchImpl: () => Promise.resolve(jsonResponse({ choices: [{ message: { content: "AI 生成的节点总结。" } }] })),
  });
}

async function writeFixtureFiles(repoRoot: string): Promise<void> {
  await mkdir(join(repoRoot, "src"), { recursive: true });
  await writeFile(
    join(repoRoot, "src", "main.ts"),
    [
      "import { helper } from './helper';",
      "const token = abc123;",
      "export function main() {",
      "  return helper();",
      "}",
    ].join("\n"),
  );
  await writeFile(join(repoRoot, "config.yaml"), "api_key: should-not-leak\nprovider: demo\n");
  await writeFile(
    join(repoRoot, "src", "init.lua"),
    "local util = require('src.util')\nlocal function local_helper() return util.value end\nfunction M.run() return local_helper() end\n",
  );
}

function fixtureSnapshot(): StudioSnapshot {
  return {
    objects: [],
    nodes: [
      {
        id: "dir:src",
        objectId: "dir:src",
        type: "Directory",
        label: "src",
        tags: [],
        updatedAt: now,
        hash: "dir-hash",
        metadata: {},
      },
      {
        id: "codefile:src/main.ts",
        objectId: "codefile:src/main.ts",
        type: "CodeFile",
        label: "main.ts",
        summary: "本地推理摘要。",
        tags: ["entrypoint"],
        path: "src/main.ts",
        language: "typescript",
        updatedAt: now,
        metadata: { lineCount: 12, author: "Levi" },
        hash: "main-hash",
      },
      {
        id: "config:config.yaml",
        objectId: "config:config.yaml",
        type: "Config",
        label: "config.yaml",
        tags: [],
        path: "config.yaml",
        updatedAt: now,
        metadata: { api_key: "should-not-leak", provider: "demo" },
        hash: "config-hash",
      },
      {
        id: "codefile:src/init.lua",
        objectId: "codefile:src/init.lua",
        type: "CodeFile",
        label: "init.lua",
        tags: ["lua"],
        path: "src/init.lua",
        language: "lua",
        updatedAt: now,
        metadata: { lineCount: 3 },
        hash: "lua-hash",
      },
    ],
    edges: [
      { id: "edge:dir-main", from: "dir:src", to: "codefile:src/main.ts", type: "contains", metadata: {} },
      {
        id: "edge:main-config",
        from: "codefile:src/main.ts",
        to: "config:config.yaml",
        type: "configures",
        metadata: {},
      },
    ],
  };
}

function modelConfig(modelId = "gpt-5.5"): AiNodeSummaryModelConfig {
  return {
    modelId,
    model: {
      provider: "codexapis",
      provider_group: "gpt",
      model_name: modelId,
      temperature: 0.2,
      parameters: { reasoningEffort: "low" },
    },
    providerId: "codexapis",
    provider: { base_url: "https://example.test/v1", api_key: "${TEST_API_KEY}", timeout: 1000 },
    apiKey: "test-key",
  };
}

function memoryCache(): AiNodeSummaryCache {
  const values = new Map<string, Awaited<ReturnType<AiNodeSummaryCache["read"]>>>();
  return {
    read(cacheKey) {
      const value = values.get(cacheKey);
      return Promise.resolve(value === undefined ? undefined : { ...value, cached: true });
    },
    write(cacheKey, result) {
      values.set(cacheKey, { ...result, cached: false });
      return Promise.resolve();
    },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
