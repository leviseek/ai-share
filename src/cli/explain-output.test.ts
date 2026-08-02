import { describe, expect, test } from "bun:test";
import { buildGenerationPreview } from "../generation-preview.ts";
import { buildExplainReport } from "./explain-report.ts";
import { renderExplainReport } from "./explain-output.ts";
import { createExplainTestFixture, write } from "./explain-test-fixture.ts";

describe("explain human output", () => {
  test("renders the five key sections with optional color and no sensitive values", async () => {
    const fixture = createExplainTestFixture();
    try {
      write(
        `${fixture.root}/config/plugins.yaml`,
        "plugins:\n  - opencode-zeta@1.2.3\n  - '@scope/opencode-alpha@next'\n  - superpowers@git+https://github.com/obra/superpowers.git\n",
      );
      const preview = await buildGenerationPreview({
        options: { force: false, provider: "provider-a", task: "Windows 事务化文件写入" },
        env: fixture.env,
        projectRoot: fixture.root,
        interactiveProviderSelection: false,
      });
      const report = buildExplainReport(preview);
      const plain = renderExplainReport(report, false);

      expect(plain).toContain("1. 输入决策");
      expect(plain).toContain("2. 配置来源");
      expect(plain).toContain("3. Memory 选择");
      expect(plain).toContain("4. 文件计划");
      expect(plain).toContain("5. 结果");
      expect(plain).toContain("A_API_KEY");
      expect(plain).toContain("force=false");
      expect(plain).toContain("Plugin ID:\n    - opencode-zeta\n    - @scope/opencode-alpha\n    - superpowers");
      expect(plain).not.toContain("1.2.3");
      expect(plain).not.toContain("github.com/obra/superpowers.git");
      expect(plain).not.toContain("http://127.0.0.1:7897");
      expect(plain).not.toContain("https://local-a.example.test/v1");
      expect(plain).not.toContain("\u001b[");
      expect(renderExplainReport(report, true)).toContain("\u001b[");
    } finally {
      fixture.cleanup();
    }
  });
});
