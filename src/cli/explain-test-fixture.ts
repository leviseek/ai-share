import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type ExplainTestFixture = {
  root: string;
  openCodeDir: string;
  home: string;
  env: Record<string, string | undefined>;
  cleanup(): void;
};

export function createExplainTestFixture(): ExplainTestFixture {
  const root = mkdtempSync(join(tmpdir(), "ai-share-explain-"));
  const openCodeDir = join(root, "opencode-home");
  const home = join(root, "home");

  write(join(root, "config", "global.yaml"), "model: model-a\nprovider: provider-a\n");
  write(
    join(root, "config", "provider.yaml"),
    [
      "providers:",
      "  provider-a:",
      "    name: Provider A",
      "    base_url: https://a.example.test/v1",
      "    api_key: ${A_API_KEY}",
      "  provider-b:",
      "    name: Provider B",
      "    base_url: https://b.example.test/v1",
      "    api_key: ${B_API_KEY}",
      "",
    ].join("\n"),
  );
  write(
    join(root, "config", "local", "provider.yaml"),
    "providers:\n  provider-a:\n    base_url: https://local-a.example.test/v1\n",
  );
  write(join(root, "config", "models.yaml"), "model-a:\n  model_name: upstream-model\n  reasoning_effort: medium\n");
  write(join(root, "config", "mcp.yaml"), "servers:\n  filesystem:\n    transport: stdio\n    command: bunx\n");
  write(join(root, "config", "env.yaml"), "variables: {}\n");
  write(
    join(root, "config", "agents.yaml"),
    "agents:\n  commit:\n    description: Commit changes\n    model: model-a\n    reasoning_effort: low\n    mode: subagent\n    prompt: Create a commit.\n",
  );
  write(join(root, "config", "local", "env.yaml"), "variables:\n  HTTP_PROXY: http://127.0.0.1:7897\n");
  write(
    join(root, "memory", "architecture", "windows-transactions.md"),
    "# Windows 事务化写入\n\nWindows 文件事务应先 staging 再 promote。\n",
  );
  write(join(root, "memory", "distilled", "TEMPLATE.md"), "# Template\n");
  write(join(root, "memory", "distilled", "unconfirmed.md"), "---\nconfirmed_by_user: false\n---\n# Windows 未确认\n");
  write(join(root, "memory", "distilled", "malformed.md"), "# Windows malformed\n");

  return {
    root,
    openCodeDir,
    home,
    env: { HOME: home, OPENCODE_CONFIG_DIR: openCodeDir, A_API_KEY: "UNREADABLE_TEST_VALUE_42" },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
